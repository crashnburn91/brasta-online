-- Raise Sweep Artist from 10 to 50 Jack sweeps.
-- Players below the new threshold keep their sweep progress, but the achievement
-- and achievement-backed profile title are relocked until they reach 50.

update public.achievement_definitions
set description = 'Perform 50 Jack sweeps.',
    target = 50
where achievement_key = 'sweep_artist';

update public.profile_badge_definitions
set description = 'Perform 50 Jack sweeps.'
where badge_key = 'sweep_artist'
  and achievement_key = 'sweep_artist';

-- Unequip the title first so nobody can retain an equipped title they no longer
-- qualify for under the new requirement.
update public.player_profile_badge_equipment e
set badge_key = null,
    updated_at = now()
where e.badge_key = 'sweep_artist'
  and exists (
    select 1
    from public.player_achievements a
    where a.player_id = e.player_id
      and a.achievement_key = 'sweep_artist'
      and a.progress < 50
  );

-- Remove achievement-backed title ownership below the new threshold. The normal
-- achievement trigger will grant it again when the player reaches 50 sweeps.
delete from public.player_profile_badges b
where b.badge_key = 'sweep_artist'
  and b.source = 'achievement'
  and exists (
    select 1
    from public.player_achievements a
    where a.player_id = b.player_id
      and a.achievement_key = 'sweep_artist'
      and a.progress < 50
  );

-- Preserve progress, but clear the old 10-sweep unlock for players who have not
-- yet met the new 50-sweep requirement.
update public.player_achievements
set unlocked_at = null,
    updated_at = now()
where achievement_key = 'sweep_artist'
  and progress < 50;
