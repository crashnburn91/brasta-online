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
    </div>
  );
}
