-- Season Pass account foundation.
--
-- This migration intentionally seeds Season 1 as a draft.  The catalog is
-- account-addressable now, while season dates, XP awards, and checkout remain
-- gated until the launch rules are finalized.  All writes are server-only;
-- authenticated clients read their state through the Brasta API.

create table if not exists public.season_pass_seasons (
  season_id text primary key,
  name text not null,
  status text not null check (status in ('draft', 'active', 'ended')),
  starts_at timestamptz null,
  ends_at timestamptz null,
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  duration_weeks integer not null check (duration_weeks > 0),
  tier_count integer not null check (tier_count > 0),
  xp_per_tier integer not null check (xp_per_tier > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.season_pass_sets (
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  set_id text not null,
  name text not null,
  description text not null default '',
  is_premium boolean not null default true,
  sort_order integer not null default 0 check (sort_order >= 0),
  primary key (season_id, set_id)
);

create table if not exists public.season_pass_rewards (
  reward_id text primary key,
  season_id text not null,
  set_id text not null,
  name text not null,
  kind text not null check (kind in ('Card back', 'Profile title', 'Avatar frame', 'Table felt')),
  tier integer not null check (tier > 0),
  is_premium boolean not null default true,
  motif text not null default '',
  color text not null default '',
  description text not null default '',
  matching_card_back_id text null,
  asset_path text not null,
  created_at timestamptz not null default now(),
  unique (season_id, reward_id),
  foreign key (season_id, set_id)
    references public.season_pass_sets(season_id, set_id)
    on delete cascade
);

create index if not exists season_pass_rewards_track_idx
  on public.season_pass_rewards (season_id, tier, reward_id);

create table if not exists public.season_pass_progress (
  player_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  xp integer not null default 0 check (xp >= 0),
  first_seen_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (player_id, season_id)
);

create table if not exists public.season_pass_xp_events (
  event_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  match_id uuid null references public.match_history(id) on delete set null,
  match_key text not null,
  source text not null check (source in ('match_completion', 'match_win', 'admin')),
  xp integer not null check (xp > 0),
  metadata jsonb not null default '{}'::jsonb,
  awarded_at timestamptz not null default now(),
  unique (season_id, player_id, match_key, source)
);

create index if not exists season_pass_xp_events_player_idx
  on public.season_pass_xp_events (player_id, season_id, awarded_at desc);

create table if not exists public.season_pass_entitlements (
  entitlement_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  provider text not null check (provider in ('web', 'google_play', 'admin')),
  provider_transaction_id text not null,
  status text not null check (status in ('pending', 'active', 'refunded', 'revoked')),
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  purchased_at timestamptz null,
  refunded_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_transaction_id)
);

create index if not exists season_pass_entitlements_player_idx
  on public.season_pass_entitlements (player_id, season_id, status);

create table if not exists public.season_pass_reward_ownership (
  player_id uuid not null references public.profiles(id) on delete cascade,
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  reward_id text not null references public.season_pass_rewards(reward_id) on delete cascade,
  source text not null check (source in ('season_progress', 'premium_entitlement', 'admin')),
  awarded_at timestamptz not null default now(),
  primary key (player_id, reward_id),
  foreign key (season_id, reward_id)
    references public.season_pass_rewards(season_id, reward_id)
    on delete cascade
);

create index if not exists season_pass_reward_ownership_season_idx
  on public.season_pass_reward_ownership (player_id, season_id, awarded_at);

create table if not exists public.season_pass_equipment (
  player_id uuid not null references public.profiles(id) on delete cascade,
  slot text not null check (slot in ('card_back', 'table_felt', 'avatar_frame', 'profile_title')),
  reward_id text null references public.season_pass_rewards(reward_id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (player_id, slot)
);

alter table public.season_pass_seasons enable row level security;
alter table public.season_pass_sets enable row level security;
alter table public.season_pass_rewards enable row level security;
alter table public.season_pass_progress enable row level security;
alter table public.season_pass_xp_events enable row level security;
alter table public.season_pass_entitlements enable row level security;
alter table public.season_pass_reward_ownership enable row level security;
alter table public.season_pass_equipment enable row level security;

revoke all on public.season_pass_seasons from public, anon, authenticated;
revoke all on public.season_pass_sets from public, anon, authenticated;
revoke all on public.season_pass_rewards from public, anon, authenticated;
revoke all on public.season_pass_progress from public, anon, authenticated;
revoke all on public.season_pass_xp_events from public, anon, authenticated;
revoke all on public.season_pass_entitlements from public, anon, authenticated;
revoke all on public.season_pass_reward_ownership from public, anon, authenticated;
revoke all on public.season_pass_equipment from public, anon, authenticated;

grant select, insert, update, delete on public.season_pass_seasons to service_role;
grant select, insert, update, delete on public.season_pass_sets to service_role;
grant select, insert, update, delete on public.season_pass_rewards to service_role;
grant select, insert, update, delete on public.season_pass_progress to service_role;
grant select, insert, update, delete on public.season_pass_xp_events to service_role;
grant select, insert, update, delete on public.season_pass_entitlements to service_role;
grant select, insert, update, delete on public.season_pass_reward_ownership to service_role;
grant select, insert, update, delete on public.season_pass_equipment to service_role;

insert into public.season_pass_seasons
  (season_id, name, status, price_cents, currency, duration_weeks, tier_count, xp_per_tier)
values
  ('season_1', 'The Golden Table', 'draft', 499, 'USD', 8, 12, 250)
on conflict (season_id) do update set
  name = excluded.name,
  price_cents = excluded.price_cents,
  currency = excluded.currency,
  duration_weeks = excluded.duration_weeks,
  tier_count = excluded.tier_count,
  xp_per_tier = excluded.xp_per_tier,
  updated_at = now();

insert into public.season_pass_sets
  (season_id, set_id, name, description, is_premium, sort_order)
values
  ('season_1', 'gilded_court', 'Golden Spade', 'Engraved gold, warm ivory, and the emblems of a classic card room.', false, 10),
  ('season_1', 'royal_crown', 'Royal Crown', 'Royal purple velvet, engraved gold rails, ruby accents, and a crowned crest.', true, 20),
  ('season_1', 'garnet_mosaic', 'Grand Ruby', 'Faceted rubies, burgundy enamel, and geometric gold inlays.', true, 30),
  ('season_1', 'romani_heritage', 'Romani Heritage', 'Deep red damask, engraved gold wagon wheels, and a bezel of gold coins.', true, 40),
  ('season_1', 'astrology', 'Astrology', 'Deep teal, celestial charts, orbital rings, and gold instrument markings.', true, 50)
on conflict (season_id, set_id) do update set
  name = excluded.name,
  description = excluded.description,
  is_premium = excluded.is_premium,
  sort_order = excluded.sort_order;

insert into public.season_pass_rewards
  (reward_id, season_id, set_id, name, kind, tier, is_premium, motif, color, matching_card_back_id, asset_path, description)
values
  ('first_seat', 'season_1', 'gilded_court', 'Ace of Spades', 'Profile title', 1, false, '♠', 'green', null, '/cosmetics/season-1/first_seat.svg', 'The Ace of Spades title with a gold spade medallion and fine guilloche engraving from the Golden Spade set.'),
  ('gilded_suits', 'season_1', 'gilded_court', 'Golden Spade', 'Card back', 1, false, '♠', 'gold', null, '/cosmetics/season-1/gilded_suits.svg', 'Mirrored scrollwork and fine guilloche lines surround a spade medallion on a deep green field.'),
  ('velvet_club', 'season_1', 'royal_crown', 'Royal Crown', 'Card back', 2, true, '♛', 'purple', null, '/cosmetics/season-1/velvet_club.svg', 'A ruby-and-gold crown crest, engraved rope border, and heraldic flourishes sit on a royal purple field.'),
  ('gilded_frame', 'season_1', 'gilded_court', 'Gilded Bezel', 'Avatar frame', 3, false, '♠', 'gold', null, '/cosmetics/season-1/gilded_frame.svg', 'A deep green portrait bezel with engraved gold scrollwork, fine guilloche lines, and a spade crest matching the Golden Spade set.'),
  ('gilded_felt', 'season_1', 'gilded_court', 'Golden Spade Felt', 'Table felt', 3, false, '♠', 'gold', 'gilded_suits', '/cosmetics/season-1/gilded_felt.svg', 'Deep green cloth with engraved gold scrolls and spade inlays, matching the Golden Spade card back. Fine ornament follows the rail around a quiet playing surface.'),
  ('woven_green', 'season_1', 'royal_crown', 'Royal Crown Felt', 'Table felt', 4, true, '♛', 'purple', 'velvet_club', '/cosmetics/season-1/woven_green.svg', 'Responsive royal-purple cloth with gold rope rails, crown medallions, ruby accents, and a quiet center for clear play.'),
  ('laurel', 'season_1', 'romani_heritage', 'Gold Coin Bezel', 'Avatar frame', 4, true, 'gold-coins', 'gold', null, '/cosmetics/season-1/laurel.svg', 'Sixteen individually engraved gold coins surround a deep red bezel, with tiny wheel stamps that match the Romani Heritage set.'),
  ('ruby_diamond', 'season_1', 'garnet_mosaic', 'Grand Ruby', 'Card back', 5, true, '♦', 'ruby', null, '/cosmetics/season-1/ruby_diamond.svg', 'Faceted ruby glass sits within angular gold inlays and a repeating burgundy mosaic.'),
  ('garnet_felt', 'season_1', 'garnet_mosaic', 'Grand Ruby Felt', 'Table felt', 5, true, '♦', 'ruby', 'ruby_diamond', '/cosmetics/season-1/garnet_felt.svg', 'A faceted ruby mosaic and geometric gold inlays surround deep plum felt, matching the Grand Ruby card back. The central area stays subdued for card visibility.'),
  ('golden_wagon', 'season_1', 'romani_heritage', 'Romani Heritage', 'Card back', 6, true, 'wagon-wheel', 'deep-red', null, '/cosmetics/season-1/golden_wagon.svg', 'A twelve-spoke gold wagon wheel with carved spokes, an engraved rim, and a riveted hub. Ornamental scrollwork and braided borders frame a deep red damask field.'),
  ('royal_title', 'season_1', 'royal_crown', 'Sovereign', 'Profile title', 7, true, '♛', 'purple', null, '/cosmetics/season-1/royal_title.svg', 'The Sovereign title with a purple enamel seal, engraved gold border, and ruby-and-gold crest from the Royal Crown set.'),
  ('golden_hour', 'season_1', 'romani_heritage', 'Romani Heritage Felt', 'Table felt', 7, true, 'wagon-wheel', 'deep-red', 'golden_wagon', '/cosmetics/season-1/golden_hour.svg', 'Deep red fabric with damask edging, gold carriage scrolls, and the same engraved wheel medallions as the Romani Heritage card back.'),
  ('garnet_title', 'season_1', 'garnet_mosaic', 'Ruby Baron', 'Profile title', 8, true, '♦', 'ruby', null, '/cosmetics/season-1/garnet_title.svg', 'The Ruby Baron title with a faceted ruby centerpiece, angular gold inlays, and burgundy enamel from the Grand Ruby set.'),
  ('ruby_frame', 'season_1', 'garnet_mosaic', 'Ruby Halo', 'Avatar frame', 9, true, 'B', 'ruby', null, '/cosmetics/season-1/ruby_frame.svg', 'Sixteen faceted rubies and tiny gold beads form a jeweled halo around your portrait.'),
  ('midnight', 'season_1', 'astrology', 'Astrology', 'Card back', 10, true, '♠', 'green', null, '/cosmetics/season-1/midnight.svg', 'A crescent moon set inside a spade lens, surrounded by orbital rings, star charts, and an instrument dial.'),
  ('astrology_title', 'season_1', 'astrology', 'Stargazer', 'Profile title', 10, true, 'crescent-spade', 'teal', null, '/cosmetics/season-1/astrology_title.svg', 'The Stargazer title with a deep teal enamel badge, crescent spade, orbital rings, and engraved gold instrument dial from the Astrology set.'),
  ('midnight_felt', 'season_1', 'astrology', 'Astrology Felt', 'Table felt', 11, true, '♠', 'green', 'midnight', '/cosmetics/season-1/midnight_felt.svg', 'Deep teal cloth bordered by fine star charts, instrument markings, and orbital spade inlays, matching the Astrology card back.'),
  ('astrology_frame', 'season_1', 'astrology', 'Orbital Halo', 'Avatar frame', 11, true, 'crescent-spade', 'teal', null, '/cosmetics/season-1/astrology_frame.svg', 'An engraved deep teal bezel with fine gold instrument markings, crossing orbital arcs, and tiny star charts. A crescent-spade crest crowns the frame while the portrait opening stays clear.'),
  ('royal_frame', 'season_1', 'royal_crown', 'Royal Diadem', 'Avatar frame', 11, true, '♛', 'purple', null, '/cosmetics/season-1/royal_frame.svg', 'Royal purple enamel, gold rope engraving, and ruby jewels surround a clear portrait opening, topped by the Royal Crown crest.'),
  ('golden_brasta', 'season_1', 'romani_heritage', 'Gypsy', 'Profile title', 12, true, 'wagon-wheel', 'gold', null, '/cosmetics/season-1/golden_brasta.svg', 'The Gypsy title with the Romani Heritage set’s gold wagon-wheel badge, carved spokes, engraved rim, and riveted hub.')
on conflict (reward_id) do update set
  season_id = excluded.season_id,
  set_id = excluded.set_id,
  name = excluded.name,
  kind = excluded.kind,
  tier = excluded.tier,
  is_premium = excluded.is_premium,
  motif = excluded.motif,
  color = excluded.color,
  matching_card_back_id = excluded.matching_card_back_id,
  asset_path = excluded.asset_path,
  description = excluded.description;

create or replace function public.brasta_grant_season_pass_rewards(
  p_player_id uuid,
  p_season_id text default 'season_1'
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_xp integer;
  v_tier_count integer;
  v_xp_per_tier integer;
  v_premium boolean := false;
  v_inserted integer := 0;
begin
  if p_player_id is null then raise exception 'Player is required'; end if;

  select p.xp, s.tier_count, s.xp_per_tier
    into v_xp, v_tier_count, v_xp_per_tier
  from public.season_pass_progress p
  join public.season_pass_seasons s on s.season_id = p.season_id
  where p.player_id = p_player_id and p.season_id = p_season_id;

  if not found then return 0; end if;

  select exists (
    select 1 from public.season_pass_entitlements e
    where e.player_id = p_player_id
      and e.season_id = p_season_id
      and e.status = 'active'
  ) into v_premium;

  insert into public.season_pass_reward_ownership
    (player_id, season_id, reward_id, source, awarded_at)
  select
    p_player_id,
    r.season_id,
    r.reward_id,
    case when r.is_premium then 'premium_entitlement' else 'season_progress' end,
    now()
  from public.season_pass_rewards r
  where r.season_id = p_season_id
    and r.tier <= least(v_tier_count, floor(v_xp::numeric / v_xp_per_tier)::integer)
    and (not r.is_premium or v_premium)
  on conflict (player_id, reward_id) do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function public.brasta_grant_season_pass_rewards(uuid, text) from public, anon, authenticated;
grant execute on function public.brasta_grant_season_pass_rewards(uuid, text) to service_role;

create or replace function public.brasta_award_season_pass_xp(
  p_player_id uuid,
  p_season_id text,
  p_match_key text,
  p_match_id uuid,
  p_source text,
  p_xp integer,
  p_metadata jsonb default '{}'::jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_season public.season_pass_seasons%rowtype;
  v_inserted integer := 0;
  v_xp integer;
begin
  if p_player_id is null then raise exception 'Player is required'; end if;
  if p_season_id is null or length(trim(p_season_id)) = 0 then raise exception 'Season is required'; end if;
  if p_match_key is null or length(trim(p_match_key)) < 8 then raise exception 'Match key is required'; end if;
  if p_source not in ('match_completion', 'match_win', 'admin') then raise exception 'Invalid Season XP source'; end if;
  if p_xp is null or p_xp <= 0 or p_xp > 10000 then raise exception 'Invalid Season XP amount'; end if;

  select * into v_season from public.season_pass_seasons where season_id = p_season_id;
  if not found then raise exception 'Season not found'; end if;
  if v_season.status <> 'active'
    or (v_season.starts_at is not null and now() < v_season.starts_at)
    or (v_season.ends_at is not null and now() >= v_season.ends_at)
  then
    return 0;
  end if;

  insert into public.season_pass_xp_events
    (player_id, season_id, match_id, match_key, source, xp, metadata, awarded_at)
  values
    (p_player_id, p_season_id, p_match_id, trim(p_match_key), p_source, p_xp, coalesce(p_metadata, '{}'::jsonb), now())
  on conflict (season_id, player_id, match_key, source) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    insert into public.season_pass_progress (player_id, season_id, xp, updated_at)
    values (
      p_player_id,
      p_season_id,
      least(v_season.tier_count * v_season.xp_per_tier, p_xp),
      now()
    )
    on conflict (player_id, season_id) do update set
      xp = least(
        v_season.tier_count * v_season.xp_per_tier,
        public.season_pass_progress.xp + excluded.xp
      ),
      updated_at = now();

    perform public.brasta_grant_season_pass_rewards(p_player_id, p_season_id);
  end if;

  select xp into v_xp
  from public.season_pass_progress
  where player_id = p_player_id and season_id = p_season_id;
  return coalesce(v_xp, 0);
end;
$$;

revoke all on function public.brasta_award_season_pass_xp(uuid, text, text, uuid, text, integer, jsonb) from public, anon, authenticated;
grant execute on function public.brasta_award_season_pass_xp(uuid, text, text, uuid, text, integer, jsonb) to service_role;

notify pgrst, 'reload schema';
