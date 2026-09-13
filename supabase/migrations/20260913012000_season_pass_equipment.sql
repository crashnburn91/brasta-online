-- Account-owned Season Pass equipment.
--
-- The browser may request an equip/unequip action, but it never writes the
-- equipment table directly. This function verifies that the reward belongs to
-- the requested slot and that the player actually owns it before upserting the
-- account's current selection.

create or replace function public.brasta_equip_season_pass_reward(
  p_player_id uuid,
  p_season_id text,
  p_slot text,
  p_reward_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_reward_id text := nullif(trim(coalesce(p_reward_id, '')), '');
  v_kind text;
  v_reward_season text;
begin
  if p_player_id is null then raise exception 'Player is required'; end if;
  if p_season_id is null or length(trim(p_season_id)) = 0 then raise exception 'Season is required'; end if;
  if p_slot not in ('card_back', 'table_felt', 'avatar_frame', 'profile_title') then
    raise exception 'Invalid Season Pass equipment slot';
  end if;

  if v_reward_id is not null then
    select r.kind, r.season_id
      into v_kind, v_reward_season
    from public.season_pass_rewards r
    where r.reward_id = v_reward_id;

    if not found or v_reward_season <> p_season_id then
      raise exception 'Season Pass reward not found';
    end if;

    if (p_slot = 'card_back' and v_kind <> 'Card back')
       or (p_slot = 'table_felt' and v_kind <> 'Table felt')
       or (p_slot = 'avatar_frame' and v_kind <> 'Avatar frame')
       or (p_slot = 'profile_title' and v_kind <> 'Profile title') then
      raise exception 'That reward does not fit this equipment slot';
    end if;

    if not exists (
      select 1
      from public.season_pass_reward_ownership o
      where o.player_id = p_player_id
        and o.season_id = p_season_id
        and o.reward_id = v_reward_id
    ) then
      raise exception 'You have not unlocked that Season Pass reward';
    end if;
  end if;

  insert into public.season_pass_equipment (player_id, slot, reward_id, updated_at)
  values (p_player_id, p_slot, v_reward_id, now())
  on conflict (player_id, slot) do update
    set reward_id = excluded.reward_id,
        updated_at = excluded.updated_at;

  return jsonb_build_object('season_id', p_season_id, 'slot', p_slot, 'reward_id', v_reward_id);
end;
$$;

revoke all on function public.brasta_equip_season_pass_reward(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.brasta_equip_season_pass_reward(uuid, text, text, text) to service_role;

notify pgrst, 'reload schema';
