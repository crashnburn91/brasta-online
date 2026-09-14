-- Match awards run in the same transaction as authoritative match history.
-- Draft Season 1 is not activated by this migration.
alter table public.season_pass_seasons
  add column completion_xp integer not null default 25 check (completion_xp between 1 and 1000),
  add column win_xp integer not null default 25 check (win_xp between 0 and 1000),
  add column eligible_match_types text[] not null default array['ranked','private']::text[]
    check (cardinality(eligible_match_types) > 0 and eligible_match_types <@ array['ranked','private']::text[]),
  add constraint season_pass_scheduled_dates check (
    status = 'draft' or (starts_at is not null and ends_at is not null and ends_at > starts_at)
  );

-- No service caller needs to submit arbitrary amounts now. Only the match-ID
-- entry point below is exposed to the server; the old foundation RPC is retired.
revoke all on function public.brasta_award_season_pass_xp(uuid,text,text,uuid,text,integer,jsonb)
  from public, anon, authenticated, service_role;

create or replace function public.brasta_grant_season_pass_rewards(
  p_player_id uuid, p_season_id text default 'season_1'
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_xp integer;
  v_season public.season_pass_seasons%rowtype;
  v_premium boolean;
  v_inserted integer;
begin
  if p_player_id is null or p_season_id is null then return 0; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_player_id::text || ':' || p_season_id, 0));
  select * into v_season from public.season_pass_seasons where season_id = p_season_id;
  if not found or v_season.status = 'draft' or v_season.starts_at > now() then return 0; end if;
  -- Serialize grants with XP updates and late premium activation.
  select xp into v_xp from public.season_pass_progress
  where player_id = p_player_id and season_id = p_season_id for update;
  if not found then return 0; end if;
  select exists (select 1 from public.season_pass_entitlements
    where player_id = p_player_id and season_id = p_season_id and status = 'active') into v_premium;

  insert into public.season_pass_reward_ownership (player_id,season_id,reward_id,source)
  select p_player_id,r.season_id,r.reward_id,
    case when r.is_premium then 'premium_entitlement' else 'season_progress' end
  from public.season_pass_rewards r
  where r.season_id = p_season_id
    and r.tier <= least(v_season.tier_count, v_xp / v_season.xp_per_tier)
    and (not r.is_premium or v_premium)
  on conflict (player_id,reward_id) do nothing;
  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;
revoke all on function public.brasta_grant_season_pass_rewards(uuid,text) from public,anon,authenticated;
grant execute on function public.brasta_grant_season_pass_rewards(uuid,text) to service_role;

create or replace function public.brasta_award_season_pass_match(p_match_id uuid)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_match public.match_history%rowtype;
  v_season public.season_pass_seasons%rowtype;
  v_player record;
  v_expected_players integer;
  v_awarded integer := 0;
  v_added integer;
begin
  select * into v_match from public.match_history where id = p_match_id;
  if not found then return 0; end if;
  if v_match.completion_reason <> 'completed' or v_match.match_type = 'bot'
    or v_match.completed_at <= v_match.started_at or v_match.completed_at > now()
    or v_match.winner_team is null or v_match.score_a = v_match.score_b
    or greatest(v_match.score_a, v_match.score_b) < v_match.target_score
    or v_match.winner_team <> (case when v_match.score_a > v_match.score_b then 'A' else 'B' end)
  then return 0; end if;

  v_expected_players := case when v_match.mode = '2v2' then 4 else 2 end;
  -- Every seat must be a distinct signed-in player. Guest/bot seats and the same
  -- account in multiple seats do not produce Season XP for either team.
  if (select count(*) from public.match_history_players where match_id = p_match_id) <> v_expected_players
    or (select count(distinct player_id) from public.match_history_players where match_id = p_match_id) <> v_expected_players
    or (select count(*) from public.match_history_players where match_id = p_match_id and team = 'A') <> v_expected_players / 2
  then return 0; end if;

  for v_season in select * from public.season_pass_seasons
    where status in ('active','ended') and starts_at <= v_match.started_at
      and v_match.completed_at < ends_at and v_match.match_type = any(eligible_match_types)
    order by season_id
  loop
    for v_player in select player_id,team from public.match_history_players
      where match_id = p_match_id order by player_id
    loop
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_player.player_id::text || ':' || v_season.season_id, 0));
      -- RETURNING ensures progress uses only newly inserted ledger entries.
      with inserted as (
        insert into public.season_pass_xp_events
          (player_id,season_id,match_id,match_key,source,xp,metadata)
        select v_player.player_id,v_season.season_id,v_match.id,v_match.match_key,a.source,a.xp,
          jsonb_build_object('matchType',v_match.match_type,'completedAt',v_match.completed_at,'mode',v_match.mode)
        from (values ('match_completion',v_season.completion_xp),
          ('match_win',case when v_player.team = v_match.winner_team then v_season.win_xp else 0 end)) a(source,xp)
        where a.xp > 0
        on conflict (season_id,player_id,match_key,source) do nothing
        returning xp
      ) select coalesce(sum(xp),0)::integer into v_added from inserted;

      if v_added > 0 then
        insert into public.season_pass_progress (player_id,season_id,xp)
        values (v_player.player_id,v_season.season_id,least(v_season.tier_count * v_season.xp_per_tier,v_added))
        on conflict (player_id,season_id) do update set
          xp = least(v_season.tier_count * v_season.xp_per_tier,public.season_pass_progress.xp + excluded.xp),
          updated_at = now();
        v_awarded := v_awarded + v_added;
      end if;
      perform public.brasta_grant_season_pass_rewards(v_player.player_id,v_season.season_id);
    end loop;
  end loop;
  return v_awarded;
end;
$$;
revoke all on function public.brasta_award_season_pass_match(uuid) from public,anon,authenticated;
grant execute on function public.brasta_award_season_pass_match(uuid) to service_role;

create or replace function private.brasta_season_pass_after_match()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.brasta_award_season_pass_match(new.id);
  return new;
end;
$$;
revoke all on function private.brasta_season_pass_after_match() from public,anon,authenticated;
-- Deferral makes player seats available, regardless of the writer's insert order.
-- Failure rolls back the match and rewards together; replay never doubles XP.
create constraint trigger brasta_season_pass_match_award
after insert on public.match_history deferrable initially deferred
for each row execute function private.brasta_season_pass_after_match();

create or replace function private.brasta_season_pass_after_entitlement()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if new.status = 'active' then
    perform public.brasta_grant_season_pass_rewards(new.player_id,new.season_id);
  end if;
  return new;
end;
$$;
revoke all on function private.brasta_season_pass_after_entitlement() from public,anon,authenticated;
create trigger brasta_season_pass_entitlement_rewards
after insert or update of status on public.season_pass_entitlements
for each row execute function private.brasta_season_pass_after_entitlement();

notify pgrst, 'reload schema';
