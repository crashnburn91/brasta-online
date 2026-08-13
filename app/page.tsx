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

  const earlyPayload = () => JSON.stringify({
    watchdog: true,
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    readyState: document.readyState,
    events: early,
  }, null, 2);

  const showEarlyDiagnostics = () => {
    if (window.__BRASTA_BOOT__) return;
    const pre = document.getElementById('brasta-boot-diagnostics');
    if (!pre) return;
    pre.textContent = earlyPayload();
    pre.hidden = false;
    mark('early_diagnostics_shown');
  };

  const copyEarlyDiagnostics = () => {
    if (window.__BRASTA_BOOT__) return;
    const text = earlyPayload();
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => window.prompt('Copy Brasta diagnostics:', text));
    } else {
      window.prompt('Copy Brasta diagnostics:', text);
    }
  };

  document.getElementById('brasta-boot-retry')?.addEventListener('click', () => {
    mark('early_retry_clicked');
    window.location.reload();
  });
  document.getElementById('brasta-boot-show-diagnostics')?.addEventListener('click', showEarlyDiagnostics);
  document.getElementById('brasta-boot-copy-diagnostics')?.addEventListener('click', copyEarlyDiagnostics);

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
