create policy "No direct tournament access"
on public.tournaments
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct tournament team access"
on public.tournament_teams
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct tournament member access"
on public.tournament_team_members
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct tournament match access"
on public.tournament_matches
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct tournament notification access"
on public.tournament_notifications
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists tournaments_champion_team_idx
  on public.tournaments(champion_team_id);
create index if not exists tournaments_created_by_idx
  on public.tournaments(created_by);
create index if not exists tournament_teams_captain_idx
  on public.tournament_teams(captain_id);
create index if not exists tournament_matches_team1_idx
  on public.tournament_matches(team1_id);
create index if not exists tournament_matches_team2_idx
  on public.tournament_matches(team2_id);
create index if not exists tournament_matches_winner_idx
  on public.tournament_matches(winner_team_id);
create index if not exists tournament_matches_next_idx
  on public.tournament_matches(next_match_id);
create index if not exists tournament_notifications_tournament_idx
  on public.tournament_notifications(tournament_id);

notify pgrst, 'reload schema';
