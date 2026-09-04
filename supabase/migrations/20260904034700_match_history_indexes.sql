create index if not exists match_history_events_player_idx
  on public.match_history_events (player_id)
  where player_id is not null;

create index if not exists player_achievements_key_idx
  on public.player_achievements (achievement_key);
