create or replace function public.brasta_player_stats_matrix(p_player_id uuid)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with scopes(type_key, type_filter, mode_key, mode_filter) as (
  select t.type_key, t.type_filter, m.mode_key, m.mode_filter
  from (values
    ('all'::text, null::text),
    ('ranked'::text, 'ranked'::text),
    ('private'::text, 'private'::text),
    ('bot'::text, 'bot'::text)
  ) as t(type_key, type_filter)
  cross join (values
    ('all'::text, null::text),
    ('1v1'::text, '1v1'::text),
    ('2v2'::text, '2v2'::text)
  ) as m(mode_key, mode_filter)
),
base as (
  select
    mh.id as match_id,
    mh.match_type,
    mh.mode,
    mh.completed_at,
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
),
agg as (
  select
    s.type_key,
    s.mode_key,
    count(b.match_id)::integer as matches_played,
    count(*) filter (where b.result = 'win')::integer as wins,
    count(*) filter (where b.result = 'loss')::integer as losses,
    coalesce(sum(b.brastas), 0)::integer as brastas,
    coalesce(max(b.best_brasta_streak), 0)::integer as best_brasta_streak,
    coalesce(sum(b.big_ten_captures), 0)::integer as big_ten_captures,
    coalesce(sum(b.big_two_captures), 0)::integer as big_two_captures,
    coalesce(sum(b.jack_sweeps), 0)::integer as jack_sweeps,
    coalesce(sum(b.jack_burns), 0)::integer as jack_burns,
    coalesce(sum(b.burn_calls), 0)::integer as burn_calls,
    coalesce(sum(b.builds_made), 0)::integer as builds_made,
    coalesce(sum(b.last_pickups), 0)::integer as last_pickups,
    coalesce(sum(b.cards_captured), 0)::integer as cards_captured,
    coalesce(sum(b.opponent_jack_burns), 0)::integer as opponent_jack_burns,
    min(b.completed_at) as tracked_since
  from scopes s
  left join base b
    on (s.type_filter is null or b.match_type = s.type_filter)
   and (s.mode_filter is null or b.mode = s.mode_filter)
  group by s.type_key, s.mode_key
),
streaks as (
  select
    s.type_key,
    s.mode_key,
    coalesce((
      select count(*)::integer
      from base b
      where (s.type_filter is null or b.match_type = s.type_filter)
        and (s.mode_filter is null or b.mode = s.mode_filter)
        and b.result = 'win'
        and b.completed_at > coalesce((
          select max(b2.completed_at)
          from base b2
          where (s.type_filter is null or b2.match_type = s.type_filter)
            and (s.mode_filter is null or b2.mode = s.mode_filter)
            and b2.result <> 'win'
        ), '-infinity'::timestamptz)
    ), 0)::integer as current_win_streak,
    coalesce((
      select max(run_length)::integer
      from (
        select count(*)::integer as run_length
        from (
          select
            b3.result,
            sum(case when b3.result <> 'win' then 1 else 0 end)
              over (order by b3.completed_at, b3.match_id) as grp
          from base b3
          where (s.type_filter is null or b3.match_type = s.type_filter)
            and (s.mode_filter is null or b3.mode = s.mode_filter)
        ) sequenced
        where result = 'win'
        group by grp
      ) runs
    ), 0)::integer as best_win_streak
  from scopes s
),
rows as (
  select
    a.type_key,
    a.mode_key,
    jsonb_build_object(
      'matchesPlayed', a.matches_played,
      'wins', a.wins,
      'losses', a.losses,
      'winRate', case when a.matches_played > 0 then round((a.wins::numeric / a.matches_played::numeric) * 100, 1) else 0 end,
      'currentWinStreak', s.current_win_streak,
      'bestWinStreak', s.best_win_streak,
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
    ) as stats
  from agg a
  join streaks s using (type_key, mode_key)
),
by_type as (
  select type_key, jsonb_object_agg(mode_key, stats order by mode_key) as modes
  from rows
  group by type_key
)
select coalesce(jsonb_object_agg(type_key, modes order by type_key), '{}'::jsonb)
from by_type;
$$;

revoke all on function public.brasta_player_stats_matrix(uuid) from public, anon, authenticated;
grant execute on function public.brasta_player_stats_matrix(uuid) to service_role;
