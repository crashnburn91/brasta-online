'use client';

import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Presence = {
  sessionId: string;
  signedIn: boolean;
  userLabel: string | null;
  activity: 'home' | 'lobby' | 'match' | 'spectating' | 'admin' | 'auth' | 'other';
  roomCode: string | null;
  path: string;
  visible: boolean;
  device: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  firstSeen: number;
  lastSeen: number;
};

type Snapshot = {
  generatedAt: number;
  redisConfigured: boolean;
  totals: {
    active: number;
    guests: number;
    signedIn: number;
    rooms: number;
    playing: number;
    spectating: number;
    recent10m: number;
    visitorsToday: number;
    pageviewsToday: number;
  };
  sessions: Presence[];
};

function ago(timestamp: number): string {
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

function duration(firstSeen: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - firstSeen) / 60_000));
  if (minutes < 1) return '<1m';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function activityLabel(activity: Presence['activity']): string {
  switch (activity) {
    case 'home': return 'Home';
    case 'lobby': return 'Lobby';
    case 'match': return 'Playing';
    case 'spectating': return 'Spectating';
    case 'admin': return 'Admin';
    case 'auth': return 'Auth';
    default: return 'Other';
  }
}

export default function LiveTrafficClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      setError('Brasta authentication is not configured.');
      setLoading(false);
      return;
    }

    let alive = true;
    let timer = 0;

    const load = async () => {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token || '';
      if (!alive) return;
      setSignedIn(Boolean(accessToken));

      if (!accessToken) {
        setSnapshot(null);
        setError('Sign in to Brasta first, then return to this page.');
        setLoading(false);
        return;
      }

      try {
        const response = await fetch('/api/admin/live-traffic', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const result = await response.json().catch(() => ({}));

        if (!alive) return;
        if (!response.ok) {
          setSnapshot(null);
          setError(String(result.error || 'Could not load live traffic.'));
          setLoading(false);
          return;
        }

        setSnapshot(result as Snapshot);
        setError('');
        setLoading(false);
      } catch {
        if (!alive) return;
        setError('Could not reach the live traffic service.');
        setLoading(false);
      }
    };

    void load();
    timer = window.setInterval(() => void load(), 5_000);
    const { data: listener } = supabase.auth.onAuthStateChange(() => void load());

    return () => {
      alive = false;
      window.clearInterval(timer);
      listener.subscription.unsubscribe();
    };
  }, [supabase]);

  return (
    <main className="traffic-shell">
      <header className="traffic-header">
        <div>
          <span className="traffic-kicker">BRASTA ADMIN</span>
          <h1>Live Traffic</h1>
          <p>Real-time browser presence without storing visitor IP addresses.</p>
        </div>
        <a href="/" className="traffic-back">Back to Brasta</a>
      </header>

      {loading && <section className="traffic-panel traffic-message">Loading live traffic…</section>}

      {!loading && error && (
        <section className="traffic-panel traffic-message">
          <strong>{signedIn === false ? 'Sign-in required' : 'Live traffic unavailable'}</strong>
          <p>{error}</p>
          {error.includes('not configured') && (
            <p className="traffic-note">
              Configure <code>BRASTA_ADMIN_EMAILS</code> or <code>BRASTA_ADMIN_USER_IDS</code> in Vercel, then redeploy.
            </p>
          )}
        </section>
      )}

      {snapshot && (
        <>
          {!snapshot.redisConfigured && (
            <section className="traffic-panel traffic-message">
              Redis is not configured for this environment, so shared live presence is unavailable.
            </section>
          )}

          <section className="traffic-stats" aria-label="Live traffic summary">
            <article><span>Online now</span><strong>{snapshot.totals.active}</strong></article>
            <article><span>Guests</span><strong>{snapshot.totals.guests}</strong></article>
            <article><span>Signed in</span><strong>{snapshot.totals.signedIn}</strong></article>
            <article><span>Playing</span><strong>{snapshot.totals.playing}</strong></article>
            <article><span>Spectating</span><strong>{snapshot.totals.spectating}</strong></article>
            <article><span>Active rooms</span><strong>{snapshot.totals.rooms}</strong></article>
            <article><span>Visitors today</span><strong>{snapshot.totals.visitorsToday}</strong></article>
            <article><span>Page views today</span><strong>{snapshot.totals.pageviewsToday}</strong></article>
          </section>

          <section className="traffic-panel">
            <div className="traffic-panel-head">
              <div>
                <h2>Current Sessions</h2>
                <p>{snapshot.totals.recent10m} browser sessions seen in the last 10 minutes.</p>
              </div>
              <span className="traffic-refresh">Auto-refresh · 5s</span>
            </div>

            {snapshot.sessions.length === 0 ? (
              <div className="traffic-empty">No active browser sessions right now.</div>
            ) : (
              <div className="traffic-table-wrap">
                <table className="traffic-table">
                  <thead>
                    <tr>
                      <th>Visitor</th>
                      <th>Device</th>
                      <th>Activity</th>
                      <th>Room</th>
                      <th>Session</th>
                      <th>Seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snapshot.sessions.map((session) => (
                      <tr key={session.sessionId}>
                        <td>
                          <div className="traffic-visitor">
                            <i className={session.signedIn ? 'signed' : 'guest'} />
                            <span>
                              <b>{session.signedIn ? (session.userLabel || 'Signed-in user') : 'Guest'}</b>
                              <small>{session.visible ? 'Visible tab' : 'Background tab'}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          <b className="traffic-device">{session.device}</b>
                          <small>{session.browser}</small>
                        </td>
                        <td><span className={`traffic-activity ${session.activity}`}>{activityLabel(session.activity)}</span></td>
                        <td>{session.roomCode ? <code>{session.roomCode}</code> : '—'}</td>
                        <td>
                          <b>{duration(session.firstSeen)}</b>
                          <small>{session.sessionId.slice(0, 8)}</small>
                        </td>
                        <td>{ago(session.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}
