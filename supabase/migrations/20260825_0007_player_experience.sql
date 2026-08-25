create table if not exists public.player_experience (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  games_played integer not null default 0 check (games_played >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.experience_events (
  id bigint generated always as identity primary key,
  player_id uuid not null references public.profiles(id) on delete cascade,
  match_key text not null,
  source text not null check (source in ('ranked','private')),
  mode text not null check (mode in ('1v1','2v2')),
  seat smallint not null check (seat between 1 and 4),
  created_at timestamptz not null default now(),
  unique (player_id, match_key),
  unique (match_key, seat)
);

alter table public.player_experience enable row level security;
alter table public.experience_events enable row level security;
revoke all on public.player_experience from anon, authenticated;
revoke all on public.experience_events from anon, authenticated;

create or replace function public.brasta_experience_status()
returns table (games_played integer)
language sql
security definer
set search_path = ''
as $$
  select coalesce((select x.games_played from public.player_experience x where x.player_id = auth.uid()), 0)::integer;
$$;
revoke all on function public.brasta_experience_status() from public, anon;
grant execute on function public.brasta_experience_status() to authenticated;

create or replace function public.brasta_credit_private_experience(
  p_player_id uuid,
  p_match_key text,
  p_mode text,
  p_seat smallint
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer := 0;
begin
  if p_player_id is null then raise exception 'Player is required'; end if;
  if p_match_key is null or length(p_match_key) < 8 then raise exception 'Match key is required'; end if;
  if p_mode not in ('1v1','2v2') then raise exception 'Unsupported mode'; end if;
  if p_seat not between 1 and 4 then raise exception 'Invalid seat'; end if;

  insert into public.experience_events(player_id, match_key, source, mode, seat)
  values (p_player_id, p_match_key, 'private', p_mode, p_seat)
  on conflict do nothing;
  get diagnostics inserted_count = row_count;

  if inserted_count = 1 then
    insert into public.player_experience(player_id, games_played, updated_at)
    values (p_player_id, 1, now())
    on conflict (player_id) do update
      set games_played = public.player_experience.games_played + 1,
          updated_at = now();
    return true;
  end if;

  return false;
end;
$$;
revoke all on function public.brasta_credit_private_experience(uuid,text,text,smallint) from public, anon, authenticated;
grant execute on function public.brasta_credit_private_experience(uuid,text,text,smallint) to service_role;

create or replace function private.brasta_credit_ranked_experience()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  rp record;
  inserted_count integer;
begin
  if new.status = 'completed' and (tg_op = 'INSERT' or old.status is distinct from 'completed') then
    for rp in
      select player_id, seat
      from public.ranked_match_players
      where match_id = new.id
    loop
      insert into public.experience_events(player_id, match_key, source, mode, seat, created_at)
      values (rp.player_id, 'ranked:' || new.id::text, 'ranked', new.mode, rp.seat, coalesce(new.completed_at, now()))
      on conflict do nothing;
      get diagnostics inserted_count = row_count;

      if inserted_count = 1 then
        insert into public.player_experience(player_id, games_played, updated_at)
        values (rp.player_id, 1, now())
        on conflict (player_id) do update
          set games_played = public.player_experience.games_played + 1,
              updated_at = now();
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function private.brasta_credit_ranked_experience() from public, anon, authenticated;

drop trigger if exists brasta_ranked_experience_trigger on public.ranked_matches;
create trigger brasta_ranked_experience_trigger
after insert or update of status on public.ranked_matches
for each row execute function private.brasta_credit_ranked_experience();

insert into public.experience_events(player_id, match_key, source, mode, seat, created_at)
select p.player_id, 'ranked:' || m.id::text, 'ranked', m.mode, p.seat, coalesce(m.completed_at, m.created_at)
from public.ranked_matches m
join public.ranked_match_players p on p.match_id = m.id
where m.status = 'completed'
on conflict do nothing;

insert into public.player_experience(player_id, games_played, updated_at)
select player_id, count(*)::integer, now()
from public.experience_events
group by player_id
on conflict (player_id) do update
  set games_played = excluded.games_played,
      updated_at = now();

create index if not exists experience_events_player_created_idx on public.experience_events(player_id, created_at desc);

notify pgrst, 'reload schema';
