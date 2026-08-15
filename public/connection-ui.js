(() => {
  if (window.__BRASTA_CONNECTION_UI__) return;
  window.__BRASTA_CONNECTION_UI__ = true;

  const KEY = 'brasta-network-diagnostics-v1';
  let modal = null;
  let enhanceScheduled = false;

  function readDiagnostics() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '';
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(ms < 10000 ? 1 : 0)}s`;
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return `${minutes}m ${seconds}s`;
  }

  function entryText(entry) {
    const bits = [];
    if (entry.code) bits.push(`code ${entry.code}`);
    if (entry.reason) bits.push(entry.reason);
    if (entry.lifetimeMs) bits.push(`life ${formatDuration(entry.lifetimeMs)}`);
    if (entry.delayMs) bits.push(`delay ${formatDuration(entry.delayMs)}`);
    if (entry.attempt) bits.push(`try ${entry.attempt}`);
    if (entry.source) bits.push(entry.source);
    if (entry.online === false) bits.push('offline');
    if (entry.visibility && entry.visibility !== 'visible') bits.push(entry.visibility);
    return bits.join(' · ');
  }

  function closeModal() {
    modal?.remove();
    modal = null;
  }

  function copyDiagnostics() {
    const entries = readDiagnostics();
    const payload = JSON.stringify({
      generatedAt: new Date().toISOString(),
      userAgent: navigator.userAgent,
      online: navigator.onLine,
      visibility: document.visibilityState,
      events: entries,
    }, null, 2);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(payload).then(() => {
        const button = modal?.querySelector('[data-copy-connection-log]');
        if (button) {
          button.textContent = 'Copied';
          setTimeout(() => { if (button) button.textContent = 'Copy Diagnostics'; }, 1200);
        }
      }).catch(() => {});
    }
  }

  function showModal() {
    closeModal();
    const entries = readDiagnostics().slice(-18).reverse();
    const overlay = document.createElement('div');
    overlay.className = 'connection-diagnostics-overlay';
    overlay.innerHTML = `
      <section class="connection-diagnostics" role="dialog" aria-modal="true" aria-label="Connection diagnostics">
        <header><div><b>Connection Diagnostics</b><small>No room tokens, names, cards, or game state are recorded.</small></div><button data-close-connection-log aria-label="Close">×</button></header>
        <div class="connection-diag-summary"><span>${navigator.onLine ? 'Online' : 'Offline'}</span><span>${document.visibilityState}</span><span>${entries.length} recent events</span></div>
        <div class="connection-diag-list">
          ${entries.length ? entries.map((entry) => {
            const time = new Date(entry.ts || Date.now()).toLocaleTimeString();
            const detail = entryText(entry);
            return `<div class="connection-diag-row"><time>${time}</time><b>${String(entry.event || 'event')}</b>${detail ? `<small>${detail}</small>` : ''}</div>`;
          }).join('') : '<div class="connection-diag-empty">No connection events recorded yet.</div>'}
        </div>
        <footer><button data-clear-connection-log>Clear</button><button class="primary" data-copy-connection-log>Copy Diagnostics</button></footer>
      </section>`;
    document.body.appendChild(overlay);
    modal = overlay;
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay || event.target.closest('[data-close-connection-log]')) closeModal();
      if (event.target.closest('[data-copy-connection-log]')) copyDiagnostics();
      if (event.target.closest('[data-clear-connection-log]')) {
        try { localStorage.removeItem(KEY); } catch {}
        showModal();
      }
    });
  }

  function enhance() {
    const pill = document.querySelector('.connection');
    if (!pill) return;
    const inGame = !!document.querySelector('.table');
    const reconnecting = inGame && (pill.classList.contains('connecting') || pill.classList.contains('disconnected'));
    const desired = reconnecting ? 'reconnecting…' : pill.classList.contains('connected') ? 'connected' : pill.classList.contains('connecting') ? 'connecting' : 'disconnected';
    if (pill.textContent !== desired) pill.textContent = desired;
    pill.setAttribute('role', 'button');
    pill.setAttribute('tabindex', '0');
    pill.setAttribute('title', 'Connection status · tap for diagnostics');
    if (!pill.dataset.connectionDiagBound) {
      pill.dataset.connectionDiagBound = '1';
      pill.addEventListener('click', showModal);
      pill.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); showModal(); }
      });
    }
  }

  function scheduleEnhance() {
    if (enhanceScheduled) return;
    enhanceScheduled = true;
    requestAnimationFrame(() => {
      enhanceScheduled = false;
      enhance();
    });
  }

  const observer = new MutationObserver(scheduleEnhance);
  function start() {
    const app = document.getElementById('app');
    if (!app) { setTimeout(start, 50); return; }
    observer.observe(app, { childList: true, subtree: true });
    enhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();