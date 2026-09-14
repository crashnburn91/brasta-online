-- A removed title and an earned title are different account preferences.
alter table public.season_pass_equipment add column title_source text;
update public.season_pass_equipment set title_source = case when reward_id is null then 'earned' else 'season' end
where slot = 'profile_title';
alter table public.season_pass_equipment add constraint season_pass_title_source check (
  (slot <> 'profile_title' and title_source is null) or
  (slot = 'profile_title' and title_source is not null and
    ((reward_id is not null and title_source = 'season') or
     (reward_id is null and title_source in ('earned','none'))))
);

create or replace function public.brasta_equip_season_pass_reward(
  p_player_id uuid, p_season_id text, p_slot text, p_reward_id text default null
)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_reward_id text := nullif(trim(coalesce(p_reward_id,'')), '');
  v_kind text;
  v_title_source text;
begin
  if p_player_id is null then raise exception 'Player is required'; end if;
  if p_slot is null or p_slot not in ('card_back','table_felt','avatar_frame','profile_title') then
    raise exception 'Invalid Season Pass equipment slot';
  end if;
  if not exists (select 1 from public.season_pass_seasons where season_id = p_season_id) then
    raise exception 'Season not found';
  end if;
  if v_reward_id is not null then
    select kind into v_kind from public.season_pass_rewards
    where reward_id = v_reward_id and season_id = p_season_id;
    if not found then raise exception 'Season Pass reward not found'; end if;
    if v_kind <> (case p_slot when 'card_back' then 'Card back' when 'table_felt' then 'Table felt'
      when 'avatar_frame' then 'Avatar frame' else 'Profile title' end) then
      raise exception 'That reward does not fit this equipment slot';
    end if;
    -- Prevent a simultaneous revocation from removing ownership before this save.
    perform 1 from public.season_pass_reward_ownership
    where player_id = p_player_id and season_id = p_season_id and reward_id = v_reward_id for key share;
    if not found then raise exception 'You have not unlocked that Season Pass reward'; end if;
  end if;
  v_title_source := case when p_slot = 'profile_title' then
    case when v_reward_id is null then 'none' else 'season' end else null end;
  insert into public.season_pass_equipment (player_id,slot,reward_id,title_source)
  values (p_player_id,p_slot,v_reward_id,v_title_source)
  on conflict (player_id,slot) do update set reward_id = excluded.reward_id,
    title_source = excluded.title_source, updated_at = now();
  return jsonb_build_object('season_id',p_season_id,'slot',p_slot,'reward_id',v_reward_id);
end;
$$;
revoke all on function public.brasta_equip_season_pass_reward(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.brasta_equip_season_pass_reward(uuid,text,text,text) to service_role;

create or replace function public.brasta_equip_profile_badge(p_player_id uuid,p_badge_key text default null)
returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_badge_key text := nullif(trim(coalesce(p_badge_key,'')), '');
begin
  if not exists (select 1 from public.profiles where id = p_player_id) then
    raise exception 'Player profile not found.';
  end if;
  if v_badge_key is not null and not exists (select 1 from public.player_profile_badges
    where player_id = p_player_id and badge_key = v_badge_key) then
    raise exception 'You have not unlocked that badge.';
  end if;
  insert into public.player_profile_badge_equipment (player_id,badge_key,updated_at)
  values (p_player_id,v_badge_key,now())
  on conflict (player_id) do update set badge_key = excluded.badge_key,updated_at = now();
  -- The earned-title save and clearing its season override succeed together.
  insert into public.season_pass_equipment (player_id,slot,reward_id,title_source)
  values (p_player_id,'profile_title',null,case when v_badge_key is null then 'none' else 'earned' end)
  on conflict (player_id,slot) do update set reward_id = null,
    title_source = excluded.title_source,updated_at = now();
  return v_badge_key;
end;
$$;
revoke all on function public.brasta_equip_profile_badge(uuid,text) from public,anon,authenticated;
grant execute on function public.brasta_equip_profile_badge(uuid,text) to service_role;
notify pgrst, 'reload schema';
