create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Brasta 2v2 Tournament' check (char_length(title) between 3 and 80),
  description text not null default '' check (char_length(description) <= 500),
  starts_at timestamptz not null,
  registration_opens_at timestamptz not null default now(),
  registration_closes_at timestamptz not null,
  max_teams smallint not null default 12 check (max_teams between 2 and 12),
  status text not null default 'draft' check (status in ('draft','registration','bracket','active','completed','canceled')),
  bracket_size smallint check (bracket_size in (2,4,8,16)),
  bracket_published_at timestamptz,
  champion_team_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tournament_registration_window check (registration_closes_at <= starts_at)
);

create table if not exists public.tournament_teams (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_name text not null check (char_length(team_name) between 2 and 32),
  captain_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','confirmed','withdrawn')),
  seed smallint check (seed between 1 and 12),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, team_name),
  unique (tournament_id, seed)
);

create table if not exists public.tournament_team_members (
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  team_id uuid not null references public.tournament_teams(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  member_role text not null check (member_role in ('captain','partner')),
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (team_id, player_id),
  unique (team_id, member_role),
  unique (tournament_id, player_id)
);

create table if not exists public.tournament_matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  round_number smallint not null check (round_number between 1 and 4),
  round_label text not null check (char_length(round_label) between 3 and 24),
  match_number smallint not null check (match_number between 1 and 8),
  team1_id uuid references public.tournament_teams(id) on delete set null,
  team2_id uuid references public.tournament_teams(id) on delete set null,
  winner_team_id uuid references public.tournament_teams(id) on delete set null,
  next_match_id uuid references public.tournament_matches(id) on delete set null,
  next_slot smallint check (next_slot in (1,2)),
  room_code text check (room_code is null or room_code ~ '^[A-Z0-9]{4,8}$'),
  status text not null default 'pending' check (status in ('pending','ready','active','completed','bye')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tournament_id, round_number, match_number)
);

alter table public.tournaments
  drop constraint if exists tournaments_champion_team_id_fkey;
alter table public.tournaments
  add constraint tournaments_champion_team_id_fkey
  foreign key (champion_team_id) references public.tournament_teams(id) on delete set null;

create table if not exists public.tournament_notifications (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type text not null check (notification_type in ('team_invite','team_confirmed','schedule_updated','tournament_starting','bracket_published','match_ready','tournament_completed')),
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 2 and 300),
  dedupe_key text not null unique,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.tournaments enable row level security;
alter table public.tournament_teams enable row level security;
alter table public.tournament_team_members enable row level security;
alter table public.tournament_matches enable row level security;
alter table public.tournament_notifications enable row level security;

revoke all on public.tournaments from anon, authenticated;
revoke all on public.tournament_teams from anon, authenticated;
revoke all on public.tournament_team_members from anon, authenticated;
revoke all on public.tournament_matches from anon, authenticated;
revoke all on public.tournament_notifications from anon, authenticated;

create index if not exists tournaments_status_starts_idx
  on public.tournaments(status, starts_at);
create index if not exists tournament_teams_tournament_status_idx
  on public.tournament_teams(tournament_id, status, created_at);
create index if not exists tournament_members_player_idx
  on public.tournament_team_members(player_id, tournament_id);
create index if not exists tournament_matches_tournament_round_idx
  on public.tournament_matches(tournament_id, round_number, match_number);
create index if not exists tournament_notifications_user_unread_idx
  on public.tournament_notifications(user_id, created_at desc)
  where read_at is null;

create or replace function public.brasta_create_tournament_team(
  p_tournament_id uuid,
  p_captain_id uuid,
  p_partner_id uuid,
  p_team_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tournament_row public.tournaments%rowtype;
  created_team_id uuid;
  clean_name text := btrim(coalesce(p_team_name, ''));
begin
  if p_captain_id is null or p_partner_id is null or p_captain_id = p_partner_id then
    raise exception 'A team requires two different players';
  end if;
  if char_length(clean_name) not between 2 and 32 then
    raise exception 'Team name must be 2 to 32 characters';
  end if;

  select * into tournament_row
  from public.tournaments
  where id = p_tournament_id
  for update;

  if tournament_row.id is null or tournament_row.status <> 'registration' then
    raise exception 'Tournament registration is not open';
  end if;
  if now() < tournament_row.registration_opens_at or now() >= tournament_row.registration_closes_at then
    raise exception 'Tournament registration is not open';
  end if;
  if (select count(*) from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed') >= tournament_row.max_teams then
    raise exception 'Tournament registration is full';
  end if;

  insert into public.tournament_teams(tournament_id, team_name, captain_id)
  values (p_tournament_id, clean_name, p_captain_id)
  returning id into created_team_id;

  insert into public.tournament_team_members(tournament_id, team_id, player_id, member_role, accepted_at)
  values
    (p_tournament_id, created_team_id, p_captain_id, 'captain', now()),
    (p_tournament_id, created_team_id, p_partner_id, 'partner', null);

  return created_team_id;
end;
$$;

revoke all on function public.brasta_create_tournament_team(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.brasta_create_tournament_team(uuid,uuid,uuid,text) to service_role;

create or replace function public.brasta_accept_tournament_team(
  p_team_id uuid,
  p_player_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  team_row public.tournament_teams%rowtype;
  tournament_row public.tournaments%rowtype;
begin
  select tt.* into team_row
  from public.tournament_teams tt
  join public.tournament_team_members tm on tm.team_id = tt.id
  where tt.id = p_team_id
    and tt.status = 'pending'
    and tm.player_id = p_player_id
    and tm.member_role = 'partner'
  for update of tt;

  if team_row.id is null then raise exception 'That team invitation is no longer available'; end if;

  select * into tournament_row
  from public.tournaments
  where id = team_row.tournament_id
  for update;

  if tournament_row.status <> 'registration'
     or now() < tournament_row.registration_opens_at
     or now() >= tournament_row.registration_closes_at then
    raise exception 'Tournament registration is not open';
  end if;
  if (select count(*) from public.tournament_teams where tournament_id = team_row.tournament_id and status = 'confirmed') >= tournament_row.max_teams then
    raise exception 'Tournament registration filled before this invitation was accepted';
  end if;

  update public.tournament_team_members
  set accepted_at = now()
  where team_id = team_row.id and player_id = p_player_id;

  update public.tournament_teams
  set status = 'confirmed', confirmed_at = now(), updated_at = now()
  where id = team_row.id;
end;
$$;

revoke all on function public.brasta_accept_tournament_team(uuid,uuid) from public, anon, authenticated;
grant execute on function public.brasta_accept_tournament_team(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
