(() => {
  if (window.__BRASTA_BUILD_OWNER_UI__) return;
  window.__BRASTA_BUILD_OWNER_UI__ = true;

  let queued = false;

  function enhance() {
    queued = false;
    const owners = window.__BRASTA_BUILD_OWNERS__;
    if (!(owners instanceof Map)) return;

    document.querySelectorAll('.build[data-build]').forEach((el) => {
      const id = el.getAttribute('data-build') || '';
      const seat = owners.get(id);
      el.classList.remove('build-owner-seat-1', 'build-owner-seat-2', 'build-owner-seat-3', 'build-owner-seat-4');
      el.querySelector('.build-owner-badge')?.remove();
      if (!seat) return;

      el.classList.add(`build-owner-seat-${seat}`);
      const badge = document.createElement('span');
      badge.className = 'build-owner-badge';
      badge.textContent = `S${seat}`;
      badge.title = `Owned by Seat ${seat}`;
      el.appendChild(badge);
    });
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) {
      setTimeout(start, 50);
      return;
    }
    new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
