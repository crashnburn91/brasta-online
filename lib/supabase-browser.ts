import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const BRASTA_AUTH_TOKEN_KEY = 'brasta-auth-access-token';
export const BRASTA_AUTH_RETURN_KEY = 'brasta-auth-return-to';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
let browserClient: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  return Boolean(url && publishableKey);
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!browserClient) {
    browserClient = createClient(url, publishableKey, {
      auth: {
        flowType: 'pkce',
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    });
  }
  return browserClient;
}
