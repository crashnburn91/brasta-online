'use client';

import { useEffect } from 'react';
import {
  Capacitor,
  SystemBars,
  SystemBarsStyle,
  type PluginListenerHandle,
} from '@capacitor/core';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { PushNotifications } from '@capacitor/push-notifications';
import { BRASTA_AUTH_TOKEN_KEY } from '../lib/supabase-browser';

const PUSH_TOKEN_KEY = 'brasta-android-push-token';
const PUSH_REVOCATION_KEY = 'brasta-android-push-revocation';
const PUSH_CHANNEL_ID = 'brasta_gameplay';

type NativeGameState = {
  phase?: 'openingChoice' | 'play' | 'roundEnd' | 'matchEnd';
  currentSeat?: number;
  lastMove?: string | null;
};

type NativeStateTransition = {
  previous?: NativeGameState | null;
  current?: NativeGameState | null;
  you?: { seat?: number | null; role?: 'player' | 'spectator' };
  room?: { code?: string; started?: boolean; revision?: number };
};

function accessToken(): string {
  try { return localStorage.getItem(BRASTA_AUTH_TOKEN_KEY) || ''; } catch { return ''; }
}

function storedPushToken(): string {
  try { return localStorage.getItem(PUSH_TOKEN_KEY) || ''; } catch { return ''; }
}

function rememberPushToken(token: string): void {
  try {
    if (token) localStorage.setItem(PUSH_TOKEN_KEY, token);
    else localStorage.removeItem(PUSH_TOKEN_KEY);
  } catch {}
}

function storedRevocationSecret(): string {
  try { return localStorage.getItem(PUSH_REVOCATION_KEY) || ''; } catch { return ''; }
}

function revocationSecret(): string {
  const stored = storedRevocationSecret();
  if (/^[A-Za-z0-9_-]{43}$/.test(stored)) return stored;
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const value = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  try { localStorage.setItem(PUSH_REVOCATION_KEY, value); } catch {}
  return value;
}

function forgetPushRegistration(): void {
  rememberPushToken('');
  try { localStorage.removeItem(PUSH_REVOCATION_KEY); } catch {}
}

function routeFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && url.hostname === 'brasta.app') {
      return `${url.pathname}${url.search}${url.hash}`;
    }
    if (url.protocol === 'brasta:') {
      const path = `${url.hostname ? `/${url.hostname}` : ''}${url.pathname}` || '/';
      return `${path}${url.search}${url.hash}`;
    }
  } catch {}
  return null;
}

function openRoute(route: unknown): void {
  const clean = String(route || '').trim();
  if (!clean.startsWith('/') || clean.startsWith('//')) return;
  const target = new URL(clean, location.origin);
  if (`${location.pathname}${location.search}${location.hash}` === `${target.pathname}${target.search}${target.hash}`) return;
  location.assign(target.toString());
}

async function syncPushToken(
  action: 'register' | 'unregister',
  token: string,
  secret: string,
  bearer = '',
): Promise<void> {
  if (!token || !secret || (action === 'register' && !bearer)) return;
  const response = await fetch('/api/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify({ action, token, revocationSecret: secret, platform: 'android' }),
    cache: 'no-store',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(payload.error || `Push registration returned ${response.status}.`);
  }
}

function hapticForTransition(detail: NativeStateTransition): void {
  if (document.visibilityState !== 'visible') return;
  const previous = detail.previous;
  const current = detail.current;
  if (!current || detail.you?.role !== 'player' || !detail.you.seat) return;

  const lastMove = String(current.lastMove || '');
  const moveChanged = Boolean(lastMove && lastMove !== String(previous?.lastMove || ''));
  if (current.phase === 'matchEnd' && previous?.phase !== 'matchEnd') {
    void Haptics.notification({ type: NotificationType.Success });
    return;
  }
  if (current.phase === 'roundEnd' && previous?.phase !== 'roundEnd') {
    void Haptics.impact({ style: ImpactStyle.Heavy });
    return;
  }
  if (moveChanged && /called burn|burned/i.test(lastMove)) {
    void Haptics.notification({ type: NotificationType.Warning });
    return;
  }
  if (moveChanged && /captured|swept/i.test(lastMove)) {
    void Haptics.impact({ style: ImpactStyle.Medium });
    return;
  }

  const becameYourTurn = current.currentSeat === detail.you.seat
    && (!previous || previous.currentSeat !== detail.you.seat || previous.phase !== current.phase);
  if (becameYourTurn && (current.phase === 'play' || current.phase === 'openingChoice')) {
    void Haptics.impact({ style: ImpactStyle.Medium });
  }
}

