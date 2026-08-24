create schema if not exists extensions;
alter extension citext set schema extensions;

create policy "No direct client rating access"
on public.player_ratings
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct client ranked match access"
on public.ranked_matches
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct client ranked participant access"
on public.ranked_match_players
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

create policy "No direct client ranked event access"
on public.ranked_match_events
as restrictive
for all
to anon, authenticated
using (false)
with check (false);

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
  match_is_active boolean := false;
begin
  if p_winner_team not in ('A','B') then raise exception 'Invalid winner'; end if;

  select true into match_is_active
  from public.ranked_matches
  where id = p_match_id and status = 'active'
  for update;

  if coalesce(match_is_active, false) is false then
    return;
  end if;

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
  where id = p_match_id;

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

notify pgrst, 'reload schema';
