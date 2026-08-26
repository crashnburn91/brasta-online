(() => {
  if (window.__BRASTA_DIRECT_CAPTURE__) return;
  window.__BRASTA_DIRECT_CAPTURE__ = true;

  let queued = false;

  function captureAction(panel) {
    const heading = (panel.querySelector('h3')?.textContent || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
    return heading === 'CAPTURE_LOOSE' || heading === 'CAPTURE_BUILD';
  }

  function enhance() {
    queued = false;
    for (const panel of document.querySelectorAll('.action-panel')) {
      if (!captureAction(panel)) continue;
      const submit = panel.querySelector('[data-submit]');
      if (!submit || submit.disabled || panel.dataset.directCaptureCommitted === '1') continue;

      panel.dataset.directCaptureCommitted = '1';
      panel.classList.add('direct-capture-committing');
      requestAnimationFrame(() => submit.click());
    }
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
    new MutationObserver(queueEnhance).observe(app, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['disabled', 'class'],
    });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
