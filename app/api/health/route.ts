import { health } from '../../../lib/brasta-server';
import { competitiveBackendReady } from '../../../lib/competitive';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json(
    { ...(await health()), rankedBackendReady: competitiveBackendReady() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
