'use client';

import { useCallback, useEffect, useRef } from 'react';

const CLIENT_VERSION = '0.5.61';
const HISTORY_KEY = 'brasta-bootstrap-history-v2';

type BootEvent = { ms: number; stage: string; detail?: unknown };
type BootAttempt = {
  startedAt: string;
  result: 'booting' | 'rendered' | 'failed';
  events: BootEvent[];
};

declare global {
  interface Window {
    Brasta?: unknown;
    BrastaNet?: unknown;
    __BRASTA_CLIENT_BOOTSTRAPPED__?: boolean;
  }
}

function loadScript(path: string, label: string, mark: (stage: string, detail?: unknown) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const src = `${path}?v=${CLIENT_VERSION}`;
    const existing = Array.from(document.scripts).find((script) => {
      try { return new URL(script.src).pathname === path; } catch { return false; }
    });
    if (existing) {
      mark('legacy_script_already_present', { label, path });
      resolve();
      return;
    }

    mark('legacy_script_requested', { label, path });
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.dataset.brastaLegacy = label;
    script.onload = () => {
      mark('legacy_script_loaded', { label, path });
      resolve();
    };
    script.onerror = () => {
      mark('legacy_script_failed', { label, path });
      reject(new Error(`${label} failed to load`));
    };
    document.body.appendChild(script);
  });
}

