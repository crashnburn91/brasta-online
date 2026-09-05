'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type BadgeDefinition = {
  key: string;
  name: string;
  description: string;
  icon: string;
  tier: string;
};

type BadgeProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  badges: Record<string, boolean>;
};

export default function BadgeAdminClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState('');
  const [badges, setBadges] = useState<BadgeDefinition[]>([]);
  const [profiles, setProfiles] = useState<BadgeProfile[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');

  const api = useCallback(async (action: string, extra: Record<string, unknown> = {}, token = accessToken) => {
    if (!token) throw new Error('Sign in to an authorized Brasta admin account first.');
    const response = await fetch('/api/admin/badges', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as {
      error?: string;
      state?: string;
      badges?: BadgeDefinition[];
      profiles?: BadgeProfile[];
    };
    if (!response.ok || data.error) throw new Error(data.error || 'Badge administration request failed.');
    return data;
  }, [accessToken]);

  const loadDefinitions = useCallback(async (token: string) => {
    try {
      const data = await api('definitions', {}, token);
      setBadges(data.badges || []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load admin badges.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!supabase) {
      setMessage('Brasta authentication is not configured.');
      setLoading(false);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const token = data.session?.access_token || '';
      setAccessToken(token);
      if (token) void loadDefinitions(token);
      else {
        setMessage('Sign in to an authorized Brasta admin account, then return here.');
        setLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const token = session?.access_token || '';
      setAccessToken(token);
      if (token) void loadDefinitions(token);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [loadDefinitions, supabase]);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    if (query.trim().length < 2) {
      setProfiles([]);
      setMessage('Enter at least two characters of a username.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      const data = await api('search', { query: query.trim() });
      setBadges(data.badges || badges);
      setProfiles(data.profiles || []);
      if (!(data.profiles || []).length) setMessage('No matching Brasta profiles found.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not search profiles.');
    } finally {
      setLoading(false);
    }
  }

  async function toggle(profile: BadgeProfile, badge: BadgeDefinition) {
    const assigned = Boolean(profile.badges?.[badge.key]);
    const key = `${profile.id}:${badge.key}`;
    if (busy) return;
    setBusy(key);
    setMessage('');
    try {
      await api('assign', { playerId: profile.id, badgeKey: badge.key, assign: !assigned });
      setProfiles((current) => current.map((candidate) => candidate.id === profile.id
        ? { ...candidate, badges: { ...candidate.badges, [badge.key]: !assigned } }
        : candidate));
      setMessage(`${badge.name} ${assigned ? 'revoked from' : 'assigned to'} @${profile.username}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update badge assignment.');
    } finally {
      setBusy('');
    }
  }

  return (
    <main className="badge-admin-shell">
      <header className="badge-admin-header">
        <div><span>BRASTA ADMIN</span><h1>Profile Badges</h1><p>Assign or revoke special profile badges. Achievement badges are awarded automatically.</p></div>
        <nav><a href="/admin/moderation">Moderation</a><a href="/admin/live">Live Traffic</a><a href="/admin/tournaments">Tournaments</a><a href="/">Back to Brasta</a></nav>
      </header>

      {message ? <div className="badge-admin-message" role="status">{message}</div> : null}

      <section className="badge-admin-card special-badges">
        <div className="badge-admin-card-head"><div><span>ADMIN-ASSIGNED</span><h2>Special Badges</h2></div></div>
        <div className="badge-admin-definition-grid">
          {badges.map((badge) => <article key={badge.key}><i>{badge.icon}</i><div><b>{badge.name}</b><p>{badge.description}</p></div></article>)}
        </div>
      </section>

      <section className="badge-admin-card">
        <div className="badge-admin-card-head"><div><span>PLAYER SEARCH</span><h2>Assign Badges</h2></div></div>
        <form className="badge-admin-search" onSubmit={search}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search username" maxLength={20} aria-label="Search username" />
          <button type="submit" disabled={loading || !accessToken}>{loading ? 'Searching…' : 'Search'}</button>
        </form>

        <div className="badge-admin-results">
          {profiles.map((profile) => (
            <article className="badge-admin-profile" key={profile.id}>
              <div className="badge-admin-player">
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <i>{profile.username.slice(0, 1).toUpperCase()}</i>}
                <b>@{profile.username}</b>
              </div>
              <div className="badge-admin-actions">
                {badges.map((badge) => {
                  const assigned = Boolean(profile.badges?.[badge.key]);
                  const key = `${profile.id}:${badge.key}`;
                  return <button type="button" key={badge.key} className={assigned ? 'assigned' : ''} disabled={Boolean(busy)} onClick={() => void toggle(profile, badge)}>
                    <span>{badge.icon}</span>{assigned ? `Revoke ${badge.name}` : `Assign ${badge.name}`}{busy === key ? '…' : ''}
                  </button>;
                })}
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
