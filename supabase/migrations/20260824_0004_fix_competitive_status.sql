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
  on conflict do nothing;

  select pr.* into r
  from public.player_ratings pr
  where pr.player_id = uid and pr.mode = p_mode;

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

notify pgrst, 'reload schema';
