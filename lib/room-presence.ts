// Application PING/PONG stays at 20 seconds for socket health, but room
// presence is persisted far less often. Normal disconnects write lastSeen=0
// immediately; this lease only covers an unclean realtime-process failure.
export const ROOM_PRESENCE_LEASE_REFRESH_MS = 5 * 60_000;
export const ROOM_PRESENCE_LEASE_TTL_MS = 12 * 60_000;

export function roomPresenceLeaseIsFresh(lastSeen: number, now = Date.now()): boolean {
  return Number.isFinite(lastSeen) && lastSeen > 0 && now - lastSeen < ROOM_PRESENCE_LEASE_TTL_MS;
}
