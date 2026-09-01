import { createClient } from '@supabase/supabase-js';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return json({ error: 'Sign in again before deleting your account.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired. Sign in again first.' }, 401);
    const body = await request.json().catch(() => ({})) as { confirmation?: unknown };
    if (String(body.confirmation || '') !== 'DELETE') return json({ error: 'Type DELETE to confirm permanent account deletion.' }, 400);
    if (!supabaseUrl || !secretKey) return json({ error: 'Account deletion is temporarily unavailable.' }, 503);

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(identity.userId, false);
    if (error) throw error;
    return json({ state: 'deleted' });
  } catch (error) {
    console.error('[brasta account deletion]', error);
    return json({ error: 'Could not delete the account. Contact support if the problem continues.' }, 500);
  }
}
