'use client';

import { useEffect, useState } from 'react';

type ActiveMatch = {
  kind: 'private' | 'ranked_1v1' | 'ranked_2v2';
  roomCode: string;
  mode: '1v1' | '2v2';
  seat: number;
  started: boolean;
  connected?: boolean;
  updatedAt?: number;
  token?: string;
  name?: string;
  opponent?: string;
  teammate?: string;
  rankName?: string;
};

export default function ResumeMatchBridge({ accessToken }: { accessToken: string }) {
  const [match, setMatch] = useState<ActiveMatch | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!accessToken) {
      setMatch(null);
      return;
    }

    let alive = true;
    let timer = 0;

    const inRoom = () => {
      // A stale ?room= / ?spectate= URL should not suppress Resume Match.
      // Only hide the banner when this browser is actually rendering an
      // active lobby/game surface.
      return Boolean(document.querySelector('.lobby, .table'));
    };

    const refresh = async () => {
      if (!alive || inRoom()) {
        if (alive) setMatch(null);
        return;
      }
      try {
        const response = await fetch('/api/active-match', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: 'no-store',
        });
        const data = await response.json().catch(() => ({}));
        if (!alive) return;
        if (response.ok) setMatch((data.match || null) as ActiveMatch | null);
      } catch {}
    };

    void refresh();
    timer = window.setInterval(() => void refresh(), 5_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onAuthChanged = () => void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('brasta-auth-changed', onAuthChanged);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('brasta-auth-changed', onAuthChanged);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken]);

  useEffect(() => {
    const success = () => {
      setBusy(false);
      setMessage('');
      setMatch(null);
    };
    const error = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ message?: string }>;
      setBusy(false);
      setMessage(String(event.detail?.message || 'Could not resume the match.'));
    };
    window.addEventListener('brasta-account-resume-success', success);
    window.addEventListener('brasta-account-resume-error', error as EventListener);
    return () => {
      window.removeEventListener('brasta-account-resume-success', success);
      window.removeEventListener('brasta-account-resume-error', error as EventListener);
    };
  }, []);

  if (!accessToken || !match) return null;

  const resume = () => {
    if (busy) return;
    setBusy(true);
    setMessage('');

    if (match.kind === 'ranked_1v1' || match.kind === 'ranked_2v2') {
      if (!match.token || !match.name) {
        setBusy(false);
        setMessage('Your ranked match assignment could not be restored.');
        return;
      }
      const code = String(match.roomCode || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      const session = {
        code,
        seat: Number(match.seat),
        token: match.token,
        name: match.name,
        isHost: false,
        role: 'player',
      };
      try {
        localStorage.setItem(`brasta-online-session:player:${code}`, JSON.stringify(session));
        localStorage.setItem('brasta-online-last-name', match.name);
        const markerKey = match.kind === 'ranked_2v2'
          ? `brasta-ranked-2v2-room:${code}`
          : `brasta-ranked-room:${code}`;
        localStorage.setItem(markerKey, JSON.stringify({
          ...match,
          mode: match.mode,
          createdAt: Date.now(),
        }));
      } catch {}
      location.assign(`${location.pathname}?room=${encodeURIComponent(code)}`);
      return;
    }

    window.dispatchEvent(new CustomEvent('brasta-account-resume', {
      detail: { accessToken },
    }));
  };

  return (
    <div className="resume-match-banner" role="status" aria-live="polite">
      <div className="resume-match-copy">
        <span>{match.kind === 'ranked_1v1' ? 'RANKED 1v1 IN PROGRESS' : match.kind === 'ranked_2v2' ? 'RANKED 2v2 IN PROGRESS' : match.started ? 'MATCH IN PROGRESS' : 'ROOM IN PROGRESS'}</span>
        <b>{match.mode.toUpperCase()} · Seat {match.seat}{match.rankName ? ` · ${match.rankName}` : ''}</b>
        <small>
          {match.kind === 'ranked_2v2' && match.teammate
            ? `Teammate: ${match.teammate}`
            : match.kind === 'ranked_1v1' && match.opponent
              ? `vs ${match.opponent}`
              : match.connected
                ? 'Active on another device'
                : 'Your seat is waiting for you'}
        </small>
      </div>
      <button type="button" disabled={busy} onClick={resume}>
        {busy ? 'Resuming…' : 'Resume Match'}
      </button>
      {message && <small className="resume-match-error">{message}</small>}
    </div>
  );
}
