alter table public.match_history_players
  add column if not exists best_brasta_streak integer not null default 0 check (best_brasta_streak >= 0);

alter table public.player_game_stats
  add column if not exists best_brasta_streak integer not null default 0 check (best_brasta_streak >= 0);

insert into public.achievement_definitions
  (achievement_key, name, description, category, target, icon, tier, hidden, sort_order)
values
  ('brasta_streak_2', 'Back-to-Back', 'Score a Brasta on 2 consecutive turns you take.', 'Brasta Streaks', 2, '⚡', 'bronze', false, 55),
  ('brasta_streak_3', 'Triple Threat', 'Score a Brasta on 3 consecutive turns you take.', 'Brasta Streaks', 3, '🔥', 'silver', false, 56),
  ('brasta_streak_4', 'Brasta Run', 'Score a Brasta on 4 consecutive turns you take.', 'Brasta Streaks', 4, '💥', 'gold', false, 57),
  ('brasta_streak_5', 'Unstoppable', 'Score a Brasta on 5 consecutive turns you take.', 'Brasta Streaks', 5, '👑', 'gold', false, 58)
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

  insert into public.player_achievements (player_id, achievement_key, progress, unlocked_at, updated_at)
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
      when 'capture_100' then s.cards_captured
      when 'hot_hand' then s.best_win_streak
      when 'on_fire' then s.best_win_streak
      else 0
    end as progress,
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
        when 'capture_100' then s.cards_captured
        when 'hot_hand' then s.best_win_streak
        when 'on_fire' then s.best_win_streak
        else 0
      end) >= d.target then now() else null end,
    now()
  from public.achievement_definitions d
  on conflict (player_id, achievement_key) do update set
    progress = greatest(public.player_achievements.progress, excluded.progress),
    unlocked_at = coalesce(public.player_achievements.unlocked_at, excluded.unlocked_at),
    updated_at = now();
end;
$$;

