(() => {
  if (window.__BRASTA_DIRECT_ACTIONS__) return;
  window.__BRASTA_DIRECT_ACTIONS__ = true;

  let queued = false;

  function actionType(panel) {
    return (panel.querySelector('h3')?.textContent || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');
  }

  function isDirectAction(type) {
    return type === 'CAPTURE_LOOSE'
      || type === 'CAPTURE_BUILD'
      || type === 'MAKE_BUILD'
      || type === 'ADD_TO_BUILD'
      || type === 'RAISE_BUILD';
  }

  function enhance() {
    queued = false;

    // Board-first selection flow reconstructs its staged build/loose targets inside
    // the native pending-action UI. Do not auto-submit until that replay finishes;
    // selection-flow-v2 submits the completed action itself.
    if (document.documentElement.dataset.selectionV2Replay === '1') return;

    for (const panel of document.querySelectorAll('.action-panel')) {
      const type = actionType(panel);
      if (!isDirectAction(type)) continue;

      const submit = panel.querySelector('[data-submit]');
      if (!submit || submit.disabled || panel.dataset.directActionCommitted === '1') continue;

      panel.dataset.directActionCommitted = '1';
      panel.classList.add('direct-action-committing');
      requestAnimationFrame(() => {
        if (document.documentElement.dataset.selectionV2Replay === '1') {
          panel.dataset.directActionCommitted = '0';
          panel.classList.remove('direct-action-committing');
          return;
        }
        submit.click();
      });
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
