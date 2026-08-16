import crypto from 'node:crypto';
import { redis } from '../../../lib/redis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ROOM_TTL_SECONDS = 24 * 60 * 60;
const EVENT_CHANNEL = 'brasta:room-events';

type Participant = {
  seat: 1 | 2 | 3 | 4;
  name: string;
  token: string;
  connectionId: string;
  lastSeen: number;
};

type StoredRoom = {
  code: string;
  mode: '1v1' | '2v2';
  createdAt: number;
  lastActivity: number;
  started: boolean;
  revision: number;
  hostToken: string;
  seats: Record<string, Participant>;
  spectators?: Record<string, unknown>;
};

const cleanCode = (value: unknown) => String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
const roomKey = (code: string) => `brasta:room:${code}`;
const lockKey = (code: string) => `brasta:lock:${code}`;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function acquireLock(code: string): Promise<string | null> {
  if (!redis) return null;
  const token = crypto.randomUUID();
  for (let i = 0; i < 30; i++) {
    const ok = await redis.set(lockKey(code), token, 'PX', 5000, 'NX');
    if (ok === 'OK') return token;
    await sleep(30 + Math.floor(Math.random() * 40));
  }
  return null;
}

async function releaseLock(code: string, token: string): Promise<void> {
  if (!redis) return;
  await redis.eval(
    "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end",
    1,
    lockKey(code),
    token,
  );
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  if (!redis) return json({ ok: false, error: 'Seat selection requires the online room server.' }, 503);

  let body: any;
  try { body = await request.json(); }
  catch { return json({ ok: false, error: 'Invalid request.' }, 400); }

  const code = cleanCode(body?.code);
  const token = typeof body?.token === 'string' ? body.token : '';
  const targetSeat = Number(body?.seat);
  if (!code || !token || ![1, 2, 3, 4].includes(targetSeat)) {
    return json({ ok: false, error: 'Room, session, and seat are required.' }, 400);
  }

  const lock = await acquireLock(code);
  if (!lock) return json({ ok: false, error: 'Room is busy. Try again.' }, 409);

  try {
    const raw = await redis.get(roomKey(code));
    if (!raw) return json({ ok: false, error: 'Room not found.' }, 404);

    let room: StoredRoom;
    try { room = JSON.parse(raw) as StoredRoom; }
    catch { return json({ ok: false, error: 'Room data could not be read.' }, 500); }

    if (room.mode !== '2v2') return json({ ok: false, error: 'Seat selection is only available in 2v2 rooms.' }, 400);
    if (room.started) return json({ ok: false, error: 'Seats are locked after the game starts.' }, 409);

    const currentEntry = Object.entries(room.seats).find(([, player]) => player.token === token);
    if (!currentEntry) return json({ ok: false, error: 'Your room session is no longer valid.' }, 403);

    const [currentKey, player] = currentEntry;
    if (player.seat === targetSeat) return json({ ok: true, seat: targetSeat, unchanged: true });
    if (room.seats[String(targetSeat)]) return json({ ok: false, error: `Seat ${targetSeat} is already occupied.` }, 409);

    delete room.seats[currentKey];
    player.seat = targetSeat as 1 | 2 | 3 | 4;
    player.lastSeen = Date.now();
    room.seats[String(targetSeat)] = player;
    room.revision += 1;
    room.lastActivity = Date.now();

    await redis.set(roomKey(code), JSON.stringify(room), 'EX', ROOM_TTL_SECONDS);
    await redis.publish(EVENT_CHANNEL, code);

    return json({ ok: true, seat: targetSeat });
  } finally {
    await releaseLock(code, lock);
  }
}
