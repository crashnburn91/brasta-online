import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
// Avatar URLs are public profile fields; this lookup needs no privileged key.
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function cleanUsername(value: unknown): string {
  return String(value || '').trim().replace(/^@/, '');
}

function safeAvatarUrl(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (!supabaseUrl || !publishableKey) return json({ error: 'Player avatars are not configured.' }, 503);
    const body = await request.json().catch(() => ({})) as { username?: unknown };
    const username = cleanUsername(body.username);
    if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return json({ avatarUrl: null });

    const response = await fetch(
      `${supabaseUrl}/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=avatar_url&limit=1`,
      {
        headers: {
          apikey: publishableKey,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );
    if (!response.ok) throw new Error(`Avatar lookup returned ${response.status}.`);
    const rows = await response.json() as Array<{ username?: string | null; avatar_url?: string | null }>;
    return json({ avatarUrl: safeAvatarUrl(rows[0]?.avatar_url) });
  } catch (error) {
    console.error('[brasta player avatar]', error);
    return json({ avatarUrl: null });
  }
}
