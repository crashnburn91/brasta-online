import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const BRASTA_AUTH_TOKEN_KEY = 'brasta-auth-access-token';
export const BRASTA_AUTH_RETURN_KEY = 'brasta-auth-return-to';
export const BRASTA_AUTH_FLOW_ID_KEY = 'brasta-auth-flow-id';
export const BRASTA_NATIVE_AUTH_CALLBACK_KEY = 'brasta-native-auth-callback';
export const BRASTA_NATIVE_AUTH_CALLBACK_EVENT = 'brasta-native-auth-callback';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_0eLE7QNyW1BpWdu40IOMww_H5otqRzy';
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
