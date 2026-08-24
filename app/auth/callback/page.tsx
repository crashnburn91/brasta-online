'use client';

import { useEffect, useState } from 'react';
import { BRASTA_AUTH_RETURN_KEY, getSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function AuthCallbackPage() {
  const [status, setStatus] = useState('Finishing sign in…');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus('Brasta accounts are not configured yet.');
      return;
    }

    const finish = async () => {
      const params = new URLSearchParams(location.search);
      const code = params.get('code');
      const errorDescription = params.get('error_description') || params.get('error');
      if (errorDescription) {
        setStatus(errorDescription);
        return;
      }
      if (!code) {
        setStatus('The sign-in response did not include an authorization code.');
        return;
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus(error.message);
        return;
      }

      let next = '/';
      try {
        const stored = sessionStorage.getItem(BRASTA_AUTH_RETURN_KEY);
        sessionStorage.removeItem(BRASTA_AUTH_RETURN_KEY);
        if (stored?.startsWith('/')) next = stored;
      } catch {}
      location.replace(next);
    };

    void finish();
  }, []);

  return <main className="account-callback"><section className="account-callback-card"><div className="account-brand-mark">B</div><h1>Brasta</h1><p>{status}</p></section></main>;
}