export default function AndroidBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return;

    document.documentElement.dataset.brastaNative = 'android';
    let cancelled = false;
    let registering = false;
    let unregistering = false;
    let lastTapAt = 0;
    const handles: PluginListenerHandle[] = [];

    const keepImmersive = async () => {
      try {
        await SystemBars.setStyle({ style: SystemBarsStyle.Dark });
        await SystemBars.hide();
      } catch (error) {
        console.warn('[Brasta Android] Could not apply immersive mode.', error);
      }
    };

    const registerPush = async () => {
      if (registering || !accessToken()) return;
      registering = true;
      try {
        await PushNotifications.createChannel({
          id: PUSH_CHANNEL_ID,
          name: 'Brasta matches',
          description: 'Match invites, ranked match alerts, and turn reminders.',
          importance: 4,
          visibility: 0,
          lights: true,
          lightColor: '#D8B75E',
          vibration: true,
        });
        let permission = await PushNotifications.checkPermissions();
        if (permission.receive === 'prompt') permission = await PushNotifications.requestPermissions();
        if (permission.receive === 'granted') await PushNotifications.register();
      } catch (error) {
        console.warn('[Brasta Android] Push notifications are not available yet.', error);
      } finally {
        registering = false;
      }
    };

    const unregisterStoredPush = async () => {
      if (unregistering) return;
      const token = storedPushToken();
      const secret = storedRevocationSecret();
      if (!token || !secret) return;
      unregistering = true;
      try {
        await syncPushToken('unregister', token, secret);
        forgetPushRegistration();
      } catch (error) {
        console.warn('[Brasta Android] Could not unregister push token yet.', error);
      } finally {
        unregistering = false;
      }
    };

    const onAuthChanged = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ signedIn?: boolean }>;
      if (event.detail?.signedIn) {
        void registerPush();
        return;
      }
      void unregisterStoredPush();
    };

    const onNativeState = (rawEvent: Event) => {
      hapticForTransition((rawEvent as CustomEvent<NativeStateTransition>).detail || {});
    };

    const onPointerUp = (event: PointerEvent) => {
      if (Date.now() - lastTapAt < 70) return;
      const target = event.target instanceof Element
        ? event.target.closest('button:not(:disabled),a,[role="button"]')
        : null;
      if (!target) return;
      lastTapAt = Date.now();
      void Haptics.impact({ style: ImpactStyle.Light });
    };

    window.addEventListener('brasta-auth-changed', onAuthChanged as EventListener);
    window.addEventListener('brasta-native-state', onNativeState as EventListener);
    document.addEventListener('pointerup', onPointerUp, { passive: true });

    const initialize = async () => {
      await keepImmersive();

      handles.push(await App.addListener('appStateChange', ({ isActive }) => {
        if (!isActive) return;
        void keepImmersive();
        if (accessToken()) void registerPush();
        else void unregisterStoredPush();
      }));
      handles.push(await App.addListener('appUrlOpen', ({ url }) => {
        const route = routeFromUrl(url);
        if (route) {
          void Browser.close().catch(() => {});
          openRoute(route);
        }
      }));
      handles.push(await PushNotifications.addListener('registration', ({ value }) => {
        const token = String(value || '').trim();
        const bearer = accessToken();
        if (!token || !bearer) return;
        const secret = revocationSecret();
        rememberPushToken(token);
        void syncPushToken('register', token, secret, bearer).catch((error) => {
          console.warn('[Brasta Android] Could not sync push token.', error);
        });
      }));
      handles.push(await PushNotifications.addListener('registrationError', (error) => {
        console.warn('[Brasta Android] FCM registration failed.', error.error);
      }));
      handles.push(await PushNotifications.addListener('pushNotificationActionPerformed', ({ notification }) => {
        openRoute(notification.data?.route || notification.data?.path || '/');
      }));

      const launch = await App.getLaunchUrl();
      if (launch?.url) {
        const route = routeFromUrl(launch.url);
        if (route) openRoute(route);
      }
      if (!cancelled && accessToken()) await registerPush();
      else if (!cancelled) await unregisterStoredPush();
    };

    void initialize().catch((error) => {
      console.warn('[Brasta Android] Native bridge initialization failed.', error);
    });

    return () => {
      cancelled = true;
      delete document.documentElement.dataset.brastaNative;
      window.removeEventListener('brasta-auth-changed', onAuthChanged as EventListener);
      window.removeEventListener('brasta-native-state', onNativeState as EventListener);
      document.removeEventListener('pointerup', onPointerUp);
      for (const handle of handles) void handle.remove();
    };
  }, []);

  return null;
}
