'use client';

import { useEffect } from 'react';
import { BRASTA_AUTH_TOKEN_KEY } from '../lib/supabase-browser';

const VISITOR_SESSION_KEY = 'brasta-visitor-session-id';
const HEARTBEAT_MS = 20_000;

function visitorSessionId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_SESSION_KEY);
    if (existing && /^[A-Za-z0-9_-]{16,80}$/.test(existing)) return existing;
    const next = crypto.randomUUID();
    localStorage.setItem(VISITOR_SESSION_KEY, next);
    return next;
  } catch {
    return crypto.randomUUID();
  }
}

function authToken(): string {
  try { return localStorage.getItem(BRASTA_AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

function roomCodeFromUrl(): string {
  try {
    const params = new URLSearchParams(location.search);
    return String(params.get('room') || params.get('spectate') || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 6);
  } catch {
    return '';
  }
}

function activity(): 'home' | 'lobby' | 'match' | 'spectating' | 'admin' | 'auth' | 'other' {
  if (location.pathname.startsWith('/admin')) return 'admin';
  if (location.pathname.startsWith('/auth')) return 'auth';
  const params = new URLSearchParams(location.search);
  if (params.get('spectate')) return 'spectating';
  if (document.querySelector('.table')) return 'match';
  if (document.querySelector('.lobby')) return 'lobby';
  if (location.pathname === '/') return 'home';
  return 'other';
}

function pageKey(): string {
  const room = roomCodeFromUrl();
  const state = activity();
  return room ? `${location.pathname}|${state}|${room}` : `${location.pathname}|${state}`;
}

export default function PresenceTracker() {
  useEffect(() => {
    const sessionId = visitorSessionId();
    let stopped = false;
    let inFlight = false;

    const heartbeat = async () => {
      if (stopped || inFlight) return;
      inFlight = true;
      const token = authToken();
      try {
        await fetch('/api/presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            activity: activity(),
            roomCode: roomCodeFromUrl() || null,
            path: location.pathname,
            pageKey: pageKey(),
            visible: document.visibilityState === 'visible',
          }),
          cache: 'no-store',
          keepalive: true,
        });
      } catch {
        // Presence is best-effort and must never interfere with gameplay.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void heartbeat(); };
    const onFocus = () => void heartbeat();
    const onAuth = () => void heartbeat();
    const onNavigation = () => void heartbeat();

    const observer = new MutationObserver(() => void heartbeat());
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: false });

    window.addEventListener('focus', onFocus);
    window.addEventListener('popstate', onNavigation);
    window.addEventListener('brasta-auth-changed', onAuth);
    window.addEventListener('brasta-player-session', onNavigation);
    document.addEventListener('visibilitychange', onVisible);

    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), HEARTBEAT_MS);

    return () => {
      stopped = true;
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('popstate', onNavigation);
      window.removeEventListener('brasta-auth-changed', onAuth);
      window.removeEventListener('brasta-player-session', onNavigation);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
