import crypto from 'node:crypto';
import * as Brasta from './game-engine';
import { redis, duplicateRedis } from './redis';

const ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_TTL_SECONDS = 24 * 60 * 60;
const PRESENCE_MS = 45_000;
const EVENT_CHANNEL = 'brasta:room-events';
const memoryRooms = new Map<string, StoredRoom>();
const localConnections = new Set<Connection>();
let subscriberStarted = false;

export type WireSocket = {
  send(data: string): void;
  close(code?: number, reason?: string): void;
};

type Participant = { seat: Brasta.Seat; name: string; token: string; connectionId: string; lastSeen: number };
type StoredRoom = {
  code: string;
  mode: Brasta.Mode;
  targetScore: Brasta.TargetScore;
  createdAt: number;
  lastActivity: number;
  started: boolean;
  revision: number;
  hostToken: string;
  seats: Record<string, Participant>;
  gameState: Brasta.GameState | null;
};
export type Connection = { id: string; ws: WireSocket; closed: boolean; roomCode: string | null; seat: Brasta.Seat | null; token: string | null };

const cleanName = (v: unknown) => String(v || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24);
const cleanCode = (v: unknown) => String(v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const makeToken = () => crypto.randomBytes(24).toString('hex');
const roomKey = (code: string) => `brasta:room:${code}`;
const lockKey = (code: string) => `brasta:lock:${code}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

function activeSeats(room: StoredRoom): Brasta.Seat[] { return Brasta.activeSeats(room.mode); }
function participantForToken(room: StoredRoom, token: string): Participant | null {
  return Object.values(room.seats).find((p) => p.token === token) || null;
}
function hostParticipant(room: StoredRoom): Participant | null { return participantForToken(room, room.hostToken); }
function visibleStateForSeat(gameState: Brasta.GameState, seat: Brasta.Seat): Brasta.GameState {
  const view = clone(gameState);
  view.deck = gameState.deck.map((_, i) => `hidden-deck-${i}`);
  view.players = gameState.players.map((p) => ({ ...clone(p), hand: p.seat === seat ? [...p.hand] : p.hand.map((_, i) => `hidden-seat-${p.seat}-${i}`) }));
  return view;
}
function roomSnapshot(room: StoredRoom) {
  const now = Date.now();
  const seats = activeSeats(room);
  const host = hostParticipant(room);
  const players = seats.map((seat) => {
    const p = room.seats[String(seat)];
    return p
      ? { seat, name: p.name, connected: now - p.lastSeen < PRESENCE_MS, occupied: true }
      : { seat, name: '', connected: false, occupied: false };
  });
  return { code: room.code, mode: room.mode, targetScore: room.targetScore, started: room.started, revision: room.revision, hostSeat: host?.seat || seats[0], players, full: seats.every((s) => !!room.seats[String(s)]) };
}
function applyNames(room: StoredRoom) {
  if (!room.gameState) return;
  for (const player of room.gameState.players) {
    const p = room.seats[String(player.seat)];
    if (p) player.name = p.name;
  }
}

async function loadRoom(code: string): Promise<StoredRoom | null> {
  if (!redis) return memoryRooms.get(code) || null;
  const raw = await redis.get(roomKey(code));
  if (!raw) return null;
  try { return JSON.parse(raw) as StoredRoom; } catch { return null; }
}
async function saveRoom(room: StoredRoom): Promise<void> {
  room.lastActivity = Date.now();
  if (!redis) { memoryRooms.set(room.code, clone(room)); return; }
  await redis.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
}
async function createRoomIfAbsent(room: StoredRoom): Promise<boolean> {
  if (!redis) {
    if (memoryRooms.has(room.code)) return false;
    memoryRooms.set(room.code, clone(room));
    return true;
  }
  const ok = await redis.set(roomKey(room.code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS, 'NX');
  return ok === 'OK';
}
async function deleteRoom(code: string): Promise<void> {
  if (!redis) { memoryRooms.delete(code); return; }
  await redis.del(roomKey(code));
}

async function acquireLock(code: string): Promise<string | null> {
  if (!redis) return 'memory';
  const token = crypto.randomUUID();
  for (let i = 0; i < 30; i++) {
    const ok = await redis.set(lockKey(code), token, 'PX', 5000, 'NX');
    if (ok === 'OK') return token;
    await sleep(30 + Math.floor(Math.random() * 40));
  }
  return null;
}
async function releaseLock(code: string, token: string): Promise<void> {
  if (!redis || token === 'memory') return;
  await redis.eval("if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", 1, lockKey(code), token);
}
async function mutateRoom<T>(code: string, fn: (room: StoredRoom) => Promise<T> | T, publish = true): Promise<{ room: StoredRoom; result: T } | null> {
  const token = await acquireLock(code);
  if (!token) throw new Error('Room is busy. Try again.');
  try {
    const room = await loadRoom(code);
    if (!room) return null;
    const result = await fn(room);
    await saveRoom(room);
    if (publish) await publishRoom(code);
    return { room, result };
  } finally { await releaseLock(code, token); }
}

function sendJson(conn: Connection, msg: unknown) {
  if (conn.closed) return;
  try { conn.ws.send(JSON.stringify(msg)); } catch { conn.closed = true; }
}
const sendError = (conn: Connection, message: string) => sendJson(conn, { type: 'ERROR', message });

async function broadcastLocalRoom(code: string): Promise<void> {
  const room = await loadRoom(code);
  for (const conn of localConnections) {
    if (conn.closed || conn.roomCode !== code || !conn.seat || !conn.token) continue;
    if (!room) { sendError(conn, 'That room no longer exists.'); continue; }
    const p = room.seats[String(conn.seat)];
    if (!p || p.token !== conn.token || p.connectionId !== conn.id) continue;
    const snapshot = roomSnapshot(room);
    sendJson(conn, {
      type: 'ROOM_STATE',
      update: {
        room: snapshot,
        you: { seat: p.seat, name: p.name, isHost: p.token === room.hostToken },
        state: room.gameState ? visibleStateForSeat(room.gameState, p.seat) : null,
      },
    });
  }
}

async function ensureSubscriber(): Promise<void> {
  if (!redis || subscriberStarted) return;
  subscriberStarted = true;
  const sub = duplicateRedis();
  if (!sub) return;
  sub.on('message', (_channel, code) => { void broadcastLocalRoom(code); });
  sub.on('error', (err) => console.error('[brasta redis subscriber]', err));
  await sub.subscribe(EVENT_CHANNEL);
}
async function publishRoom(code: string): Promise<void> {
  await broadcastLocalRoom(code);
  if (redis) await redis.publish(EVENT_CHANNEL, code);
}

async function makeRoomCode(): Promise<string> {
  for (let a = 0; a < 1000; a++) {
    let code = '';
    for (let i = 0; i < 5; i++) code += ROOM_CHARS[crypto.randomInt(ROOM_CHARS.length)];
    if (!(await loadRoom(code))) return code;
  }
  throw new Error('Could not allocate room code');
}

async function attach(conn: Connection, room: StoredRoom, p: Participant): Promise<void> {
  // Supersede any socket for the same seat on this Function instance.
  for (const old of localConnections) {
    if (old !== conn && !old.closed && old.roomCode === room.code && old.token === p.token) {
      sendJson(old, { type: 'NOTICE', message: 'This seat was reconnected from another browser.' });
      old.closed = true;
      try { old.ws.close(4001, 'Reconnected elsewhere'); } catch {}
    }
  }
  p.connectionId = conn.id;
  p.lastSeen = Date.now();
  conn.roomCode = room.code;
  conn.seat = p.seat;
  conn.token = p.token;
  sendJson(conn, { type: 'SESSION', session: { code: room.code, seat: p.seat, token: p.token, name: p.name, isHost: p.token === room.hostToken } });
}

async function detach(conn: Connection, intentional = false): Promise<void> {
  const code = conn.roomCode;
  const seat = conn.seat;
  const token = conn.token;
  conn.roomCode = null; conn.seat = null; conn.token = null;
  if (!code || !seat || !token) return;
  const updated = await mutateRoom(code, (room) => {
    const p = room.seats[String(seat)];
    if (!p || p.token !== token || p.connectionId !== conn.id) return;
    p.lastSeen = 0;
    if (intentional && !room.started) {
      const wasHost = p.token === room.hostToken;
      delete room.seats[String(seat)];
      if (wasHost) {
        const next = Object.values(room.seats).sort((a, b) => a.seat - b.seat)[0];
        if (next) room.hostToken = next.token;
      }
    }
  });
  if (updated && Object.keys(updated.room.seats).length === 0) await deleteRoom(code);
}

async function requireSession(conn: Connection): Promise<{ room: StoredRoom; p: Participant } | null> {
  if (!conn.roomCode || !conn.seat || !conn.token) { sendError(conn, 'Join or create a room first.'); return null; }
  const room = await loadRoom(conn.roomCode);
  if (!room) { sendError(conn, 'That room no longer exists.'); return null; }
  const p = room.seats[String(conn.seat)];
  if (!p || p.token !== conn.token || p.connectionId !== conn.id) { sendError(conn, 'Your room session is no longer valid.'); return null; }
  return { room, p };
}

export async function handleMessage(conn: Connection, raw: string): Promise<void> {
  let msg: any;
  try { msg = JSON.parse(raw); } catch { sendError(conn, 'Message must be valid JSON.'); return; }
  if (!msg || typeof msg.type !== 'string') { sendError(conn, 'Message type is required.'); return; }
  try {
    if (msg.type === 'PING') {
      if (conn.roomCode && conn.seat && conn.token) {
        await mutateRoom(conn.roomCode, (room) => {
          const p = room.seats[String(conn.seat!)];
          if (p && p.token === conn.token && p.connectionId === conn.id) p.lastSeen = Date.now();
        }, false);
      }
      sendJson(conn, { type: 'PONG' });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      await detach(conn, true);
      const name = cleanName(msg.name);
      const mode: Brasta.Mode | null = msg.mode === '2v2' ? '2v2' : msg.mode === '1v1' ? '1v1' : null;
      const targetScore: Brasta.TargetScore = Number(msg.targetScore) === 220 ? 220 : 110;
      if (!name) return sendError(conn, 'Enter a display name.');
      if (!mode) return sendError(conn, 'Choose 1v1 or 2v2.');
      const token = makeToken();
      let room: StoredRoom | null = null;
      for (let i = 0; i < 25 && !room; i++) {
        const code = await makeRoomCode();
        const p: Participant = { seat: 1, name, token, connectionId: conn.id, lastSeen: Date.now() };
        const candidate: StoredRoom = { code, mode, targetScore, createdAt: Date.now(), lastActivity: Date.now(), started: false, revision: 0, hostToken: token, seats: { '1': p }, gameState: null };
        if (await createRoomIfAbsent(candidate)) room = candidate;
      }
      if (!room) return sendError(conn, 'Could not create a room. Try again.');
      const p = room.seats['1'];
      await attach(conn, room, p);
      await saveRoom(room);
      await publishRoom(room.code);
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      await detach(conn, false);
      const code = cleanCode(msg.code);
      const name = cleanName(msg.name);
      const reconnectToken = typeof msg.token === 'string' ? msg.token : '';
      const changed = await mutateRoom(code, (room) => {
        if (reconnectToken) {
          const existing = participantForToken(room, reconnectToken);
          if (existing) {
            if (name) existing.name = name;
            applyNames(room);
            existing.connectionId = conn.id;
            existing.lastSeen = Date.now();
            return existing;
          }
        }
        if (room.started) throw new Error('This game has already started. Reconnect from the browser that originally joined the room.');
        if (!name) throw new Error('Enter a display name.');
        const seat = activeSeats(room).find((s) => !room.seats[String(s)]);
        if (!seat) throw new Error('That room is full.');
        const p: Participant = { seat, name, token: makeToken(), connectionId: conn.id, lastSeen: Date.now() };
        room.seats[String(seat)] = p;
        return p;
      });
      if (!changed) return sendError(conn, 'Room not found. Check the code and try again.');
      await attach(conn, changed.room, changed.result);
      await saveRoom(changed.room);
      await publishRoom(changed.room.code);
      return;
    }

    if (msg.type === 'LEAVE_ROOM') {
      await detach(conn, true);
      sendJson(conn, { type: 'NOTICE', message: 'Left room.' });
      return;
    }

    const current = await requireSession(conn);
    if (!current) return;
    const code = current.room.code;
    const changed = await mutateRoom(code, (room) => {
      const p = room.seats[String(conn.seat!)];
      if (!p || p.token !== conn.token || p.connectionId !== conn.id) throw new Error('Your room session is no longer valid.');
      p.lastSeen = Date.now();
      const requireHost = () => { if (p.token !== room.hostToken) throw new Error('Only the room host can do that.'); };

      if (msg.type === 'START_GAME') {
        requireHost();
        if (room.started) throw new Error('The game has already started.');
        if (!activeSeats(room).every((s) => !!room.seats[String(s)])) throw new Error('All seats must be filled before starting.');
        room.gameState = Brasta.startMatch(room.mode, crypto.randomInt(1, 0x7fffffff), room.targetScore);
        applyNames(room); room.started = true; room.revision++; return;
      }
      if (!room.started || !room.gameState) throw new Error('The game has not started yet.');
      if (msg.type === 'OPENING_CHOICE') {
        if (room.gameState.phase !== 'openingChoice') throw new Error('The opening choice is not active.');
        if (room.gameState.starterSeat !== p.seat) throw new Error('Only this round’s starter can make the opening choice.');
        if (msg.choice !== 'keep' && msg.choice !== 'put') throw new Error('Opening choice must be keep or put.');
        const result = Brasta.resolveOpening(room.gameState, msg.choice);
        if (!result.ok) throw new Error(result.error || 'Opening choice rejected.');
        room.gameState = result.state; applyNames(room); room.revision++; return;
      }
      if (msg.type === 'COMMAND') {
        if (!msg.command || typeof msg.command.type !== 'string') throw new Error('A game command is required.');
        const safe = { ...msg.command, seat: p.seat } as Brasta.Command;
        const result = Brasta.applyCommand(room.gameState, safe);
        if (!result.ok) throw new Error(result.error || 'Move rejected.');
        room.gameState = result.state; applyNames(room); room.revision++; return;
      }
      if (msg.type === 'NEXT_ROUND') {
        requireHost();
        const result = Brasta.nextRound(room.gameState);
        if (!result.ok) throw new Error(result.error || 'Unable to start next round.');
        room.gameState = result.state; applyNames(room); room.revision++; return;
      }
      if (msg.type === 'END_MATCH') {
        requireHost(); room.gameState = Brasta.endMatch(room.gameState); room.revision++; return;
      }
      throw new Error('Unsupported room command.');
    });
    if (!changed) return sendError(conn, 'That room no longer exists.');
  } catch (err) {
    console.error('[brasta action]', err);
    sendError(conn, err instanceof Error ? err.message : 'The server could not process that action. No game state was changed.');
  }
}

export async function registerSocket(ws: WireSocket): Promise<Connection> {
  await ensureSubscriber();
  const conn: Connection = { id: crypto.randomUUID(), ws, closed: false, roomCode: null, seat: null, token: null };
  localConnections.add(conn);
  sendJson(conn, { type: 'NOTICE', message: redis ? 'Connected to Brasta.' : 'Connected to Brasta (local memory mode).' });
  return conn;
}
export async function unregisterSocket(conn: Connection): Promise<void> {
  if (conn.closed) return;
  conn.closed = true;
  localConnections.delete(conn);
  await detach(conn, false);
}

export async function health() {
  let redisOk = false;
  if (redis) {
    try { redisOk = (await redis.ping()) === 'PONG'; } catch { redisOk = false; }
  }
  return { ok: true, redisConfigured: !!redis, redisOk, localConnections: [...localConnections].filter((c) => !c.closed).length };
}
