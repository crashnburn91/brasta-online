-- Career achievements for being on the opposing side when a Jack is burned.
-- In 2v2, both players on the opposite team receive credit.

alter table public.match_history_players
  add column if not exists opponent_jack_burns integer not null default 0 check (opponent_jack_burns >= 0);

alter table public.player_game_stats
  add column if not exists opponent_jack_burns integer not null default 0 check (opponent_jack_burns >= 0);

insert into public.achievement_definitions
  (achievement_key, name, description, category, target, icon, tier, hidden, sort_order)
values
  ('opponent_jack_burn_1',   'Made You Burn',  'Be on the opposing side when a Jack is burned.', 'Burns', 1,   '🔥', 'standard', false, 170),
  ('opponent_jack_burn_10',  'Burn Notice',     'See opponents burn 10 Jacks across your career.', 'Burns', 10,  '🔥', 'bronze',   false, 180),
  ('opponent_jack_burn_25',  'Firestarter',     'See opponents burn 25 Jacks across your career.', 'Burns', 25,  '🔥', 'silver',   false, 190),
  ('opponent_jack_burn_50',  'Bringing the Heat','See opponents burn 50 Jacks across your career.', 'Burns', 50, '🔥', 'gold',     false, 200),
  ('opponent_jack_burn_100', 'Scorched Earth',  'See opponents burn 100 Jacks across your career.', 'Burns', 100, '🔥', 'legendary',false, 210)
on conflict (achievement_key) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  target = excluded.target,
  icon = excluded.icon,
  tier = excluded.tier,
  hidden = excluded.hidden,
  sort_order = excluded.sort_order;

create or replace function public.brasta_refresh_player_achievements(p_player_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  s public.player_game_stats%rowtype;
begin
  select * into s from public.player_game_stats where player_id = p_player_id;
  if not found then return; end if;

  insert into public.player_achievements(player_id, achievement_key, progress, unlocked_at, updated_at)
  select
    p_player_id,
    d.achievement_key,
    case d.achievement_key
      when 'first_match' then s.matches_played
      when 'first_win' then s.wins
      when 'veteran_25' then s.matches_played
      when 'builder' then s.builds_made
      when 'first_brasta' then s.brastas
      when 'brasta_10' then s.brastas
      when 'brasta_100' then s.brastas
      when 'brasta_streak_2' then s.best_brasta_streak
      when 'brasta_streak_3' then s.best_brasta_streak
      when 'brasta_streak_4' then s.best_brasta_streak
      when 'brasta_streak_5' then s.best_brasta_streak
      when 'big_game' then s.big_ten_captures
      when 'deuces' then s.big_two_captures
      when 'first_sweep' then s.jack_sweeps
      when 'sweep_artist' then s.jack_sweeps
      when 'caught_you' then s.burn_calls
      when 'fire_marshal' then s.burn_calls
      when 'opponent_jack_burn_1' then s.opponent_jack_burns
      when 'opponent_jack_burn_10' then s.opponent_jack_burns
      when 'opponent_jack_burn_25' then s.opponent_jack_burns
      when 'opponent_jack_burn_50' then s.opponent_jack_burns
      when 'opponent_jack_burn_100' then s.opponent_jack_burns
      when 'capture_100' then s.cards_captured
      when 'hot_hand' then s.best_win_streak
      when 'on_fire' then s.best_win_streak
      else 0
    end,
    case when
      (case d.achievement_key
        when 'first_match' then s.matches_played
        when 'first_win' then s.wins
        when 'veteran_25' then s.matches_played
        when 'builder' then s.builds_made
        when 'first_brasta' then s.brastas
        when 'brasta_10' then s.brastas
        when 'brasta_100' then s.brastas
        when 'brasta_streak_2' then s.best_brasta_streak
        when 'brasta_streak_3' then s.best_brasta_streak
        when 'brasta_streak_4' then s.best_brasta_streak
        when 'brasta_streak_5' then s.best_brasta_streak
        when 'big_game' then s.big_ten_captures
        when 'deuces' then s.big_two_captures
        when 'first_sweep' then s.jack_sweeps
        when 'sweep_artist' then s.jack_sweeps
        when 'caught_you' then s.burn_calls
        when 'fire_marshal' then s.burn_calls
        when 'opponent_jack_burn_1' then s.opponent_jack_burns
        when 'opponent_jack_burn_10' then s.opponent_jack_burns
        when 'opponent_jack_burn_25' then s.opponent_jack_burns
        when 'opponent_jack_burn_50' then s.opponent_jack_burns
        when 'opponent_jack_burn_100' then s.opponent_jack_burns
        when 'capture_100' then s.cards_captured
        when 'hot_hand' then s.best_win_streak
        when 'on_fire' then s.best_win_streak
        else 0
      end) >= d.target
      then now() else null
    end,
    now()
  from public.achievement_definitions d
  on conflict(player_id, achievement_key) do update set
    progress = greatest(public.player_achievements.progress, excluded.progress),
    unlocked_at = coalesce(public.player_achievements.unlocked_at, excluded.unlocked_at),
    updated_at = now();
end;
$$;

revoke all on function public.brasta_refresh_player_achievements(uuid) from public, anon, authenticated;
grant execute on function public.brasta_refresh_player_achievements(uuid) to service_role;

create or replace function public.brasta_credit_opponent_jack_burn()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_offender_team text;
  v_player record;
begin
  if new.event_type <> 'jack_burn' or new.seat is null then
    return new;
  end if;

  select team into v_offender_team
  from public.match_history_players
  where match_id = new.match_id and seat = new.seat;

  if v_offender_team is null then return new; end if;

  update public.match_history_players
  set opponent_jack_burns = opponent_jack_burns + 1
  where match_id = new.match_id
    and team <> v_offender_team;

  for v_player in
    select player_id
    from public.match_history_players
    where match_id = new.match_id
      and team <> v_offender_team
      and player_id is not null
  loop
    insert into public.player_game_stats(player_id, opponent_jack_burns, updated_at)
    values(v_player.player_id, 1, now())
    on conflict(player_id) do update set
      opponent_jack_burns = public.player_game_stats.opponent_jack_burns + 1,
      updated_at = now();

    perform public.brasta_refresh_player_achievements(v_player.player_id);
  end loop;

  return new;
end;
$$;

revoke all on function public.brasta_credit_opponent_jack_burn() from public, anon, authenticated;
grant execute on function public.brasta_credit_opponent_jack_burn() to service_role;

drop trigger if exists brasta_credit_opponent_jack_burn_trigger on public.match_history_events;
create trigger brasta_credit_opponent_jack_burn_trigger
after insert on public.match_history_events
for each row
when (new.event_type = 'jack_burn')
execute function public.brasta_credit_opponent_jack_burn();
