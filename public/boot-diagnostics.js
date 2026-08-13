(() => {
  const HISTORY_KEY = 'brasta-boot-history-v1';
  const params = new URLSearchParams(window.location.search);
  const mode = params.has('spectate') ? 'spectate' : params.has('room') ? 'room' : 'home';
  const earlyEvents = Array.isArray(window.__BRASTA_BOOT_EARLY__) ? window.__BRASTA_BOOT_EARLY__.slice() : [];
  const attempt = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: new Date().toISOString(),
    mode,
    events: earlyEvents,
  };
  const seen = new Set(earlyEvents.map((entry) => entry?.stage).filter(Boolean));
  let rendered = false;
  let timedOut = false;
  let domInitialized = false;

  const elapsed = () => Math.round(performance.now());
  const safeString = (value) => {
    try {
      if (value instanceof Error) return `${value.name}: ${value.message}`;
      if (typeof value === 'string') return value;
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  };

  function persist() {
    try {
      const previous = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      const history = Array.isArray(previous) ? previous.filter((item) => item?.id !== attempt.id) : [];
      history.unshift(attempt);
      localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 5)));
    } catch {}
  }

  function mark(stage, detail) {
    const entry = { ms: elapsed(), stage };
    if (detail !== undefined) entry.detail = detail;
    attempt.events.push(entry);
    persist();
    try { console.info('[Brasta boot]', stage, detail ?? ''); } catch {}
  }

  function markOnce(stage, detail) {
    if (seen.has(stage)) return;
    seen.add(stage);
    mark(stage, detail);
  }

  window.__BRASTA_BOOT__ = attempt;
  window.__brastaBootMark = mark;

  mark('diagnostics_loaded', {
    mode,
    online: navigator.onLine,
    language: navigator.language,
    platform: navigator.platform || '',
    userAgent: navigator.userAgent,
    readyState: document.readyState,
  });

  // Observe the existing socket lifecycle without changing Brasta's reconnect policy.
  const NativeWebSocket = window.WebSocket;
  if (typeof NativeWebSocket === 'function') {
    function TrackedWebSocket(url, protocols) {
      let safeUrl = '';
      try {
        const parsed = new URL(String(url), window.location.href);
        safeUrl = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
      } catch {
        safeUrl = String(url).split('?')[0];
      }
      mark('websocket_requested', { url: safeUrl });
      const socket = protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
      socket.addEventListener('open', () => mark('websocket_open', { url: safeUrl }));
      socket.addEventListener('error', () => mark('websocket_error', { url: safeUrl }));
      socket.addEventListener('close', (event) => mark('websocket_close', {
        url: safeUrl,
        code: event.code,
        clean: event.wasClean,
        reason: event.reason || '',
      }));
      socket.addEventListener('message', (event) => {
        try {
          const message = JSON.parse(String(event.data));
          if (message?.type === 'SESSION') {
            markOnce('session_received', {
              seat: message.session?.seat ?? null,
              spectator: !!message.session?.isSpectator,
            });
          }
          if (message?.type === 'ROOM_STATE') {
            markOnce('first_room_state_received', {
              started: !!message.update?.room?.started,
              revision: message.update?.room?.revision ?? null,
              spectator: !!message.update?.you?.isSpectator,
            });
          }
        } catch {}
      });
      return socket;
    }
    try {
      Object.setPrototypeOf(TrackedWebSocket, NativeWebSocket);
      TrackedWebSocket.prototype = NativeWebSocket.prototype;
      window.WebSocket = TrackedWebSocket;
      mark('websocket_diagnostics_installed');
    } catch (error) {
      mark('websocket_diagnostics_unavailable', { reason: safeString(error) });
    }
  }

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      mark('resource_error', { url: String(target.src || target.href).split('?')[0] });
      return;
    }
    mark('window_error', {
      message: event.message || 'Unknown error',
      file: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    mark('unhandled_rejection', { reason: safeString(event.reason) });
  });

  window.addEventListener('online', () => mark('browser_online'));
  window.addEventListener('offline', () => mark('browser_offline'));
  window.addEventListener('pageshow', (event) => mark('pageshow', { persisted: !!event.persisted }));
  window.addEventListener('pagehide', (event) => mark('pagehide', { persisted: !!event.persisted }));
  document.addEventListener('visibilitychange', () => mark('visibilitychange', { state: document.visibilityState }));

  function inspectResources(label) {
    const wanted = ['/boot-diagnostics.js', '/dist/game.js', '/dist/network.js', '/dist/app.js'];
    const resources = performance.getEntriesByType('resource');
    const report = wanted.map((path) => {
      const entry = resources.find((item) => {
        try { return new URL(item.name, window.location.href).pathname === path; } catch { return false; }
      });
      if (!entry) return { path, found: false };
      return {
        path,
        found: true,
        durationMs: Math.round(entry.duration),
        transferSize: typeof entry.transferSize === 'number' ? entry.transferSize : undefined,
        encodedBodySize: typeof entry.encodedBodySize === 'number' ? entry.encodedBodySize : undefined,
      };
    });
    mark(`resources_${label}`, report);
  }

  function hasRenderedApp() {
    const app = document.getElementById('app');
    const fallback = document.getElementById('brasta-boot-fallback');
    return !!app && !fallback && app.childNodes.length > 0;
  }

  function checkProgress() {
    if (typeof window.Brasta !== 'undefined') markOnce('game_bundle_ready');
    if (typeof window.BrastaNet !== 'undefined') markOnce('network_bundle_ready');
    if (!rendered && hasRenderedApp()) {
      rendered = true;
      attempt.completedAt = new Date().toISOString();
      attempt.result = 'rendered';
      markOnce('first_render');
      persist();
    }
  }

  function diagnosticsPayload() {
    let history = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
      history = Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {}
    return JSON.stringify({ current: attempt, recentAttempts: history }, null, 2);
  }

  function copyDiagnostics() {
    const text = diagnosticsPayload();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => mark('diagnostics_copied'))
        .catch(() => window.prompt('Copy Brasta diagnostics:', text));
    } else {
      window.prompt('Copy Brasta diagnostics:', text);
    }
  }

  function showDiagnostics() {
    const pre = document.getElementById('brasta-boot-diagnostics');
    if (!pre) return;
    pre.textContent = diagnosticsPayload();
    pre.hidden = false;
    mark('diagnostics_shown');
  }

  function showFailure() {
    if (rendered || timedOut || !document.getElementById('brasta-boot-fallback')) return;
    timedOut = true;
    attempt.result = 'timeout';
    attempt.completedAt = new Date().toISOString();
    inspectResources('timeout');
    mark('startup_timeout', {
      gameGlobal: typeof window.Brasta !== 'undefined',
      networkGlobal: typeof window.BrastaNet !== 'undefined',
      online: navigator.onLine,
      visibility: document.visibilityState,
      readyState: document.readyState,
    });
    persist();

    const title = document.getElementById('brasta-boot-title');
    const copy = document.getElementById('brasta-boot-copy');
    const spinner = document.getElementById('brasta-boot-spinner');
    const actions = document.getElementById('brasta-boot-actions');
    if (title) title.textContent = 'Brasta did not finish loading';
    if (copy) copy.textContent = 'The game client did not start. Retry the page, or open Diagnostics to see where loading stopped.';
    if (spinner) spinner.hidden = true;
    if (actions) actions.hidden = false;
  }

  function installFallbackControls() {
    document.getElementById('brasta-boot-retry')?.addEventListener('click', () => {
      mark('retry_clicked');
      window.location.reload();
    });
    document.getElementById('brasta-boot-show-diagnostics')?.addEventListener('click', showDiagnostics);
    document.getElementById('brasta-boot-copy-diagnostics')?.addEventListener('click', copyDiagnostics);
  }

  function installDebugButton() {
    if (params.get('debug') !== '1' || document.getElementById('brasta-debug-button')) return;
    const button = document.createElement('button');
    button.id = 'brasta-debug-button';
    button.type = 'button';
    button.textContent = 'Boot diagnostics';
    button.setAttribute('aria-label', 'Show Brasta boot diagnostics');
    Object.assign(button.style, {
      position: 'fixed', right: '10px', bottom: '10px', zIndex: '99999',
      border: '1px solid #d8b75e', borderRadius: '999px', padding: '8px 11px',
      background: '#071b15', color: '#fff0ac', font: '12px system-ui', cursor: 'pointer',
    });
    button.addEventListener('click', () => {
      let panel = document.getElementById('brasta-debug-overlay');
      if (panel) { panel.remove(); return; }
      panel = document.createElement('div');
      panel.id = 'brasta-debug-overlay';
      Object.assign(panel.style, {
        position: 'fixed', inset: '10px', zIndex: '100000', overflow: 'auto',
        padding: '16px', borderRadius: '12px', border: '1px solid #d8b75e',
        background: '#04100d', color: '#e7eee9', font: '11px ui-monospace, monospace',
        whiteSpace: 'pre-wrap', boxShadow: '0 20px 60px #000a',
      });
      panel.textContent = diagnosticsPayload();
      panel.addEventListener('click', () => panel.remove());
      document.body.appendChild(panel);
    });
    document.body.appendChild(button);
  }

  function initializeDom() {
    if (domInitialized) return;
    domInitialized = true;
    mark('dom_ready', { readyState: document.readyState });
    installFallbackControls();
    installDebugButton();
    checkProgress();

    const app = document.getElementById('app');
    if (app && typeof MutationObserver !== 'undefined') {
      const observer = new MutationObserver(() => {
        checkProgress();
        if (rendered) observer.disconnect();
      });
      observer.observe(app, { childList: true, subtree: true });
    }

    window.setTimeout(() => inspectResources('2s'), 2000);
  }

  const progressTimer = window.setInterval(() => {
    checkProgress();
    if (rendered) window.clearInterval(progressTimer);
  }, 100);

  // Crucially, this timer starts as soon as diagnostics executes. It does not wait for DOMContentLoaded,
  // because DOMContentLoaded itself waits for deferred game scripts.
  window.setTimeout(showFailure, Math.max(0, 8000 - performance.now()));

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeDom, { once: true });
  } else {
    initializeDom();
  }

  const handleWindowLoad = () => {
    markOnce('window_load');
    inspectResources('load');
    checkProgress();
  };
  if (document.readyState === 'complete') handleWindowLoad();
  else window.addEventListener('load', handleWindowLoad, { once: true });
})();
