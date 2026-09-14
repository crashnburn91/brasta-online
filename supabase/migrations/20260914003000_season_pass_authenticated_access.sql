-- Allow the authenticated Season Pass API path to work when a deployment does
-- not have a server-only Supabase key configured.  The browser still cannot
-- read or write the Season Pass tables directly; these functions verify the
-- JWT subject and run with the database owner's privileges.

create or replace function public.brasta_get_season_pass_state(
  p_player_id uuid,
  p_season_id text default 'season_1'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim text := nullif(current_setting('request.jwt.claim.sub', true), '');
  v_season public.season_pass_seasons%rowtype;
  v_xp integer := 0;
  v_tier integer := 0;
  v_premium boolean := false;
  v_owned jsonb := '[]'::jsonb;
  v_equipment jsonb := '{}'::jsonb;
  v_title_source text := 'earned';
begin
  if p_player_id is null or v_claim is null or v_claim !~ '^[0-9a-fA-F-]{36}$'
    or v_claim::uuid <> p_player_id then
    raise exception 'Not authorized';
  end if;

  select * into v_season
  from public.season_pass_seasons
  where season_id = p_season_id;
  if not found then raise exception 'Season Pass season is not configured'; end if;

  select coalesce((
    select p.xp
    from public.season_pass_progress p
    where p.player_id = p_player_id and p.season_id = p_season_id
    limit 1
  ), 0) into v_xp;

  select exists (
    select 1 from public.season_pass_entitlements e
    where e.player_id = p_player_id
      and e.season_id = p_season_id
      and e.status = 'active'
  ) into v_premium;

  v_xp := least(v_season.tier_count * v_season.xp_per_tier, greatest(0, v_xp));
  v_tier := least(v_season.tier_count, floor(v_xp::numeric / v_season.xp_per_tier)::integer);

  select coalesce(
    jsonb_agg(o.reward_id order by o.awarded_at asc, o.reward_id asc),
    '[]'::jsonb
  ) into v_owned
  from public.season_pass_reward_ownership o
  where o.player_id = p_player_id and o.season_id = p_season_id;

  select jsonb_build_object(
    'card_back', (select e.reward_id from public.season_pass_equipment e where e.player_id = p_player_id and e.slot = 'card_back' limit 1),
    'table_felt', (select e.reward_id from public.season_pass_equipment e where e.player_id = p_player_id and e.slot = 'table_felt' limit 1),
    'avatar_frame', (select e.reward_id from public.season_pass_equipment e where e.player_id = p_player_id and e.slot = 'avatar_frame' limit 1),
    'profile_title', (select e.reward_id from public.season_pass_equipment e where e.player_id = p_player_id and e.slot = 'profile_title' limit 1)
  ) into v_equipment;

  select coalesce(
    (select e.title_source from public.season_pass_equipment e
      where e.player_id = p_player_id and e.slot = 'profile_title' limit 1),
    'earned'
  ) into v_title_source;

  return jsonb_build_object(
    'playerId', p_player_id,
    'season', jsonb_build_object(
      'id', v_season.season_id,
      'name', v_season.name,
      'status', v_season.status,
      'startsAt', v_season.starts_at,
      'endsAt', v_season.ends_at,
      'priceCents', v_season.price_cents,
      'currency', v_season.currency,
      'durationWeeks', v_season.duration_weeks,
      'tiers', v_season.tier_count,
      'xpPerTier', v_season.xp_per_tier,
      'completionXp', v_season.completion_xp,
      'winXp', v_season.win_xp,
      'eligibleMatchTypes', v_season.eligible_match_types
    ),
    'sets', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.set_id,
        'name', s.name,
        'description', s.description,
        'premium', s.is_premium,
        'sortOrder', s.sort_order
      ) order by s.sort_order asc, s.set_id asc)
      from public.season_pass_sets s
      where s.season_id = p_season_id
    ), '[]'::jsonb),
    'rewards', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.reward_id,
        'name', r.name,
        'kind', r.kind,
        'tier', r.tier,
        'setId', r.set_id,
        'premium', r.is_premium,
        'motif', r.motif,
        'color', r.color,
        'description', r.description,
        'matchingCardBackId', r.matching_card_back_id
      ) order by r.tier asc, r.reward_id asc)
      from public.season_pass_rewards r
      where r.season_id = p_season_id
    ), '[]'::jsonb),
    'progress', jsonb_build_object(
      'xp', v_xp,
      'tier', v_tier,
      'tiers', v_season.tier_count,
      'xpPerTier', v_season.xp_per_tier,
      'progressPercent', case when v_season.tier_count > 0 and v_season.xp_per_tier > 0
        then round((v_xp::numeric / (v_season.tier_count * v_season.xp_per_tier)) * 100)::integer
        else 0 end,
      'xpToNextTier', case when v_tier >= v_season.tier_count then 0
        else greatest(0, (v_tier + 1) * v_season.xp_per_tier - v_xp) end
    ),
    'premiumUnlocked', v_premium,
    'ownedRewardIds', v_owned,
    'equipment', v_equipment,
    'titleSource', v_title_source
  );
end;
$$;

revoke all on function public.brasta_get_season_pass_state(uuid, text) from public, anon;
grant execute on function public.brasta_get_season_pass_state(uuid, text) to authenticated, service_role;

create or replace function public.brasta_equip_season_pass_reward_for_user(
  p_player_id uuid,
  p_season_id text,
  p_slot text,
  p_reward_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claim text := nullif(current_setting('request.jwt.claim.sub', true), '');
begin
  if p_player_id is null or v_claim is null or v_claim !~ '^[0-9a-fA-F-]{36}$'
    or v_claim::uuid <> p_player_id then
    raise exception 'Not authorized';
  end if;

  return public.brasta_equip_season_pass_reward(p_player_id, p_season_id, p_slot, p_reward_id);
end;
$$;

revoke all on function public.brasta_equip_season_pass_reward_for_user(uuid, text, text, text) from public, anon;
grant execute on function public.brasta_equip_season_pass_reward_for_user(uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
