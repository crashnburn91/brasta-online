create or replace function public.brasta_player_stats_for_scope(p_player_id uuid, p_scope text)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with scoped as (
  select
    mh.id as match_id,
    mh.completed_at,
    mh.match_type,
    mhp.result,
    mhp.brastas,
    mhp.best_brasta_streak,
    mhp.big_ten_captures,
    mhp.big_two_captures,
    mhp.jack_sweeps,
    mhp.jack_burns,
    mhp.burn_calls,
    mhp.builds_made,
    mhp.last_pickups,
    mhp.cards_captured,
    mhp.opponent_jack_burns
  from public.match_history_players mhp
  join public.match_history mh on mh.id = mhp.match_id
  where mhp.player_id = p_player_id
    and (p_scope = 'all' or mh.match_type = p_scope)
),
ordered as (
  select *, row_number() over (order by completed_at desc, match_id desc) as rn
  from scoped
),
current_streak as (
  select coalesce(
    (select min(rn) - 1 from ordered where result <> 'win'),
    (select count(*) from ordered),
    0
  )::integer as value
),
win_groups as (
  select *,
    sum(case when result <> 'win' then 1 else 0 end)
      over (order by completed_at asc, match_id asc rows unbounded preceding) as grp
  from scoped
),
best_streak as (
  select coalesce(max(run_length), 0)::integer as value
  from (
    select count(*)::integer as run_length
    from win_groups
    where result = 'win'
    group by grp
  ) runs
),
agg as (
  select
    count(*)::integer as matches_played,
    count(*) filter (where result = 'win')::integer as wins,
    count(*) filter (where result = 'loss')::integer as losses,
    coalesce(sum(brastas), 0)::integer as brastas,
    coalesce(max(best_brasta_streak), 0)::integer as best_brasta_streak,
    coalesce(sum(big_ten_captures), 0)::integer as big_ten_captures,
    coalesce(sum(big_two_captures), 0)::integer as big_two_captures,
    coalesce(sum(jack_sweeps), 0)::integer as jack_sweeps,
    coalesce(sum(jack_burns), 0)::integer as jack_burns,
    coalesce(sum(burn_calls), 0)::integer as burn_calls,
    coalesce(sum(builds_made), 0)::integer as builds_made,
    coalesce(sum(last_pickups), 0)::integer as last_pickups,
    coalesce(sum(cards_captured), 0)::integer as cards_captured,
    coalesce(sum(opponent_jack_burns), 0)::integer as opponent_jack_burns,
    min(completed_at) as tracked_since
  from scoped
)
select jsonb_build_object(
  'matchesPlayed', a.matches_played,
  'wins', a.wins,
  'losses', a.losses,
  'winRate', case when a.matches_played > 0 then round((a.wins::numeric / a.matches_played::numeric) * 100, 1) else 0 end,
  'currentWinStreak', c.value,
  'bestWinStreak', b.value,
  'brastas', a.brastas,
  'currentBrastaStreak', 0,
  'bestBrastaStreak', a.best_brasta_streak,
  'bigTenCaptures', a.big_ten_captures,
  'bigTwoCaptures', a.big_two_captures,
  'jackSweeps', a.jack_sweeps,
  'jackBurns', a.jack_burns,
  'burnCalls', a.burn_calls,
  'buildsMade', a.builds_made,
  'lastPickups', a.last_pickups,
  'cardsCaptured', a.cards_captured,
  'opponentJackBurns', a.opponent_jack_burns,
  'trackedSince', a.tracked_since
)
from agg a cross join current_streak c cross join best_streak b;
$$;

revoke all on function public.brasta_player_stats_for_scope(uuid, text) from public, anon, authenticated;
grant execute on function public.brasta_player_stats_for_scope(uuid, text) to service_role;

create or replace function public.brasta_player_progression(p_player_id uuid, p_limit integer default 10)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with recent as (
  select mhp.*, mh.id history_id, mh.match_type, mh.mode, mh.score_a, mh.score_b,
         mh.completed_at, mh.duration_seconds, mh.rounds_played, mh.ranked_match_id
  from public.match_history_players mhp
  join public.match_history mh on mh.id = mhp.match_id
  where mhp.player_id = p_player_id
  order by mh.completed_at desc
  limit greatest(1, least(coalesce(p_limit, 10), 25))
)
select jsonb_build_object(
  'stats', public.brasta_player_stats_for_scope(p_player_id, 'all'),
  'statsByType', jsonb_build_object(
    'all', public.brasta_player_stats_for_scope(p_player_id, 'all'),
    'ranked', public.brasta_player_stats_for_scope(p_player_id, 'ranked'),
    'private', public.brasta_player_stats_for_scope(p_player_id, 'private'),
    'bot', public.brasta_player_stats_for_scope(p_player_id, 'bot')
  ),
  'matches', coalesce((
    select jsonb_agg(jsonb_build_object(
      'matchId', r.history_id,
      'matchType', r.match_type,
      'mode', r.mode,
      'completedAt', r.completed_at,
      'durationSeconds', r.duration_seconds,
      'roundsPlayed', r.rounds_played,
      'scoreA', r.score_a,
      'scoreB', r.score_b,
      'team', r.team,
      'result', r.result,
      'rankBefore', rp.rank_before,
      'rankAfter', rp.rank_after,
      'brastas', r.brastas,
      'bestBrastaStreak', r.best_brasta_streak,
      'bigTenCaptures', r.big_ten_captures,
      'bigTwoCaptures', r.big_two_captures,
      'jackSweeps', r.jack_sweeps,
      'burnCalls', r.burn_calls,
      'opponentJackBurns', r.opponent_jack_burns,
      'players', coalesce((
        select jsonb_agg(jsonb_build_object(
          'seat', p.seat, 'team', p.team, 'username', p.username,
          'result', p.result, 'playerId', p.player_id
        ) order by p.seat)
        from public.match_history_players p where p.match_id = r.history_id
      ), '[]'::jsonb),
      'events', coalesce((
        select jsonb_agg(jsonb_build_object(
          'seq', e.seq, 'round', e.round, 'seat', e.seat,
          'eventType', e.event_type, 'points', e.points,
          'payload', e.payload
        ) order by e.seq)
        from public.match_history_events e where e.match_id = r.history_id
      ), '[]'::jsonb)
    ) order by r.completed_at desc)
    from recent r
    left join public.ranked_match_players rp
      on rp.match_id = r.ranked_match_id and rp.player_id = p_player_id
  ), '[]'::jsonb),
  'achievements', coalesce((
    select jsonb_agg(jsonb_build_object(
      'key', d.achievement_key,
      'name', case when d.hidden and pa.unlocked_at is null then 'Secret Achievement' else d.name end,
      'description', case when d.hidden and pa.unlocked_at is null then 'Keep playing to discover this achievement.' else d.description end,
      'category', d.category,
      'target', d.target,
      'icon', case when d.hidden and pa.unlocked_at is null then '🔒' else d.icon end,
      'tier', d.tier,
      'hidden', d.hidden,
      'progress', coalesce(pa.progress, 0),
      'unlockedAt', pa.unlocked_at,
      'completed', pa.unlocked_at is not null
    ) order by (pa.unlocked_at is not null) desc, d.sort_order)
    from public.achievement_definitions d
    left join public.player_achievements pa
      on pa.achievement_key = d.achievement_key and pa.player_id = p_player_id
  ), '[]'::jsonb)
);
$$;

revoke all on function public.brasta_player_progression(uuid, integer) from public, anon, authenticated;
grant execute on function public.brasta_player_progression(uuid, integer) to service_role;
