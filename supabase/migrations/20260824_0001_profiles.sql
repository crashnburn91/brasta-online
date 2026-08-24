create extension if not exists citext;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username::text ~ '^[A-Za-z0-9_]{3,20}$'),
  constraint profiles_display_name_length check (display_name is null or char_length(display_name) between 1 and 24)
);

alter table public.profiles enable row level security;

create policy "Profiles are publicly readable"
on public.profiles
for select
using (true);

create policy "Users can create their own profile"
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy "Users can update their own profile"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create or replace function public.handle_new_brasta_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  suggested_name text;
  suggested_avatar text;
begin
  suggested_name := left(coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    new.raw_user_meta_data ->> 'user_name',
    split_part(coalesce(new.email, ''), '@', 1),
    'Player'
  ), 24);
  suggested_avatar := nullif(coalesce(
    new.raw_user_meta_data ->> 'avatar_url',
    new.raw_user_meta_data ->> 'picture',
    ''
  ), '');

  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, nullif(suggested_name, ''), suggested_avatar)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_brasta_profile on auth.users;
create trigger on_auth_user_created_brasta_profile
after insert on auth.users
for each row execute procedure public.handle_new_brasta_user();

create or replace function public.touch_profile_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute procedure public.touch_profile_updated_at();
