import type { BrastaAuthIdentity } from './supabase-auth';

export function brastaAdminConfigured(): boolean {
  return Boolean(
    String(process.env.BRASTA_ADMIN_EMAILS || '').trim()
    || String(process.env.BRASTA_ADMIN_USER_IDS || '').trim()
  );
}

export function isBrastaAdmin(identity: BrastaAuthIdentity | null): boolean {
  if (!identity) return false;

  const userIds = String(process.env.BRASTA_ADMIN_USER_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (userIds.includes(identity.userId)) return true;

  const email = String(identity.email || '').trim().toLowerCase();
  if (!email) return false;
  const emails = String(process.env.BRASTA_ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(email);
}
