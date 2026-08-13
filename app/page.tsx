const bootWatchdog = String.raw`(() => {
  const early = window.__BRASTA_BOOT_EARLY__ = Array.isArray(window.__BRASTA_BOOT_EARLY__) ? window.__BRASTA_BOOT_EARLY__ : [];
  const mark = (stage, detail) => {
    const entry = { ms: Math.round(performance.now()), stage };
    if (detail !== undefined) entry.detail = detail;
    early.push(entry);
    try { console.info('[Brasta watchdog]', stage, detail ?? ''); } catch {}
  };

  window.__brastaEarlyMark = mark;
  mark('inline_watchdog_started', { online: navigator.onLine, readyState: document.readyState });

  window.addEventListener('error', (event) => {
    const target = event.target;
    if (target && target !== window && (target.src || target.href)) {
      mark('resource_error', { url: String(target.src || target.href).split('?')[0] });
      return;
    }
    mark('early_window_error', {
      message: event.message || 'Unknown error',
      file: event.filename || '',
      line: event.lineno || 0,
      column: event.colno || 0,
    });
  }, true);

  window.addEventListener('unhandledrejection', (event) => {
    let reason = 'Unknown rejection';
    try { reason = event.reason instanceof Error ? event.reason.message : String(event.reason); } catch {}
    mark('early_unhandled_rejection', { reason });
  });

  const resourceSnapshot = () => {
    const wanted = ['/boot-diagnostics.js', '/dist/game.js', '/dist/network.js', '/dist/app.js'];
    let resources = [];
    try { resources = performance.getEntriesByType('resource'); } catch {}
    return wanted.map((path) => {
      const entry = resources.find((item) => {
        try { return new URL(item.name, window.location.href).pathname === path; } catch { return false; }
      });
      if (!entry) return { path, found: false };
      return {
        path,
        found: true,
        durationMs: Math.round(entry.duration || 0),
        transferSize: typeof entry.transferSize === 'number' ? entry.transferSize : undefined,
        encodedBodySize: typeof entry.encodedBodySize === 'number' ? entry.encodedBodySize : undefined,
      };
    });
  };

  const diagnosticPayload = () => {
    let recentAttempts = [];
    try {
      const parsed = JSON.parse(localStorage.getItem('brasta-boot-history-v1') || '[]');
      if (Array.isArray(parsed)) recentAttempts = parsed.slice(0, 5);
    } catch {}
    return JSON.stringify({
      watchdog: {
        userAgent: navigator.userAgent,
        online: navigator.onLine,
        readyState: document.readyState,
        visibility: document.visibilityState,
        events: early,
        resources: resourceSnapshot(),
        globals: {
          Brasta: typeof window.Brasta !== 'undefined',
          BrastaNet: typeof window.BrastaNet !== 'undefined',
        },
      },
      diagnostics: window.__BRASTA_BOOT__ || null,
      recentAttempts,
    }, null, 2);
  };

  const showDiagnostics = () => {
    const pre = document.getElementById('brasta-boot-diagnostics');
    if (!pre) return;
    pre.textContent = diagnosticPayload();
    pre.hidden = false;
    mark('inline_diagnostics_shown');
  };

  const selectDiagnosticsText = () => {
    const pre = document.getElementById('brasta-boot-diagnostics');
    if (!pre) return false;
    try {
      const range = document.createRange();
      range.selectNodeContents(pre);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    } catch {
      return false;
    }
  };

  const fallbackCopy = (text) => {
    showDiagnostics();
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
      textarea.remove();
      if (copied) {
        mark('inline_diagnostics_copied_fallback');
        const copy = document.getElementById('brasta-boot-copy');
        if (copy) copy.textContent = 'Diagnostics copied. Paste them into the ChatGPT conversation.';
        return;
      }
    } catch {}
    selectDiagnosticsText();
    const copy = document.getElementById('brasta-boot-copy');
    if (copy) copy.textContent = 'Safari could not copy automatically. The diagnostics text below is selected — use Copy, then paste it into the ChatGPT conversation.';
    mark('inline_diagnostics_copy_manual');
  };

  const copyDiagnostics = () => {
    const text = diagnosticPayload();
    mark('inline_copy_clicked');
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      navigator.clipboard.writeText(text).then(() => {
        mark('inline_diagnostics_copied');
        const copy = document.getElementById('brasta-boot-copy');
        if (copy) copy.textContent = 'Diagnostics copied. Paste them into the ChatGPT conversation.';
      }).catch(() => fallbackCopy(text));
    } else {
      fallbackCopy(text);
    }
  };

  const retry = () => {
    mark('inline_retry_clicked');
    window.location.reload();
  };

  document.getElementById('brasta-boot-retry')?.addEventListener('click', retry);
  document.getElementById('brasta-boot-show-diagnostics')?.addEventListener('click', showDiagnostics);
  document.getElementById('brasta-boot-copy-diagnostics')?.addEventListener('click', copyDiagnostics);

  // Expose standalone controls so the optional full diagnostics script can coexist
  // without being required for the failure UI to work.
  window.__BRASTA_BOOT_CONTROLS__ = { retry, showDiagnostics, copyDiagnostics };

  window.setTimeout(() => {
    const fallback = document.getElementById('brasta-boot-fallback');
    if (!fallback) {
      mark('inline_watchdog_app_rendered');
      return;
    }
    mark('inline_watchdog_timeout', {
      readyState: document.readyState,
      online: navigator.onLine,
      gameGlobal: typeof window.Brasta !== 'undefined',
      networkGlobal: typeof window.BrastaNet !== 'undefined',
      resources: resourceSnapshot(),
    });
    const title = document.getElementById('brasta-boot-title');
    const copy = document.getElementById('brasta-boot-copy');
    const spinner = document.getElementById('brasta-boot-spinner');
    const actions = document.getElementById('brasta-boot-actions');
    if (title) title.textContent = 'Brasta did not finish loading';
    if (copy) copy.textContent = 'The game client did not start. Retry the page, or open Diagnostics to see where loading stopped.';
    if (spinner) spinner.hidden = true;
    if (actions) actions.hidden = false;
  }, 8000);
})();`;

export default function Home() {
  return (
    <div id="app">
      <main id="brasta-boot-fallback" className="boot-shell" aria-live="polite">
        <section className="boot-card">
          <div className="logo-mark boot-logo" aria-hidden="true">B</div>
          <p className="boot-eyebrow">BRASTA ONLINE</p>
          <h1 id="brasta-boot-title">Loading Brasta…</h1>
          <p id="brasta-boot-copy" className="boot-copy">Preparing the table and game client.</p>
          <div id="brasta-boot-spinner" className="boot-spinner" aria-label="Loading" />
          <div id="brasta-boot-actions" className="boot-actions" hidden>
            <button id="brasta-boot-retry" type="button" className="primary">Retry</button>
            <button id="brasta-boot-show-diagnostics" type="button">Diagnostics</button>
            <button id="brasta-boot-copy-diagnostics" type="button">Copy Diagnostics</button>
          </div>
          <pre id="brasta-boot-diagnostics" className="boot-diagnostics" hidden />
          <noscript>
            <p className="boot-noscript">Brasta requires JavaScript. Enable JavaScript and reload this page.</p>
          </noscript>
        </section>
      </main>
      <script dangerouslySetInnerHTML={{ __html: bootWatchdog }} />
    </div>
  );
}
