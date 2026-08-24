'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import {
  BRASTA_AUTH_RETURN_KEY,
  BRASTA_AUTH_TOKEN_KEY,
  getSupabaseBrowserClient,
  isSupabaseConfigured,
} from '../lib/supabase-browser';

type BrastaProfile = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
  created_at?: string;
  updated_at?: string;
};

type OAuthProvider = 'google' | 'apple' | 'discord';

function authReturnPath(): string {
  return `${location.pathname}${location.search}${location.hash}` || '/';
}

function suggestedDisplayName(user: User): string {
  const meta = user.user_metadata || {};
  return String(meta.full_name || meta.name || meta.user_name || '').trim().slice(0, 24);
}

function suggestedAvatar(user: User): string | null {
  const meta = user.user_metadata || {};
  const avatar = String(meta.avatar_url || meta.picture || '').trim();
  return avatar || null;
}

export default function AccountBridge() {
  const configured = isSupabaseConfigured();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<BrastaProfile | null>(null);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileLoading, setProfileLoading] = useState(false);

  const syncSession = useCallback(async (nextSession: Session | null) => {
    setSession(nextSession);
    setMessage('');
    if (!nextSession?.access_token || !supabase) {
      try { localStorage.removeItem(BRASTA_AUTH_TOKEN_KEY); } catch {}
      setProfile(null);
      setUsername('');
      window.dispatchEvent(new CustomEvent('brasta-auth-changed', { detail: { signedIn: false } }));
      return;
    }

    try { localStorage.setItem(BRASTA_AUTH_TOKEN_KEY, nextSession.access_token); } catch {}
    setProfileLoading(true);
    const { data, error } = await supabase
      .from('profiles')
      .select('id,username,display_name,avatar_url,created_at,updated_at')
      .eq('id', nextSession.user.id)
      .maybeSingle();
    setProfileLoading(false);

    if (error) {
      setProfile(null);
      setMessage('Your account is signed in, but the Brasta profile database is not ready yet.');
      window.dispatchEvent(new CustomEvent('brasta-auth-changed', {
        detail: { signedIn: true, userId: nextSession.user.id, username: null },
      }));
      return;
    }

    const nextProfile = data as BrastaProfile | null;
    setProfile(nextProfile);
    setUsername(nextProfile?.username || '');
    const preferredName = nextProfile?.display_name || nextProfile?.username || suggestedDisplayName(nextSession.user);
    if (preferredName) {
      try { localStorage.setItem('brasta-online-last-name', preferredName); } catch {}
    }
    if (!nextProfile?.username) setOpen(true);
    window.dispatchEvent(new CustomEvent('brasta-auth-changed', {
      detail: { signedIn: true, userId: nextSession.user.id, username: nextProfile?.username || null },
    }));
  }, [supabase]);

  useEffect(() => {
    if (!configured || !supabase) return;
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (alive) void syncSession(data.session);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (alive) void syncSession(nextSession);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [configured, supabase, syncSession]);

  if (!configured || !supabase) return null;

  const user = session?.user || null;
  const displayName = profile?.display_name || profile?.username || (user ? suggestedDisplayName(user) : '');
  const avatar = profile?.avatar_url || (user ? suggestedAvatar(user) : null);
  const needsUsername = Boolean(user && !profileLoading && !profile?.username);

  async function signIn(provider: OAuthProvider) {
    setBusy(true);
    setMessage('');
    try { sessionStorage.setItem(BRASTA_AUTH_RETURN_KEY, authReturnPath()); } catch {}
    const { error } = await supabase!.auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setMessage(error.message);
      setBusy(false);
    }
  }

  async function sendMagicLink(event: FormEvent) {
    event.preventDefault();
    const clean = email.trim();
    if (!clean) return;
    setBusy(true);
    setMessage('');
    try { sessionStorage.setItem(BRASTA_AUTH_RETURN_KEY, authReturnPath()); } catch {}
    const { error } = await supabase!.auth.signInWithOtp({
      email: clean,
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
        shouldCreateUser: true,
      },
    });
    setBusy(false);
    setMessage(error ? error.message : 'Check your email for your Brasta sign-in link.');
  }

  async function saveUsername(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    const clean = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(clean)) {
      setMessage('Username must be 3–20 characters using only letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    setMessage('');
    const fallbackName = suggestedDisplayName(user) || clean;
    const { data, error } = await supabase!
      .from('profiles')
      .upsert({
        id: user.id,
        username: clean,
        display_name: fallbackName.slice(0, 24),
        avatar_url: suggestedAvatar(user),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'id' })
      .select('id,username,display_name,avatar_url,created_at,updated_at')
      .single();
    setBusy(false);
    if (error) {
      const duplicate = error.code === '23505' || /duplicate|unique/i.test(error.message);
      setMessage(duplicate ? 'That Brasta username is already taken.' : error.message);
      return;
    }
    const nextProfile = data as BrastaProfile;
    setProfile(nextProfile);
    try { localStorage.setItem('brasta-online-last-name', nextProfile.display_name || nextProfile.username || clean); } catch {}
    window.dispatchEvent(new CustomEvent('brasta-auth-changed', {
      detail: { signedIn: true, userId: user.id, username: nextProfile.username },
    }));
    setMessage('Brasta profile ready.');
  }

  async function signOut() {
    setBusy(true);
    setMessage('');
    await supabase!.auth.signOut();
    try { localStorage.removeItem(BRASTA_AUTH_TOKEN_KEY); } catch {}
    setBusy(false);
    setOpen(false);
  }

  return (
    <>
      <button className="account-dock" type="button" onClick={() => setOpen(true)} aria-label={user ? 'Open Brasta account' : 'Sign in to Brasta'}>
        {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <span className="account-avatar-fallback">{user ? (displayName || user.email || 'B').slice(0, 1).toUpperCase() : 'B'}</span>}
        <span>{user ? (profile?.username || 'Finish Profile') : 'Sign In'}</span>
      </button>

      {open && (
        <div className="account-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target && !needsUsername) setOpen(false);
        }}>
          <section className="account-modal" role="dialog" aria-modal="true" aria-label="Brasta account">
            {!needsUsername && <button className="account-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>}
            <div className="account-brand-mark">B</div>

            {!user ? (
              <>
                <div className="account-eyebrow">BRASTA ACCOUNT</div>
                <h2>Sign in to Brasta</h2>
                <p>Accounts are optional for private games. Ranked play, matchmaking, leaderboards, and persistent stats will use your Brasta account.</p>
                <div className="account-provider-grid">
                  <button type="button" disabled={busy} onClick={() => void signIn('google')}><span>G</span>Continue with Google</button>
                  <button type="button" disabled={busy} onClick={() => void signIn('apple')}><span>●</span>Continue with Apple</button>
                  <button type="button" disabled={busy} onClick={() => void signIn('discord')}><span>D</span>Continue with Discord</button>
                </div>
                <div className="account-divider"><span>or</span></div>
                <form onSubmit={sendMagicLink} className="account-email-form">
                  <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
                  <button className="primary" disabled={busy || !email.trim()} type="submit">Email me a sign-in link</button>
                </form>
                <button className="account-guest" type="button" onClick={() => setOpen(false)}>Continue as Guest</button>
              </>
            ) : needsUsername ? (
              <>
                <div className="account-eyebrow">ONE LAST STEP</div>
                <h2>Choose your Brasta username</h2>
                <p>This will be your persistent competitive identity. It can be different from the name supplied by Google, Apple, or Discord.</p>
                <form onSubmit={saveUsername} className="account-email-form">
                  <label>Username<input autoFocus maxLength={20} autoCapitalize="none" autoCorrect="off" value={username} onChange={(event) => setUsername(event.target.value.replace(/\s+/g, ''))} placeholder="Donny" /></label>
                  <small>3–20 characters · letters, numbers, underscore</small>
                  <button className="primary" disabled={busy || profileLoading} type="submit">Create Brasta Profile</button>
                </form>
                <button className="account-guest" disabled={busy} type="button" onClick={() => void signOut()}>Sign out instead</button>
              </>
            ) : (
              <>
                <div className="account-profile-head">
                  {avatar ? <img src={avatar} alt="" referrerPolicy="no-referrer" /> : <div className="account-profile-avatar">{(displayName || profile?.username || 'B').slice(0, 1).toUpperCase()}</div>}
                  <div><div className="account-eyebrow">SIGNED IN</div><h2>{profile?.username}</h2><p>{user.email || 'Brasta account'}</p></div>
                </div>
                <div className="account-status-card">
                  <span>Competitive profile</span><b>Unranked</b>
                  <small>Ranked play and matchmaking are the next competitive layer.</small>
                </div>
                <button className="account-secondary" disabled={busy} type="button" onClick={() => void signOut()}>Sign Out</button>
              </>
            )}

            {message && <div className="account-message" aria-live="polite">{message}</div>}
          </section>
        </div>
      )}
    </>
  );
}
