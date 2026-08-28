'use client';

import { useEffect, useState } from 'react';
import { BRASTA_AUTH_RETURN_KEY, getSupabaseBrowserClient } from '../../../lib/supabase-browser';

export default function AuthConfirmPage() {
  const [status, setStatus] = useState('Finishing sign in…');

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus('Brasta accounts are not configured yet.');
      return;
    }

    const finish = async () => {
      const params = new URLSearchParams(location.search);
      const tokenHash = params.get('token_hash');
      const type = params.get('type');

      if (!tokenHash || type !== 'email') {
        setStatus('This Brasta sign-in link is invalid or incomplete.');
        return;
      }

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'email',
      });

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

  return (
    <main className="account-callback">
      <section className="account-callback-card">
        <div className="account-brand-mark">B</div>
        <h1>Brasta</h1>
        <p>{status}</p>
      </section>
    </main>
  );
}