export default function BrastaBootstrap() {
  const attemptRef = useRef<BootAttempt>({
    startedAt: new Date().toISOString(),
    result: 'booting',
    events: [],
  });
  const startRef = useRef(0);

  const persist = useCallback(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const previous = raw ? JSON.parse(raw) : [];
      const history = Array.isArray(previous) ? previous : [];
      history.unshift(attemptRef.current);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch {}
  }, []);

  const mark = useCallback((stage: string, detail?: unknown) => {
    const event: BootEvent = {
      ms: Math.round(performance.now() - startRef.current),
      stage,
    };
    if (detail !== undefined) event.detail = detail;
    attemptRef.current.events.push(event);
    try { console.info('[Brasta bootstrap]', stage, detail ?? ''); } catch {}
  }, []);

  const diagnosticsPayload = useCallback(() => {
    let recentAttempts: unknown[] = [];
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) recentAttempts = parsed.slice(0, 5);
    } catch {}

    const resources = ['/dist/game.js', '/dist/build-rules.js', '/dist/network.js', '/dist/app.js'].map((path) => {
      let entry: PerformanceResourceTiming | undefined;
      try {
        entry = performance.getEntriesByType('resource')
          .filter((item): item is PerformanceResourceTiming => item instanceof PerformanceResourceTiming)
          .find((item) => {
            try { return new URL(item.name).pathname === path; } catch { return false; }
          });
      } catch {}
      return entry ? {
        path,
        found: true,
        durationMs: Math.round(entry.duration),
        transferSize: entry.transferSize,
        encodedBodySize: entry.encodedBodySize,
      } : { path, found: false };
    });

    return JSON.stringify({
      version: CLIENT_VERSION,
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      readyState: document.readyState,
      visibility: document.visibilityState,
      globals: {
        Brasta: typeof window.Brasta !== 'undefined',
        BrastaNet: typeof window.BrastaNet !== 'undefined',
      },
      current: attemptRef.current,
      resources,
      recentAttempts,
    }, null, 2);
  }, []);

  const refreshDiagnostics = useCallback((open = false) => {
    const pre = document.getElementById('brasta-boot-diagnostics');
    const details = document.getElementById('brasta-boot-diagnostics-details') as HTMLDetailsElement | null;
    if (pre) pre.textContent = diagnosticsPayload();
    if (details) {
      details.hidden = false;
      if (open) details.open = true;
    }
  }, [diagnosticsPayload]);

  const copyDiagnostics = useCallback(async () => {
    const text = diagnosticsPayload();
    refreshDiagnostics(true);
    try {
      await navigator.clipboard.writeText(text);
      const copy = document.getElementById('brasta-boot-copy');
      if (copy) copy.textContent = 'Diagnostics copied. Paste them into the ChatGPT conversation.';
      return;
    } catch {}

    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.readOnly = true;
      textarea.style.position = 'fixed';
      textarea.style.left = '-9999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = document.execCommand('copy');
      textarea.remove();
      if (copied) {
        const copy = document.getElementById('brasta-boot-copy');
        if (copy) copy.textContent = 'Diagnostics copied. Paste them into the ChatGPT conversation.';
        return;
      }
    } catch {}

    const copy = document.getElementById('brasta-boot-copy');
    if (copy) copy.textContent = 'Automatic copy was unavailable. Open Diagnostics below and copy the text manually.';
  }, [diagnosticsPayload, refreshDiagnostics]);

  useEffect(() => {
    if (window.__BRASTA_CLIENT_BOOTSTRAPPED__) return;
    window.__BRASTA_CLIENT_BOOTSTRAPPED__ = true;
    startRef.current = performance.now();
    mark('react_hydrated', { readyState: document.readyState });

    const app = document.getElementById('app');
    const fallback = document.getElementById('brasta-boot-fallback');
    const title = document.getElementById('brasta-boot-title');
    const copy = document.getElementById('brasta-boot-copy');
    const spinner = document.getElementById('brasta-boot-spinner');
    const actions = document.getElementById('brasta-boot-actions');
    let finished = false;

    const finishSuccess = () => {
      if (finished) return;
      finished = true;
      attemptRef.current.result = 'rendered';
      mark('legacy_app_rendered');
      persist();
      if (fallback) fallback.hidden = true;
    };

    const finishFailure = (reason: string, detail?: unknown) => {
      if (finished) return;
      finished = true;
      attemptRef.current.result = 'failed';
      mark('startup_failed', { reason, detail });
      persist();
      if (title) title.textContent = 'Brasta did not finish loading';
      if (copy) copy.textContent = 'The legacy game client did not start after React finished loading. Retry, or open Diagnostics below.';
      if (spinner) spinner.hidden = true;
      if (actions) actions.hidden = false;
      refreshDiagnostics(false);
    };

    const errorHandler = (event: ErrorEvent) => {
      mark('window_error', {
        message: event.message,
        file: event.filename,
        line: event.lineno,
        column: event.colno,
      });
    };
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      mark('unhandled_rejection', { reason: String(event.reason) });
    };
    window.addEventListener('error', errorHandler);
    window.addEventListener('unhandledrejection', rejectionHandler);

    const observer = app ? new MutationObserver(() => {
      if (app.childNodes.length > 0) finishSuccess();
    }) : null;
    if (app && observer) observer.observe(app, { childList: true, subtree: true });

    const timeout = window.setTimeout(() => {
      if (app && app.childNodes.length > 0) finishSuccess();
      else finishFailure('timeout');
    }, 8000);

    const boot = async () => {
      try {
        await loadScript('/dist/game.js', 'game', mark);
        await loadScript('/dist/build-rules.js', 'build-rules', mark);
        await loadScript('/dist/network.js', 'network', mark);
        await loadScript('/dist/app.js', 'app', mark);

        await new Promise((resolve) => window.setTimeout(resolve, 50));
        if (app && app.childNodes.length === 0 && document.readyState !== 'loading') {
          mark('legacy_domcontentloaded_replayed', { target: 'window' });
          window.dispatchEvent(new Event('DOMContentLoaded'));
          await new Promise((resolve) => window.setTimeout(resolve, 50));
        }

        if (app && app.childNodes.length > 0) finishSuccess();
        else finishFailure('app_loaded_but_did_not_render');
      } catch (error) {
        finishFailure('script_load_error', error instanceof Error ? error.message : String(error));
      }
    };

    void boot();

    return () => {
      observer?.disconnect();
      window.clearTimeout(timeout);
      window.removeEventListener('error', errorHandler);
      window.removeEventListener('unhandledrejection', rejectionHandler);
    };
  }, [mark, persist, refreshDiagnostics]);

  return (
    <div className="brasta-bootstrap-root">
      <div id="app" />
      <main id="brasta-boot-fallback" className="boot-shell" aria-live="polite">
        <section className="boot-card">
          <div className="logo-mark boot-logo" aria-hidden="true">B</div>
          <p className="boot-eyebrow">BRASTA ONLINE</p>
          <h1 id="brasta-boot-title">Loading Brasta…</h1>
          <p id="brasta-boot-copy" className="boot-copy">React is ready. Starting the game client…</p>
          <div id="brasta-boot-spinner" className="boot-spinner" aria-label="Loading" />
          <div id="brasta-boot-actions" className="boot-actions" hidden>
            <a id="brasta-boot-retry" href="" className="primary">Retry</a>
            <button id="brasta-boot-copy-diagnostics" type="button" onClick={() => void copyDiagnostics()}>Copy Diagnostics</button>
          </div>
          <details id="brasta-boot-diagnostics-details" className="boot-diagnostics-details" hidden>
            <summary>Diagnostics</summary>
            <pre id="brasta-boot-diagnostics" className="boot-diagnostics">Diagnostics will appear here if startup fails.</pre>
          </details>
          <noscript>
            <p className="boot-noscript">Brasta requires JavaScript. Enable JavaScript and reload this page.</p>
          </noscript>
        </section>
      </main>
    </div>
  );
}
