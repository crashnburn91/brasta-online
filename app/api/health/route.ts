import { health } from '../../../lib/brasta-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() { return Response.json(await health(), { headers: { 'cache-control': 'no-store' } }); }
