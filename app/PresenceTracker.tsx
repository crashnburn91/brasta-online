'use client';

import { useEffect } from 'react';
import { BRASTA_AUTH_TOKEN_KEY } from '../lib/supabase-browser';

const VISITOR_SESSION_KEY = 'brasta-visitor-session-id';
const HEARTBEAT_MS = 60_000;
const MIN_HEARTBEAT_GAP_MS = 5_000;

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

type ClientDetails = {
  language: string;
  timezone: string;
  referrer: string;
  standalone: boolean;
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  platform: string;
  platformVersion: string;
  architecture: string;
  bitness: string;
  model: string;
  browserHint: string;
  browserHintVersion: string;
};

async function clientDetails(): Promise<ClientDetails> {
  const details: ClientDetails = {
    language: navigator.language || '',
    timezone: (() => {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; }
    })(),
    referrer: document.referrer || '',
    standalone: window.matchMedia?.('(display-mode: standalone)').matches === true
      || (navigator as any).standalone === true,
    screenWidth: Number(window.screen?.width || 0),
    screenHeight: Number(window.screen?.height || 0),
    viewportWidth: Number(window.innerWidth || document.documentElement.clientWidth || 0),
    viewportHeight: Number(window.innerHeight || document.documentElement.clientHeight || 0),
    pixelRatio: Number(window.devicePixelRatio || 1),
    platform: String((navigator as any).userAgentData?.platform || navigator.platform || ''),
    platformVersion: '',
    architecture: '',
    bitness: '',
    model: '',
    browserHint: '',
    browserHintVersion: '',
  };

  try {
    const uaData = (navigator as any).userAgentData;
    if (uaData?.getHighEntropyValues) {
      const high = await uaData.getHighEntropyValues([
        'architecture',
        'bitness',
        'model',
        'platformVersion',
        'fullVersionList',
      ]);
      details.platform = String(high.platform || uaData.platform || details.platform || '');
      details.platformVersion = String(high.platformVersion || '');
      details.architecture = String(high.architecture || '');
      details.bitness = String(high.bitness || '');
      details.model = String(high.model || '');

      const versions = Array.isArray(high.fullVersionList) ? high.fullVersionList : [];
      const preferred = versions.find((item: any) => /Microsoft Edge|Google Chrome|Chromium|Opera/i.test(String(item?.brand || '')))
        || versions.find((item: any) => !/Not.?A.?Brand/i.test(String(item?.brand || '')))
        || null;
      if (preferred) {
        details.browserHint = String(preferred.brand || '')
          .replace(/^Google Chrome$/i, 'Chrome')
          .replace(/^Microsoft Edge$/i, 'Edge');
        details.browserHintVersion = String(preferred.version || '');
      }
    }
  } catch {
    // Client hints are optional and unsupported by Safari/Firefox.
  }

  return details;
}

export default function PresenceTracker() {
  useEffect(() => {
    const sessionId = visitorSessionId();
    let stopped = false;
    let inFlight = false;
    let lastAttemptAt = 0;
    let lastSentAt = 0;
    let lastSignature = '';
    let cachedDetails: ClientDetails | null = null;

    const getDetails = async () => {
      const base = cachedDetails || await clientDetails();
      cachedDetails = base;
      return {
        ...base,
        viewportWidth: Number(window.innerWidth || document.documentElement.clientWidth || 0),
        viewportHeight: Number(window.innerHeight || document.documentElement.clientHeight || 0),
        pixelRatio: Number(window.devicePixelRatio || 1),
      };
    };

    const heartbeat = async (force = false) => {
      if (stopped || inFlight) return;
      if (!force && document.visibilityState !== 'visible') return;

      const now = Date.now();
      if (now - lastAttemptAt < MIN_HEARTBEAT_GAP_MS) return;

      const currentActivity = activity();
      const currentRoomCode = roomCodeFromUrl() || null;
      const currentPageKey = pageKey();
      const visible = document.visibilityState === 'visible';
      const token = authToken();
      const signature = [
        location.pathname,
        currentPageKey,
        currentActivity,
        currentRoomCode || '',
        visible ? 'visible' : 'hidden',
        token ? 'signed-in' : 'guest',
      ].join('|');

      if (!force && signature === lastSignature && now - lastSentAt < HEARTBEAT_MS) return;

      inFlight = true;
      lastAttemptAt = now;
      try {
        const response = await fetch('/api/presence', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({
            sessionId,
            activity: currentActivity,
            roomCode: currentRoomCode,
            path: location.pathname,
            pageKey: currentPageKey,
            visible,
            client: await getDetails(),
          }),
          cache: 'no-store',
          keepalive: true,
        });
        if (response.ok) {
          lastSentAt = Date.now();
          lastSignature = signature;
        }
      } catch {
        // Presence is best-effort and must never interfere with gameplay.
      } finally {
        inFlight = false;
      }
    };

    const onVisible = () => { if (document.visibilityState === 'visible') void heartbeat(); };
    const onFocus = () => void heartbeat();
    const onAuth = () => void heartbeat(true);
    const onNavigation = () => void heartbeat(true);
    const onResize = () => {
      cachedDetails = cachedDetails ? {
        ...cachedDetails,
        viewportWidth: Number(window.innerWidth || 0),
        viewportHeight: Number(window.innerHeight || 0),
      } : null;
    };

    // The game redraws #app after every move. Signature deduplication lets a
    // real home/lobby/match transition report immediately without treating
    // ordinary card-table rerenders as new presence heartbeats.
    const observer = new MutationObserver(() => void heartbeat());
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: false });

    window.addEventListener('focus', onFocus);
    window.addEventListener('resize', onResize);
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
      window.removeEventListener('resize', onResize);
      window.removeEventListener('popstate', onNavigation);
      window.removeEventListener('brasta-auth-changed', onAuth);
      window.removeEventListener('brasta-player-session', onNavigation);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
