alter table public.tournaments
  add column if not exists mode text not null default '2v2';

alter table public.tournaments
  drop constraint if exists tournaments_mode_check;
alter table public.tournaments
  add constraint tournaments_mode_check check (mode in ('1v1', '2v2'));

alter table public.tournament_notifications
  drop constraint if exists tournament_notifications_notification_type_check;
alter table public.tournament_notifications
  add constraint tournament_notifications_notification_type_check
  check (notification_type in (
    'team_invite',
    'team_confirmed',
    'registration_confirmed',
    'schedule_updated',
    'tournament_starting',
    'bracket_published',
    'match_ready',
    'tournament_completed'
  ));

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

  if tournament_row.id is null or tournament_row.mode <> '2v2' then
    raise exception 'This tournament does not use team registration';
  end if;
  if tournament_row.status <> 'registration'
     or now() < tournament_row.registration_opens_at
     or now() >= tournament_row.registration_closes_at then
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

create or replace function public.brasta_register_tournament_player(
  p_tournament_id uuid,
  p_player_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  tournament_row public.tournaments%rowtype;
  player_name text;
  created_entry_id uuid;
begin
  if p_player_id is null then
    raise exception 'A player is required';
  end if;

  select * into tournament_row
  from public.tournaments
  where id = p_tournament_id
  for update;

  if tournament_row.id is null or tournament_row.mode <> '1v1' then
    raise exception 'This tournament does not use individual registration';
  end if;
  if tournament_row.status <> 'registration'
     or now() < tournament_row.registration_opens_at
     or now() >= tournament_row.registration_closes_at then
    raise exception 'Tournament registration is not open';
  end if;
  if exists (
    select 1 from public.tournament_team_members
    where tournament_id = p_tournament_id and player_id = p_player_id
  ) then
    raise exception 'You are already registered for this tournament';
  end if;
  if (select count(*) from public.tournament_teams where tournament_id = p_tournament_id and status = 'confirmed') >= tournament_row.max_teams then
    raise exception 'Tournament registration is full';
  end if;

  select coalesce(nullif(username, ''), nullif(display_name, ''), 'Player')
  into player_name
  from public.profiles
  where id = p_player_id;

  if player_name is null then
    raise exception 'Complete your Brasta profile before registering';
  end if;

  insert into public.tournament_teams(tournament_id, team_name, captain_id, status, confirmed_at)
  values (p_tournament_id, left(player_name, 32), p_player_id, 'confirmed', now())
  returning id into created_entry_id;

  insert into public.tournament_team_members(tournament_id, team_id, player_id, member_role, accepted_at)
  values (p_tournament_id, created_entry_id, p_player_id, 'captain', now());

  return created_entry_id;
end;
$$;

revoke all on function public.brasta_register_tournament_player(uuid,uuid) from public, anon, authenticated;
grant execute on function public.brasta_register_tournament_player(uuid,uuid) to service_role;

notify pgrst, 'reload schema';