create or replace function public.brasta_record_completed_match(
  p_match_key text,
  p_ranked_match_id uuid,
  p_room_code text,
  p_mode text,
  p_match_type text,
  p_target_score integer,
  p_winner_team text,
  p_score_a integer,
  p_score_b integer,
  p_rounds_played integer,
  p_started_at timestamptz,
  p_completed_at timestamptz,
  p_completion_reason text,
  p_players jsonb,
  p_events jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_match_id uuid;
  v_player record;
  v_duration integer;
begin
  if p_mode not in ('1v1','2v2') then raise exception 'Invalid match mode'; end if;
  if p_match_type not in ('ranked','private','bot') then raise exception 'Invalid match type'; end if;
  if p_winner_team is not null and p_winner_team not in ('A','B') then raise exception 'Invalid winner'; end if;
  if p_target_score not in (110,220) then raise exception 'Invalid target score'; end if;
  if jsonb_typeof(coalesce(p_players,'[]'::jsonb)) <> 'array' then raise exception 'Players must be an array'; end if;
  if jsonb_typeof(coalesce(p_events,'[]'::jsonb)) <> 'array' then raise exception 'Events must be an array'; end if;

  v_duration := greatest(0, floor(extract(epoch from (p_completed_at-p_started_at)))::integer);

  insert into public.match_history(
    match_key,ranked_match_id,room_code,mode,match_type,target_score,winner_team,
    score_a,score_b,rounds_played,completion_reason,started_at,completed_at,duration_seconds
  )
  values(
    p_match_key,p_ranked_match_id,p_room_code,p_mode,p_match_type,p_target_score,p_winner_team,
    greatest(0,p_score_a),greatest(0,p_score_b),greatest(1,p_rounds_played),
    coalesce(nullif(trim(p_completion_reason),''),'completed'),p_started_at,p_completed_at,v_duration
  )
  on conflict(match_key) do nothing returning id into v_match_id;

  if v_match_id is null then
    select id into v_match_id from public.match_history where match_key=p_match_key;
    return v_match_id;
  end if;

  insert into public.match_history_players(
    match_id,player_id,seat,team,username,result,brastas,best_brasta_streak,
    big_ten_captures,big_two_captures,jack_sweeps,jack_burns,burn_calls,
    builds_made,last_pickups,cards_captured
  )
  select
    v_match_id,x.player_id,x.seat,x.team,left(coalesce(nullif(trim(x.username),''),'Player'),24),x.result,
    greatest(0,coalesce(x.brastas,0)),greatest(0,coalesce(x.best_brasta_streak,0)),
    greatest(0,coalesce(x.big_ten_captures,0)),greatest(0,coalesce(x.big_two_captures,0)),
    greatest(0,coalesce(x.jack_sweeps,0)),greatest(0,coalesce(x.jack_burns,0)),
    greatest(0,coalesce(x.burn_calls,0)),greatest(0,coalesce(x.builds_made,0)),
    greatest(0,coalesce(x.last_pickups,0)),greatest(0,coalesce(x.cards_captured,0))
  from jsonb_to_recordset(coalesce(p_players,'[]'::jsonb)) as x(
    player_id uuid,seat smallint,team text,username text,result text,brastas integer,
    best_brasta_streak integer,big_ten_captures integer,big_two_captures integer,
    jack_sweeps integer,jack_burns integer,burn_calls integer,builds_made integer,
    last_pickups integer,cards_captured integer
  );

  insert into public.match_history_events(match_id,seq,round,seat,player_id,event_type,points,payload)
  select v_match_id,x.seq,greatest(1,coalesce(x.round,1)),x.seat,x.player_id,
    left(coalesce(nullif(trim(x.event_type),''),'event'),64),coalesce(x.points,0),coalesce(x.payload,'{}'::jsonb)
  from jsonb_to_recordset(coalesce(p_events,'[]'::jsonb)) as x(
    seq integer,round integer,seat smallint,player_id uuid,event_type text,points integer,payload jsonb
  )
  where coalesce(x.seq,0)>0
  on conflict(match_id,seq) do nothing;

  for v_player in
    select * from public.match_history_players where match_id=v_match_id and player_id is not null
  loop
    insert into public.player_game_stats(
      player_id,matches_played,wins,losses,current_win_streak,best_win_streak,brastas,
      best_brasta_streak,big_ten_captures,big_two_captures,jack_sweeps,jack_burns,
      burn_calls,builds_made,last_pickups,cards_captured,updated_at
    )
    values(
      v_player.player_id,1,
      case when v_player.result='win' then 1 else 0 end,
      case when v_player.result='loss' then 1 else 0 end,
      case when v_player.result='win' then 1 else 0 end,
      case when v_player.result='win' then 1 else 0 end,
      v_player.brastas,v_player.best_brasta_streak,v_player.big_ten_captures,
      v_player.big_two_captures,v_player.jack_sweeps,v_player.jack_burns,
      v_player.burn_calls,v_player.builds_made,v_player.last_pickups,v_player.cards_captured,now()
    )
    on conflict(player_id) do update set
      matches_played=public.player_game_stats.matches_played+1,
      wins=public.player_game_stats.wins+excluded.wins,
      losses=public.player_game_stats.losses+excluded.losses,
      current_win_streak=case when excluded.wins=1 then public.player_game_stats.current_win_streak+1 else 0 end,
      best_win_streak=greatest(public.player_game_stats.best_win_streak,case when excluded.wins=1 then public.player_game_stats.current_win_streak+1 else public.player_game_stats.best_win_streak end),
      brastas=public.player_game_stats.brastas+excluded.brastas,
      best_brasta_streak=greatest(public.player_game_stats.best_brasta_streak,excluded.best_brasta_streak),
      big_ten_captures=public.player_game_stats.big_ten_captures+excluded.big_ten_captures,
      big_two_captures=public.player_game_stats.big_two_captures+excluded.big_two_captures,
      jack_sweeps=public.player_game_stats.jack_sweeps+excluded.jack_sweeps,
      jack_burns=public.player_game_stats.jack_burns+excluded.jack_burns,
      burn_calls=public.player_game_stats.burn_calls+excluded.burn_calls,
      builds_made=public.player_game_stats.builds_made+excluded.builds_made,
      last_pickups=public.player_game_stats.last_pickups+excluded.last_pickups,
      cards_captured=public.player_game_stats.cards_captured+excluded.cards_captured,
      updated_at=now();

    perform public.brasta_refresh_player_achievements(v_player.player_id);
  end loop;

  return v_match_id;
end;
$$;

create or replace function public.brasta_player_progression(p_player_id uuid,p_limit integer default 10)
returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
with stat as (
  select * from public.player_game_stats where player_id=p_player_id
), recent as (
  select mhp.*,mh.id history_id,mh.match_type,mh.mode,mh.score_a,mh.score_b,
         mh.completed_at,mh.duration_seconds,mh.rounds_played,mh.ranked_match_id
  from public.match_history_players mhp
  join public.match_history mh on mh.id=mhp.match_id
  where mhp.player_id=p_player_id
  order by mh.completed_at desc
  limit greatest(1,least(coalesce(p_limit,10),25))
)
select jsonb_build_object(
  'stats',coalesce((
    select jsonb_build_object(
      'matchesPlayed',s.matches_played,'wins',s.wins,'losses',s.losses,
      'winRate',case when s.matches_played>0 then round((s.wins::numeric/s.matches_played::numeric)*100,1) else 0 end,
      'currentWinStreak',s.current_win_streak,'bestWinStreak',s.best_win_streak,
      'brastas',s.brastas,'bestBrastaStreak',s.best_brasta_streak,
      'bigTenCaptures',s.big_ten_captures,'bigTwoCaptures',s.big_two_captures,
      'jackSweeps',s.jack_sweeps,'jackBurns',s.jack_burns,'burnCalls',s.burn_calls,
      'buildsMade',s.builds_made,'lastPickups',s.last_pickups,'cardsCaptured',s.cards_captured,
      'trackedSince',s.created_at
    ) from stat s
  ),jsonb_build_object(
    'matchesPlayed',0,'wins',0,'losses',0,'winRate',0,'currentWinStreak',0,'bestWinStreak',0,
    'brastas',0,'bestBrastaStreak',0,'bigTenCaptures',0,'bigTwoCaptures',0,'jackSweeps',0,
    'jackBurns',0,'burnCalls',0,'buildsMade',0,'lastPickups',0,'cardsCaptured',0,'trackedSince',null
  )),
  'matches',coalesce((
    select jsonb_agg(jsonb_build_object(
      'matchId',r.history_id,'matchType',r.match_type,'mode',r.mode,'completedAt',r.completed_at,
      'durationSeconds',r.duration_seconds,'roundsPlayed',r.rounds_played,'scoreA',r.score_a,'scoreB',r.score_b,
      'team',r.team,'result',r.result,'rankBefore',rp.rank_before,'rankAfter',rp.rank_after,
      'brastas',r.brastas,'bestBrastaStreak',r.best_brasta_streak,
      'bigTenCaptures',r.big_ten_captures,'bigTwoCaptures',r.big_two_captures,
      'jackSweeps',r.jack_sweeps,'burnCalls',r.burn_calls,
      'players',coalesce((
        select jsonb_agg(jsonb_build_object(
          'seat',p.seat,'team',p.team,'username',p.username,'result',p.result,'playerId',p.player_id
        ) order by p.seat)
        from public.match_history_players p where p.match_id=r.history_id
      ),'[]'::jsonb),
      'events',coalesce((
        select jsonb_agg(jsonb_build_object(
          'seq',e.seq,'round',e.round,'seat',e.seat,'eventType',e.event_type,'points',e.points,'payload',e.payload
        ) order by e.seq)
        from public.match_history_events e where e.match_id=r.history_id
      ),'[]'::jsonb)
    ) order by r.completed_at desc)
    from recent r
    left join public.ranked_match_players rp on rp.match_id=r.ranked_match_id and rp.player_id=p_player_id
  ),'[]'::jsonb),
  'achievements',coalesce((
    select jsonb_agg(jsonb_build_object(
      'key',d.achievement_key,
      'name',case when d.hidden and pa.unlocked_at is null then 'Secret Achievement' else d.name end,
      'description',case when d.hidden and pa.unlocked_at is null then 'Keep playing to discover this achievement.' else d.description end,
      'category',d.category,'target',d.target,
      'icon',case when d.hidden and pa.unlocked_at is null then '🔒' else d.icon end,
      'tier',d.tier,'hidden',d.hidden,'progress',coalesce(pa.progress,0),
      'unlockedAt',pa.unlocked_at,'completed',pa.unlocked_at is not null
    ) order by (pa.unlocked_at is not null) desc,d.sort_order)
    from public.achievement_definitions d
    left join public.player_achievements pa on pa.achievement_key=d.achievement_key and pa.player_id=p_player_id
  ),'[]'::jsonb)
);
$$;
