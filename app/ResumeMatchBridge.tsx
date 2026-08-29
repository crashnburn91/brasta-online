'use client';

import { useEffect, useState } from 'react';

type ActiveMatch = {
  roomCode: string;
  mode: '1v1' | '2v2';
  seat: number;
  started: boolean;
  connected: boolean;
  updatedAt: number;
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
      try {
        const params = new URLSearchParams(location.search);
        return Boolean(params.get('room') || params.get('spectate'));
      } catch {
        return false;
      }
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
    timer = window.setInterval(() => void refresh(), 15_000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
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
    window.dispatchEvent(new CustomEvent('brasta-account-resume', {
      detail: { accessToken },
    }));
  };

  return (
    <div className="resume-match-banner" role="status" aria-live="polite">
      <div className="resume-match-copy">
        <span>{match.started ? 'MATCH IN PROGRESS' : 'ROOM IN PROGRESS'}</span>
        <b>{match.mode.toUpperCase()} · Seat {match.seat}</b>
        <small>{match.connected ? 'Active on another device' : 'Your seat is waiting for you'}</small>
      </div>
      <button type="button" disabled={busy} onClick={resume}>
        {busy ? 'Resuming…' : 'Resume Match'}
      </button>
      {message && <small className="resume-match-error">{message}</small>}
    </div>
  );
}
