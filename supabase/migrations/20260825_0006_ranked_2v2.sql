create or replace function public.brasta_create_ranked_2v2_match(
  p_match_id uuid,
  p_room_code text,
  p_target_score integer,
  p_players jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  player_row jsonb;
  player_count integer := 0;
begin
  if p_target_score not in (110, 220) then raise exception 'Invalid target score'; end if;
  if p_players is null or jsonb_typeof(p_players) <> 'array' or jsonb_array_length(p_players) <> 4 then
    raise exception 'Ranked 2v2 requires exactly four players';
  end if;

  insert into public.ranked_matches(id, room_code, mode, target_score, status)
  values (p_match_id, p_room_code, '2v2', p_target_score, 'active');

  for player_row in select value from jsonb_array_elements(p_players)
  loop
    player_count := player_count + 1;
    insert into public.ranked_match_players(match_id, player_id, seat, team)
    values (
      p_match_id,
      (player_row->>'playerId')::uuid,
      (player_row->>'seat')::smallint,
      case when (player_row->>'seat')::smallint in (1,3) then 'A' else 'B' end
    );
  end loop;

  if player_count <> 4 then raise exception 'Ranked 2v2 requires exactly four players'; end if;
end;
$$;

revoke all on function public.brasta_create_ranked_2v2_match(uuid,text,integer,jsonb) from public, anon, authenticated;
grant execute on function public.brasta_create_ranked_2v2_match(uuid,text,integer,jsonb) to service_role;

create or replace function public.brasta_finalize_ranked_2v2_match(
  p_match_id uuid,
  p_winner_team text,
  p_score_a integer,
  p_score_b integer,
  p_ratings jsonb,
  p_events jsonb default '[]'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  rating_row jsonb;
  before_row public.player_ratings%rowtype;
  player_uuid uuid;
  player_team text;
  player_won boolean;
  next_mu double precision;
  next_sigma double precision;
  next_ordinal double precision;
  processed integer := 0;
  event_row jsonb;
  seq_no integer := 0;
  match_is_active boolean := false;
begin
  if p_winner_team not in ('A','B') then raise exception 'Invalid winner'; end if;
  if p_ratings is null or jsonb_typeof(p_ratings) <> 'array' or jsonb_array_length(p_ratings) <> 4 then
    raise exception 'Ranked 2v2 finalization requires four ratings';
  end if;

  select true into match_is_active
  from public.ranked_matches
  where id = p_match_id and mode = '2v2' and status = 'active'
  for update;

  if coalesce(match_is_active, false) is false then return; end if;

  for rating_row in select value from jsonb_array_elements(p_ratings)
  loop
    player_uuid := (rating_row->>'playerId')::uuid;
    next_mu := (rating_row->>'mu')::double precision;
    next_sigma := (rating_row->>'sigma')::double precision;
    next_ordinal := (rating_row->>'ordinal')::double precision;

    select * into before_row
    from public.player_ratings
    where player_id = player_uuid and mode = '2v2'
    for update;

    if before_row.player_id is null then raise exception 'Missing 2v2 player rating'; end if;

    select team into player_team
    from public.ranked_match_players
    where match_id = p_match_id and player_id = player_uuid;

    if player_team is null then raise exception 'Player is not in this ranked match'; end if;
    player_won := player_team = p_winner_team;

    update public.player_ratings set
      mu = next_mu,
      sigma = next_sigma,
      ordinal = next_ordinal,
      games_played = games_played + 1,
      wins = wins + case when player_won then 1 else 0 end,
      losses = losses + case when player_won then 0 else 1 end,
      current_streak = case when player_won then current_streak + 1 else 0 end,
      best_streak = case when player_won then greatest(best_streak, current_streak + 1) else best_streak end,
      updated_at = now()
    where player_id = player_uuid and mode = '2v2';

    update public.ranked_match_players set
      result = case when player_won then 'win' else 'loss' end,
      mu_before = before_row.mu,
      sigma_before = before_row.sigma,
      ordinal_before = before_row.ordinal,
      mu_after = next_mu,
      sigma_after = next_sigma,
      ordinal_after = next_ordinal,
      rank_before = private.brasta_base_rank_name(before_row.games_played, before_row.ordinal),
      rank_after = private.brasta_base_rank_name(before_row.games_played + 1, next_ordinal)
    where match_id = p_match_id and player_id = player_uuid;

    processed := processed + 1;
  end loop;

  if processed <> 4 then raise exception 'Ranked 2v2 finalization did not process four players'; end if;

  update public.ranked_matches set
    status = 'completed',
    winner_team = p_winner_team,
    score_a = p_score_a,
    score_b = p_score_b,
    result_reason = 'score',
    completed_at = now()
  where id = p_match_id;

  if p_events is not null and jsonb_typeof(p_events) = 'array' then
    for event_row in select value from jsonb_array_elements(p_events)
    loop
      seq_no := seq_no + 1;
      insert into public.ranked_match_events(match_id, seq, seat, event_type, payload)
      values (
        p_match_id,
        seq_no,
        nullif(event_row->>'seat','')::smallint,
        coalesce(nullif(event_row->>'type',''),'event'),
        coalesce(event_row->'payload','{}'::jsonb)
      )
      on conflict (match_id, seq) do nothing;
    end loop;
  end if;
end;
$$;

revoke all on function public.brasta_finalize_ranked_2v2_match(uuid,text,integer,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.brasta_finalize_ranked_2v2_match(uuid,text,integer,integer,jsonb,jsonb) to service_role;

create or replace function public.brasta_my_recent_matches(p_mode text default '1v1', p_limit integer default 10)
returns table (
  match_id uuid,
  completed_at timestamptz,
  opponent_username text,
  result text,
  score_for integer,
  score_against integer,
  rank_before text,
  rank_after text
)
language sql
security definer
set search_path = ''
as $$
  select
    m.id,
    m.completed_at,
    coalesce((
      select string_agg(p.username::text, ' & ' order by opp.seat)
      from public.ranked_match_players opp
      join public.profiles p on p.id = opp.player_id
      where opp.match_id = m.id and opp.team <> me.team
    ), 'Opponent') as opponent_username,
    me.result,
    case when me.team = 'A' then m.score_a else m.score_b end,
    case when me.team = 'A' then m.score_b else m.score_a end,
    me.rank_before,
    me.rank_after
  from public.ranked_match_players me
  join public.ranked_matches m on m.id = me.match_id
  where me.player_id = auth.uid()
    and m.mode = p_mode
    and m.status = 'completed'
  order by m.completed_at desc nulls last
  limit least(greatest(coalesce(p_limit,10),1),50);
$$;

revoke all on function public.brasta_my_recent_matches(text,integer) from public, anon;
grant execute on function public.brasta_my_recent_matches(text,integer) to authenticated;

notify pgrst, 'reload schema';
