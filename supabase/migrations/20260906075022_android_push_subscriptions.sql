create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'android',
  app_id text not null default 'app.brasta',
  revocation_hash text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_token_key unique (token),
  constraint push_subscriptions_platform_check check (platform in ('android')),
  constraint push_subscriptions_token_length_check check (char_length(token) between 20 and 4096),
  constraint push_subscriptions_revocation_hash_check check (revocation_hash ~ '^[0-9a-f]{64}$')
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, updated_at desc)
  where enabled = true;

alter table public.push_subscriptions enable row level security;

-- Device registrations are managed only by Brasta server routes. Creation
-- requires an account; deletion requires the matching device capability hash.
-- Browser roles never receive direct Data API access to FCM tokens.
revoke all on table public.push_subscriptions from anon, authenticated;
grant select, insert, update, delete on table public.push_subscriptions to service_role;

comment on table public.push_subscriptions is
  'Server-managed Firebase Cloud Messaging registrations for Brasta native apps.';
