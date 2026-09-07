import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const AVATAR_BUCKET = 'avatars';
const MAX_AVATAR_BYTES = 1024 * 1024;

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

function safeHttpsUrl(value: unknown): string | null {
  const raw = String(value || '').trim().slice(0, 2048);
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function avatarObjectPath(value: unknown): string | null {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.origin !== new URL(supabaseUrl).origin) return null;
    const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
    const index = parsed.pathname.indexOf(marker);
    if (index < 0) return null;
    const path = decodeURIComponent(parsed.pathname.slice(index + marker.length));
    return path && !path.includes('..') ? path : null;
  } catch {
    return null;
  }
}

async function providerAvatar(accessToken: string): Promise<string | null> {
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const user = await response.json() as {
      user_metadata?: { avatar_url?: unknown; picture?: unknown };
    };
    const metadata = user.user_metadata || {};
    return safeHttpsUrl(metadata.avatar_url || metadata.picture);
  } catch {
    return null;
  }
}

async function removeOldAvatar(admin: ReturnType<typeof createClient>, avatarUrl: unknown): Promise<void> {
  const path = avatarObjectPath(avatarUrl);
  if (!path) return;
  const { error } = await admin.storage.from(AVATAR_BUCKET).remove([path]);
  if (error) console.warn('[brasta avatar cleanup]', error.message);
}

export async function POST(request: Request) {
  try {
    const accessToken = tokenFrom(request);
    if (!accessToken) return json({ error: 'Sign in to change your profile picture.' }, 401);
    const identity = await verifyBrastaAccessToken(accessToken);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired. Sign in again first.' }, 401);
    if (!supabaseUrl || !secretKey) return json({ error: 'Profile photo storage is temporarily unavailable.' }, 503);

    const admin = createClient(supabaseUrl, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      const body = await request.json().catch(() => ({})) as { action?: unknown };
      if (String(body.action || '') !== 'remove') return json({ error: 'Unsupported avatar action.' }, 400);

      const fallbackAvatar = await providerAvatar(accessToken);
      const { data, error } = await admin
        .from('profiles')
        .update({ avatar_url: fallbackAvatar, updated_at: new Date().toISOString() })
        .eq('id', identity.userId)
        .select('id')
        .maybeSingle();
      if (error) throw error;
      if (!data?.id) return json({ error: 'Your Brasta profile could not be found.' }, 404);

      await removeOldAvatar(admin, identity.avatarUrl);
      return json({ state: 'removed', avatarUrl: fallbackAvatar, custom: false });
    }

    if (!contentType.includes('multipart/form-data')) return json({ error: 'Choose a photo to upload.' }, 400);
    const form = await request.formData();
    const file = form.get('avatar');
    if (!(file instanceof File)) return json({ error: 'Choose a photo to upload.' }, 400);
    if (file.type !== 'image/webp') return json({ error: 'The profile photo must be processed as a WebP image.' }, 415);
    if (file.size <= 0 || file.size > MAX_AVATAR_BYTES) return json({ error: 'Profile photos must be under 1 MB after cropping.' }, 413);

    const bytes = Buffer.from(await file.arrayBuffer());
    const isWebp = bytes.length >= 12
      && bytes.subarray(0, 4).toString('ascii') === 'RIFF'
      && bytes.subarray(8, 12).toString('ascii') === 'WEBP';
    if (!isWebp) return json({ error: 'That file is not a valid WebP image.' }, 415);

    const objectPath = `profile/${randomUUID()}.webp`;
    const { error: uploadError } = await admin.storage.from(AVATAR_BUCKET).upload(objectPath, bytes, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: publicData } = admin.storage.from(AVATAR_BUCKET).getPublicUrl(objectPath);
    const avatarUrl = safeHttpsUrl(publicData.publicUrl);
    if (!avatarUrl) {
      await admin.storage.from(AVATAR_BUCKET).remove([objectPath]);
      throw new Error('Could not create a public avatar URL.');
    }

    const { data: profile, error: updateError } = await admin
      .from('profiles')
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq('id', identity.userId)
      .select('id')
      .maybeSingle();
    if (updateError || !profile?.id) {
      await admin.storage.from(AVATAR_BUCKET).remove([objectPath]);
      if (updateError) throw updateError;
      return json({ error: 'Your Brasta profile could not be found.' }, 404);
    }

    await removeOldAvatar(admin, identity.avatarUrl);
    return json({ state: 'updated', avatarUrl, custom: true });
  } catch (error) {
    console.error('[brasta avatar]', error);
    const message = error instanceof Error ? error.message : 'Could not update your profile picture.';
    const status = /expired|sign in/i.test(message) ? 401 : /storage|configured|bucket/i.test(message) ? 503 : 400;
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') || 'Could not update your profile picture.' }, status);
  }
}
