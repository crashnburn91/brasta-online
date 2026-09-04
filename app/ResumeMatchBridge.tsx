'use client';

import { useEffect, useState } from 'react';

const RESUME_POLL_MS = 15_000;

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

    const currentRenderedRoomCode = () => {
      // Round-end screens do not render .table, but they are still the current
      // live room. Treat any in-match shell as current so Resume Match never
      // appears on top of the match the player is already in.
      if (!document.querySelector('.lobby, .table, .round-end, .players')) return '';
      try {
        return String(new URLSearchParams(location.search).get('room') || '')
          .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
      } catch {
        return '';
      }
    };

    const currentPlayerSession = () => {
      try {
        const code = String(new URLSearchParams(location.search).get('room') || '')
          .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
        if (!code) return null;
        const raw = localStorage.getItem(`brasta-online-session:player:${code}`);
        if (!raw) return null;
        const session = JSON.parse(raw) as { code?: string; token?: string; role?: string };
        if (!session?.token || session.role !== 'player') return null;
        return { roomCode: code, playerToken: session.token };
      } catch {
        return null;
      }
    };

    let claimedSessionKey = '';

    const claimCurrentSeat = async () => {
      const current = currentPlayerSession();
      if (!current) return;

      // Claiming the exact same seat every five seconds needlessly rewrites the
      // room in Redis. Claim once per browser session/token; reconnects that
      // rotate the player token naturally produce a new key and claim again.
      const key = `${current.roomCode}:${current.playerToken}`;
      if (key === claimedSessionKey) return;
      try {
        const response = await fetch('/api/active-match', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ action: 'claim', ...current }),
          cache: 'no-store',
        });
        if (response.ok) claimedSessionKey = key;
      } catch {}
    };

    const refresh = async () => {
      if (!alive) return;
      await claimCurrentSeat();

      // The current WebSocket already owns this room and keeps it alive. A
      // resume lookup cannot reveal anything useful while this match is on
      // screen, so avoid polling Redis until the player returns home.
      const renderedCode = currentRenderedRoomCode();
      const currentSession = currentPlayerSession();
      if (renderedCode && currentSession?.roomCode === renderedCode) {
        setMatch(null);
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
        if (response.ok) {
          const nextMatch = (data.match || null) as ActiveMatch | null;
          const latestSession = currentPlayerSession();
          const currentCode = latestSession?.roomCode || currentRenderedRoomCode();
          setMatch(nextMatch && currentCode && currentCode === nextMatch.roomCode ? null : nextMatch);
        }
      } catch {}
    };

    void refresh();
    timer = window.setInterval(() => void refresh(), RESUME_POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const onAuthChanged = () => void refresh();
    const onPlayerSession = () => void refresh();
    window.addEventListener('focus', refresh);
    window.addEventListener('brasta-auth-changed', onAuthChanged);
    window.addEventListener('brasta-player-session', onPlayerSession);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('brasta-auth-changed', onAuthChanged);
      window.removeEventListener('brasta-player-session', onPlayerSession);
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
