-- Beta-only equipment is isolated from earned rewards, XP, and purchases.
create table private.season_pass_test_access (
  player_id uuid primary key references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  created_at timestamptz not null default now()
);
create table private.season_pass_test_equipment (
  player_id uuid not null references private.season_pass_test_access(player_id) on delete cascade,
  season_id text not null references public.season_pass_seasons(season_id) on delete cascade,
  slot text not null check (slot in ('card_back','table_felt','avatar_frame','profile_title')),
  reward_id text,
  title_source text check (title_source in ('season','earned','none')),
  updated_at timestamptz not null default now(),
  primary key (player_id,season_id,slot),
  foreign key (season_id,reward_id) references public.season_pass_rewards(season_id,reward_id)
);
alter table private.season_pass_test_access enable row level security;
alter table private.season_pass_test_equipment enable row level security;
revoke all on private.season_pass_test_access, private.season_pass_test_equipment from public, anon, authenticated;

create or replace function public.brasta_get_season_pass_test_state(p_player_id uuid,p_season_id text default 'season_1')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_state jsonb;
  v_equipment jsonb;
begin
  if auth.uid() is null or p_player_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  if not exists (select 1 from private.season_pass_test_access where player_id=p_player_id and enabled) then
    return null;
  end if;
  v_state := public.brasta_get_season_pass_state(p_player_id,p_season_id);
  select jsonb_build_object(
    'card_back',(select reward_id from private.season_pass_test_equipment where player_id=p_player_id and season_id=p_season_id and slot='card_back'),
    'table_felt',(select reward_id from private.season_pass_test_equipment where player_id=p_player_id and season_id=p_season_id and slot='table_felt'),
    'avatar_frame',(select reward_id from private.season_pass_test_equipment where player_id=p_player_id and season_id=p_season_id and slot='avatar_frame'),
    'profile_title',(select reward_id from private.season_pass_test_equipment where player_id=p_player_id and season_id=p_season_id and slot='profile_title')
  ) into v_equipment;
  return v_state || jsonb_build_object(
    'testingAccess',true,
    'testRewardIds',(select coalesce(jsonb_agg(reward_id order by tier,reward_id),'[]'::jsonb) from public.season_pass_rewards where season_id=p_season_id),
    'equipment',v_equipment,
    'titleSource',coalesce((select title_source from private.season_pass_test_equipment where player_id=p_player_id and season_id=p_season_id and slot='profile_title'),'earned')
  );
end;
$$;

create or replace function public.brasta_equip_season_pass_test_reward(
  p_player_id uuid,p_season_id text,p_slot text,p_reward_id text default null,p_title_source text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_enabled boolean;
  v_kind text;
  v_source text;
begin
  if auth.uid() is null or p_player_id is distinct from auth.uid() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  select enabled into v_enabled from private.season_pass_test_access where player_id=p_player_id for share;
  if not coalesce(v_enabled,false) then return null; end if;
  if p_slot is null or p_slot not in ('card_back','table_felt','avatar_frame','profile_title') then
    raise exception 'That reward does not fit this equipment slot';
  end if;
  if p_title_source is not null and (p_slot <> 'profile_title' or p_reward_id is not null or p_title_source not in ('earned','none')) then
    raise exception 'That title source does not fit this equipment slot';
  end if;
  if not exists (select 1 from public.season_pass_seasons where season_id=p_season_id) then raise exception 'Season not found'; end if;
  if p_reward_id is not null then
    select kind into v_kind from public.season_pass_rewards where reward_id=p_reward_id and season_id=p_season_id;
    if not found then raise exception 'Reward not found'; end if;
    if v_kind <> (case p_slot when 'card_back' then 'Card back' when 'table_felt' then 'Table felt' when 'avatar_frame' then 'Avatar frame' else 'Profile title' end) then
      raise exception 'That reward does not fit this equipment slot';
    end if;
  end if;
  v_source := case when p_slot <> 'profile_title' then null when p_reward_id is not null then 'season' else coalesce(p_title_source,'none') end;
  insert into private.season_pass_test_equipment(player_id,season_id,slot,reward_id,title_source)
    values(p_player_id,p_season_id,p_slot,p_reward_id,v_source)
    on conflict(player_id,season_id,slot) do update
      set reward_id=excluded.reward_id,title_source=excluded.title_source,updated_at=now();
  return public.brasta_get_season_pass_test_state(p_player_id,p_season_id);
end;
$$;
revoke all on function public.brasta_get_season_pass_test_state(uuid,text) from public,anon;
revoke all on function public.brasta_equip_season_pass_test_reward(uuid,text,text,text,text) from public,anon;
grant execute on function public.brasta_get_season_pass_test_state(uuid,text) to authenticated;
grant execute on function public.brasta_equip_season_pass_test_reward(uuid,text,text,text,text) to authenticated;
notify pgrst,'reload schema';
