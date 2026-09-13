-- Make the server-only Season Pass boundary explicit to the database linter.
-- The API uses the service_role key after validating the user's access token;
-- browser roles receive an intentional deny policy and no table grants.

create policy season_pass_seasons_no_client_access
  on public.season_pass_seasons for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_sets_no_client_access
  on public.season_pass_sets for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_rewards_no_client_access
  on public.season_pass_rewards for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_progress_no_client_access
  on public.season_pass_progress for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_xp_events_no_client_access
  on public.season_pass_xp_events for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_entitlements_no_client_access
  on public.season_pass_entitlements for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_reward_ownership_no_client_access
  on public.season_pass_reward_ownership for all to anon, authenticated
  using (false) with check (false);
create policy season_pass_equipment_no_client_access
  on public.season_pass_equipment for all to anon, authenticated
  using (false) with check (false);

create index if not exists season_pass_rewards_set_idx
  on public.season_pass_rewards (season_id, set_id);
create index if not exists season_pass_progress_season_idx
  on public.season_pass_progress (season_id);
create index if not exists season_pass_xp_events_match_idx
  on public.season_pass_xp_events (match_id)
  where match_id is not null;
create index if not exists season_pass_entitlements_season_idx
  on public.season_pass_entitlements (season_id);
create index if not exists season_pass_equipment_reward_idx
  on public.season_pass_equipment (reward_id)
  where reward_id is not null;
create index if not exists season_pass_reward_ownership_reward_idx
  on public.season_pass_reward_ownership (reward_id);
create index if not exists season_pass_reward_ownership_season_only_idx
  on public.season_pass_reward_ownership (season_id);
create index if not exists season_pass_reward_ownership_season_reward_idx
  on public.season_pass_reward_ownership (season_id, reward_id);

notify pgrst, 'reload schema';
