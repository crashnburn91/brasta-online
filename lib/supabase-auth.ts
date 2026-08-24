export type BrastaAuthIdentity = {
  userId: string;
  email: string | null;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';

export function isServerAuthConfigured(): boolean {
  return Boolean(supabaseUrl && publishableKey);
}

export async function verifyBrastaAccessToken(accessToken: unknown): Promise<BrastaAuthIdentity | null> {
  if (!isServerAuthConfigured() || typeof accessToken !== 'string' || accessToken.length < 20) return null;

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
    if (!userResponse.ok) return null;
    const user = await userResponse.json() as { id?: string; email?: string | null };
    if (!user.id) return null;

    const profileResponse = await fetch(
      `${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=username,display_name,avatar_url&limit=1`,
      {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    );
    const rows = profileResponse.ok
      ? await profileResponse.json() as Array<{ username?: string | null; display_name?: string | null; avatar_url?: string | null }>
      : [];
    const profile = rows[0] || {};

    return {
      userId: user.id,
      email: user.email || null,
      username: profile.username || null,
      displayName: profile.display_name || null,
      avatarUrl: profile.avatar_url || null,
    };
  } catch {
    return null;
  }
}
