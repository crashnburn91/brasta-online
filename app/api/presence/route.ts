import { geolocation, ipAddress } from '@vercel/functions';
import { recordTrafficPresence } from '../../../lib/traffic-presence';
import { verifyBrastaAccessToken } from '../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function bearerToken(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({} as any));
  const token = bearerToken(request);
  const identity = token ? await verifyBrastaAccessToken(token) : null;
  const geo = geolocation(request);

  const result = await recordTrafficPresence({
    sessionId: body?.sessionId,
    activity: body?.activity,
    roomCode: body?.roomCode,
    path: body?.path,
    pageKey: body?.pageKey,
    visible: body?.visible,
    userAgent: request.headers.get('user-agent') || '',
    ip: ipAddress(request) || request.headers.get('x-forwarded-for') || '',
    city: geo.city,
    country: geo.country,
    countryRegion: geo.countryRegion,
    ipTimezone: request.headers.get('x-vercel-ip-timezone') || '',
    client: body?.client || null,
    identity,
  });

  if (!result.ok) {
    return Response.json(
      { state: 'unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return Response.json(
    { state: 'ok' },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
