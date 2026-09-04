create table if not exists public.chat_room_members (
  room_id text not null,
  room_code text not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  seat smallint not null,
  mode text not null,
  room_kind text not null,
  joined_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (room_id, user_id),
  constraint chat_room_members_room_id_length check (char_length(room_id) between 8 and 80),
  constraint chat_room_members_room_code_format check (room_code ~ '^[A-Z0-9]{4,8}$'),
  constraint chat_room_members_seat_check check (seat between 1 and 4),
  constraint chat_room_members_mode_check check (mode in ('1v1','2v2')),
  constraint chat_room_members_room_kind_check check (room_kind in ('private','ranked'))
);

create table if not exists public.chat_user_consents (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  policy_version text not null,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_user_consents_policy_version_length check (char_length(policy_version) between 1 and 32)
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  room_id text not null,
  room_code text not null,
  room_kind text not null,
  mode text not null,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  sender_seat smallint not null,
  sender_team text not null,
  sender_username text not null,
  sender_display_name text,
  sender_avatar_url text,
  content text not null,
  status text not null default 'visible',
  moderation_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  constraint chat_messages_room_id_length check (char_length(room_id) between 8 and 80),
  constraint chat_messages_room_code_format check (room_code ~ '^[A-Z0-9]{4,8}$'),
  constraint chat_messages_room_kind_check check (room_kind in ('private','ranked')),
  constraint chat_messages_mode_check check (mode in ('1v1','2v2')),
  constraint chat_messages_sender_seat_check check (sender_seat between 1 and 4),
  constraint chat_messages_sender_team_check check (sender_team in ('A','B')),
  constraint chat_messages_username_length check (char_length(sender_username) between 1 and 20),
  constraint chat_messages_display_name_length check (sender_display_name is null or char_length(sender_display_name) between 1 and 24),
  constraint chat_messages_avatar_length check (sender_avatar_url is null or char_length(sender_avatar_url) <= 2048),
  constraint chat_messages_content_length check (char_length(content) between 1 and 280),
  constraint chat_messages_status_check check (status in ('visible','removed')),
  constraint chat_messages_moderation_reason_length check (moderation_reason is null or char_length(moderation_reason) <= 500)
);

create table if not exists public.chat_reports (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.chat_messages(id) on delete set null,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_user_id uuid not null references public.profiles(id) on delete cascade,
  room_id text not null,
  reason text not null,
  details text,
  message_snapshot text not null,
  status text not null default 'open',
  moderator_id uuid references public.profiles(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (message_id, reporter_id),
  constraint chat_reports_reason_check check (reason in ('harassment','hate','sexual','threats','spam','personal_info','cheating','other')),
  constraint chat_reports_details_length check (details is null or char_length(details) <= 500),
  constraint chat_reports_snapshot_length check (char_length(message_snapshot) between 1 and 280),
  constraint chat_reports_status_check check (status in ('open','reviewing','resolved','dismissed')),
  constraint chat_reports_resolution_length check (resolution_note is null or char_length(resolution_note) <= 1000)
);

create table if not exists public.chat_moderation_actions (
  id uuid primary key default gen_random_uuid(),
  target_user_id uuid not null references public.profiles(id) on delete cascade,
  moderator_user_id uuid references public.profiles(id) on delete set null,
  related_report_id uuid references public.chat_reports(id) on delete set null,
  action_type text not null,
  reason text not null,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chat_moderation_actions_action_type_check check (action_type in ('warning','mute','suspension','ban','reversal')),
  constraint chat_moderation_actions_reason_length check (char_length(reason) between 1 and 1000),
  constraint chat_moderation_actions_expiry check (expires_at is null or expires_at > starts_at)
);

create table if not exists public.chat_safety_events (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  room_id text not null,
  reason_code text not null,
  content_hash text not null,
  created_at timestamptz not null default now(),
  constraint chat_safety_events_reason_length check (char_length(reason_code) between 1 and 64),
  constraint chat_safety_events_hash_length check (char_length(content_hash) = 64)
);

create index if not exists chat_room_members_user_expiry_idx on public.chat_room_members(user_id, expires_at desc);
create index if not exists chat_room_members_room_expiry_idx on public.chat_room_members(room_id, expires_at desc);
create index if not exists chat_messages_room_created_idx on public.chat_messages(room_id, created_at desc);
create index if not exists chat_messages_sender_created_idx on public.chat_messages(sender_id, created_at desc);
create index if not exists chat_messages_expiry_idx on public.chat_messages(expires_at);
create index if not exists chat_reports_status_created_idx on public.chat_reports(status, created_at desc);
create index if not exists chat_reports_reported_user_idx on public.chat_reports(reported_user_id, created_at desc);
create index if not exists chat_reports_moderator_idx on public.chat_reports(moderator_id) where moderator_id is not null;
create index if not exists chat_moderation_actions_target_active_idx on public.chat_moderation_actions(target_user_id, starts_at desc, expires_at) where revoked_at is null;
create index if not exists chat_moderation_actions_moderator_idx on public.chat_moderation_actions(moderator_user_id) where moderator_user_id is not null;
create index if not exists chat_moderation_actions_report_idx on public.chat_moderation_actions(related_report_id) where related_report_id is not null;
create index if not exists chat_safety_events_user_created_idx on public.chat_safety_events(user_id, created_at desc);

alter table public.chat_room_members enable row level security;
alter table public.chat_user_consents enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reports enable row level security;
alter table public.chat_moderation_actions enable row level security;
alter table public.chat_safety_events enable row level security;

create policy "Chat members can read their active memberships" on public.chat_room_members for select to authenticated using ((select auth.uid()) = user_id and expires_at > now());
create policy "Chat members can read unblocked room messages" on public.chat_messages for select to authenticated using (
  expires_at > now()
  and exists (select 1 from public.chat_room_members membership where membership.room_id = chat_messages.room_id and membership.user_id = (select auth.uid()) and membership.expires_at > now())
  and not exists (select 1 from public.friend_blocks blocked where blocked.blocker_id = (select auth.uid()) and blocked.blocked_id = chat_messages.sender_id)
);
create policy "Deny direct chat consent access" on public.chat_user_consents for all to anon, authenticated using (false) with check (false);
create policy "Deny direct chat report access" on public.chat_reports for all to anon, authenticated using (false) with check (false);
create policy "Deny direct moderation action access" on public.chat_moderation_actions for all to anon, authenticated using (false) with check (false);
create policy "Deny direct safety event access" on public.chat_safety_events for all to anon, authenticated using (false) with check (false);

revoke all on public.chat_room_members, public.chat_user_consents, public.chat_messages, public.chat_reports, public.chat_moderation_actions, public.chat_safety_events from anon, authenticated;
grant select on public.chat_room_members, public.chat_messages to authenticated;
grant all on public.chat_room_members, public.chat_user_consents, public.chat_messages, public.chat_reports, public.chat_moderation_actions, public.chat_safety_events to service_role;
