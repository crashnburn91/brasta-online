(() => {
  const HISTORY_KEY = 'brasta-boot-history-v1';
  const params = new URLSearchParams(window.location.search);
  const mode = params.has('spectate') ? 'spectate' : params.has('room') ? 'room' : 'home';
  const attempt = {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    startedAt: new Date().toISOString(),
    mode,
    events: [],
  };
  const seen = new Set();
  let rendered = false;
  let timedOut = false;
  const started = performance.now();

  const elapsed = () => Math.round(performance.now() - started);
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
  });

  window.addEventListener('error', (event) => {
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
    const wanted = ['/dist/game.js', '/dist/network.js', '/dist/app.js'];
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
    if (rendered || timedOut) return;
    timedOut = true;
    attempt.result = 'timeout';
    attempt.completedAt = new Date().toISOString();
    inspectResources('timeout');
    mark('startup_timeout', {
      gameGlobal: typeof window.Brasta !== 'undefined',
      networkGlobal: typeof window.BrastaNet !== 'undefined',
      online: navigator.onLine,
      visibility: document.visibilityState,
    });
    persist();

    const title = document.getElementById('brasta-boot-title');
    const copy = document.getElementById('brasta-boot-copy');
    const spinner = document.getElementById('brasta-boot-spinner');
    const actions = document.getElementById('brasta-boot-actions');
    if (title) title.textContent = 'Brasta did not finish loading';
    if (copy) copy.textContent = 'Retry the page. If it happens again, open Diagnostics so we can see exactly where startup stopped.';
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
    if (params.get('debug') !== '1') return;
    const button = document.createElement('button');
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

  const progressTimer = window.setInterval(() => {
    checkProgress();
    if (rendered) window.clearInterval(progressTimer);
  }, 100);

  document.addEventListener('DOMContentLoaded', () => {
    mark('dom_content_loaded');
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
    window.setTimeout(showFailure, 8000);
  });

  window.addEventListener('load', () => {
    mark('window_load');
    inspectResources('load');
    checkProgress();
  });
})();
