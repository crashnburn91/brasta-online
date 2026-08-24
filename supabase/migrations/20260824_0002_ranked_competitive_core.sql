create schema if not exists private;
revoke all on schema private from public;

create table if not exists public.player_ratings (
  player_id uuid not null references public.profiles(id) on delete cascade,
  mode text not null check (mode in ('1v1','2v2')),
  mu double precision not null default 25,
  sigma double precision not null default 8.333333333333334,
  ordinal double precision not null default 0,
  games_played integer not null default 0 check (games_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, mode)
);

create table if not exists public.ranked_matches (
  id uuid primary key,
  room_code text not null unique,
  mode text not null check (mode in ('1v1','2v2')),
  target_score integer not null check (target_score in (110,220)),
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  winner_team text check (winner_team in ('A','B')),
  score_a integer,
  score_b integer,
  result_reason text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ranked_match_players (
  match_id uuid not null references public.ranked_matches(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint not null check (seat between 1 and 4),
  team text not null check (team in ('A','B')),
  result text check (result in ('win','loss')),
  mu_before double precision,
  sigma_before double precision,
  ordinal_before double precision,
  mu_after double precision,
  sigma_after double precision,
  ordinal_after double precision,
  rank_before text,
  rank_after text,
  primary key (match_id, player_id),
  unique (match_id, seat)
);

create table if not exists public.ranked_match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.ranked_matches(id) on delete cascade,
  seq integer not null,
  seat smallint,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (match_id, seq)
);

alter table public.player_ratings enable row level security;
alter table public.ranked_matches enable row level security;
alter table public.ranked_match_players enable row level security;
alter table public.ranked_match_events enable row level security;

revoke all on public.player_ratings from anon, authenticated;
revoke all on public.ranked_matches from anon, authenticated;
revoke all on public.ranked_match_players from anon, authenticated;
revoke all on public.ranked_match_events from anon, authenticated;

create or replace function private.brasta_base_rank_name(p_games integer, p_ordinal double precision)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_games < 5 then 'Unranked'
    when p_ordinal < -2 then 'Bronze III'
    when p_ordinal < 1 then 'Bronze II'
    when p_ordinal < 4 then 'Bronze I'
    when p_ordinal < 7 then 'Silver III'
    when p_ordinal < 10 then 'Silver II'
    when p_ordinal < 13 then 'Silver I'
    when p_ordinal < 16 then 'Gold III'
    when p_ordinal < 19 then 'Gold II'
    when p_ordinal < 22 then 'Gold I'
    when p_ordinal < 25 then 'Platinum III'
    when p_ordinal < 28 then 'Platinum II'
    when p_ordinal < 31 then 'Platinum I'
    when p_ordinal < 34 then 'Diamond III'
    when p_ordinal < 37 then 'Diamond II'
    when p_ordinal < 40 then 'Diamond I'
    else 'Master'
  end;
$$;

revoke all on function private.brasta_base_rank_name(integer,double precision) from public, anon, authenticated;

create or replace function public.brasta_competitive_status(p_mode text default '1v1')
returns table (
  mode text,
  matchmaking_ordinal double precision,
  rank_name text,
  games_played integer,
  wins integer,
  losses integer,
  current_streak integer,
  best_streak integer,
  placement_games integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  r public.player_ratings%rowtype;
  base_rank text;
  better_masters bigint;
begin
  if uid is null then raise exception 'Authentication required'; end if;
  if p_mode not in ('1v1','2v2') then raise exception 'Unsupported mode'; end if;

  insert into public.player_ratings(player_id, mode)
  values (uid, p_mode)
  on conflict (player_id, mode) do nothing;

  select * into r from public.player_ratings where player_id = uid and mode = p_mode;
  base_rank := private.brasta_base_rank_name(r.games_played, r.ordinal);

  if base_rank = 'Master' and r.games_played >= 25 then
    select count(*) into better_masters
    from public.player_ratings x
    where x.mode = p_mode
      and x.games_played >= 25
      and private.brasta_base_rank_name(x.games_played, x.ordinal) = 'Master'
      and x.ordinal > r.ordinal;
    if better_masters < 50 then base_rank := 'Grandmaster'; end if;
  end if;

  return query select r.mode, r.ordinal, base_rank, r.games_played, r.wins, r.losses,
    r.current_streak, r.best_streak, least(r.games_played,5);
end;
$$;

revoke all on function public.brasta_competitive_status(text) from public, anon;
grant execute on function public.brasta_competitive_status(text) to authenticated;

create or replace function public.brasta_ranked_leaderboard(p_mode text default '1v1', p_limit integer default 50)
returns table (
  leaderboard_position bigint,
  username text,
  rank_name text,
  games_played integer,
  wins integer,
  losses integer,
  best_streak integer
)
language sql
security definer
set search_path = ''
as $$
  with ranked as (
    select
      row_number() over(order by r.ordinal desc, r.wins desc, r.games_played asc, p.username::text asc) as leaderboard_position,
      p.username::text as username,
      r.games_played,
      r.wins,
      r.losses,
      r.best_streak,
      r.ordinal,
      private.brasta_base_rank_name(r.games_played, r.ordinal) as base_rank
    from public.player_ratings r
    join public.profiles p on p.id = r.player_id
    where r.mode = p_mode and r.games_played >= 5 and p.username is not null
  )
  select
    ranked.leaderboard_position,
    ranked.username,
    case when ranked.base_rank = 'Master' and ranked.games_played >= 25 and ranked.leaderboard_position <= 50
      then 'Grandmaster' else ranked.base_rank end,
    ranked.games_played,
    ranked.wins,
    ranked.losses,
    ranked.best_streak
  from ranked
  order by ranked.leaderboard_position
  limit least(greatest(coalesce(p_limit,50),1),100);
$$;

revoke all on function public.brasta_ranked_leaderboard(text,integer) from public;
grant execute on function public.brasta_ranked_leaderboard(text,integer) to anon, authenticated;

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
    opp.username::text,
    me.result,
    case when me.team = 'A' then m.score_a else m.score_b end,
    case when me.team = 'A' then m.score_b else m.score_a end,
    me.rank_before,
    me.rank_after
  from public.ranked_match_players me
  join public.ranked_matches m on m.id = me.match_id
  join public.ranked_match_players op on op.match_id = m.id and op.player_id <> me.player_id
  join public.profiles opp on opp.id = op.player_id
  where me.player_id = auth.uid() and m.mode = p_mode and m.status = 'completed'
  order by m.completed_at desc nulls last
  limit least(greatest(coalesce(p_limit,10),1),50);
$$;

revoke all on function public.brasta_my_recent_matches(text,integer) from public, anon;
grant execute on function public.brasta_my_recent_matches(text,integer) to authenticated;

create or replace function public.brasta_create_ranked_match(
  p_match_id uuid,
  p_room_code text,
  p_mode text,
  p_target_score integer,
  p_player_a uuid,
  p_seat_a smallint,
  p_player_b uuid,
  p_seat_b smallint
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  insert into public.ranked_matches(id, room_code, mode, target_score, status)
  values (p_match_id, p_room_code, p_mode, p_target_score, 'active');

  insert into public.ranked_match_players(match_id, player_id, seat, team)
  values
    (p_match_id, p_player_a, p_seat_a, case when p_seat_a in (1,3) then 'A' else 'B' end),
    (p_match_id, p_player_b, p_seat_b, case when p_seat_b in (1,3) then 'A' else 'B' end);
end;
$$;

revoke all on function public.brasta_create_ranked_match(uuid,text,text,integer,uuid,smallint,uuid,smallint) from public, anon, authenticated;
grant execute on function public.brasta_create_ranked_match(uuid,text,text,integer,uuid,smallint,uuid,smallint) to service_role;

create or replace function public.brasta_finalize_ranked_match(
  p_match_id uuid,
  p_winner_team text,
  p_score_a integer,
  p_score_b integer,
  p_a_player uuid,
  p_a_mu double precision,
  p_a_sigma double precision,
  p_a_ordinal double precision,
  p_b_player uuid,
  p_b_mu double precision,
  p_b_sigma double precision,
  p_b_ordinal double precision,
  p_events jsonb default '[]'::jsonb
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  a_before public.player_ratings%rowtype;
  b_before public.player_ratings%rowtype;
  a_win boolean := p_winner_team = 'A';
  b_win boolean := p_winner_team = 'B';
  event_row jsonb;
  seq_no integer := 0;
begin
  if p_winner_team not in ('A','B') then raise exception 'Invalid winner'; end if;

  select * into a_before from public.player_ratings where player_id = p_a_player and mode = '1v1' for update;
  select * into b_before from public.player_ratings where player_id = p_b_player and mode = '1v1' for update;
  if a_before.player_id is null or b_before.player_id is null then raise exception 'Missing player rating'; end if;

  update public.player_ratings set
    mu = p_a_mu,
    sigma = p_a_sigma,
    ordinal = p_a_ordinal,
    games_played = games_played + 1,
    wins = wins + case when a_win then 1 else 0 end,
    losses = losses + case when a_win then 0 else 1 end,
    current_streak = case when a_win then current_streak + 1 else 0 end,
    best_streak = case when a_win then greatest(best_streak, current_streak + 1) else best_streak end,
    updated_at = now()
  where player_id = p_a_player and mode = '1v1';

  update public.player_ratings set
    mu = p_b_mu,
    sigma = p_b_sigma,
    ordinal = p_b_ordinal,
    games_played = games_played + 1,
    wins = wins + case when b_win then 1 else 0 end,
    losses = losses + case when b_win then 0 else 1 end,
    current_streak = case when b_win then current_streak + 1 else 0 end,
    best_streak = case when b_win then greatest(best_streak, current_streak + 1) else best_streak end,
    updated_at = now()
  where player_id = p_b_player and mode = '1v1';

  update public.ranked_match_players set
    result = case when team = p_winner_team then 'win' else 'loss' end,
    mu_before = case when player_id = p_a_player then a_before.mu else b_before.mu end,
    sigma_before = case when player_id = p_a_player then a_before.sigma else b_before.sigma end,
    ordinal_before = case when player_id = p_a_player then a_before.ordinal else b_before.ordinal end,
    mu_after = case when player_id = p_a_player then p_a_mu else p_b_mu end,
    sigma_after = case when player_id = p_a_player then p_a_sigma else p_b_sigma end,
    ordinal_after = case when player_id = p_a_player then p_a_ordinal else p_b_ordinal end,
    rank_before = case when player_id = p_a_player
      then private.brasta_base_rank_name(a_before.games_played, a_before.ordinal)
      else private.brasta_base_rank_name(b_before.games_played, b_before.ordinal) end,
    rank_after = case when player_id = p_a_player
      then private.brasta_base_rank_name(a_before.games_played + 1, p_a_ordinal)
      else private.brasta_base_rank_name(b_before.games_played + 1, p_b_ordinal) end
  where match_id = p_match_id;

  update public.ranked_matches set
    status = 'completed', winner_team = p_winner_team,
    score_a = p_score_a, score_b = p_score_b,
    result_reason = 'score', completed_at = now()
  where id = p_match_id and status = 'active';

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

revoke all on function public.brasta_finalize_ranked_match(uuid,text,integer,integer,uuid,double precision,double precision,double precision,uuid,double precision,double precision,double precision,jsonb) from public, anon, authenticated;
grant execute on function public.brasta_finalize_ranked_match(uuid,text,integer,integer,uuid,double precision,double precision,double precision,uuid,double precision,double precision,double precision,jsonb) to service_role;

create index if not exists player_ratings_mode_ordinal_idx on public.player_ratings(mode, ordinal desc);
create index if not exists ranked_matches_completed_idx on public.ranked_matches(completed_at desc) where status = 'completed';
create index if not exists ranked_match_players_player_idx on public.ranked_match_players(player_id, match_id);

notify pgrst, 'reload schema';
