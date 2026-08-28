(() => {
  'use strict';
  if (window.__BRASTA_GAME_OVERLAYS__) return;
  window.__BRASTA_GAME_OVERLAYS__ = true;

  const SHOW_MS = 2800;
  const FADE_MS = 220;
  const timers = new Map();
  const dismissed = new Set();

  function keyFor(el) {
    return String(el?.dataset?.eventSeq || '');
  }

  function dismissKey(key) {
    if (!key) return;
    dismissed.add(key);
    while (dismissed.size > 40) dismissed.delete(dismissed.values().next().value);

    document.querySelectorAll('.transient-event-overlay[data-event-seq]').forEach((node) => {
      if (!(node instanceof HTMLElement) || keyFor(node) !== key) return;
      node.classList.add('brasta-event-leaving');
      window.setTimeout(() => {
        try { node.remove(); } catch {}
      }, FADE_MS);
    });
  }

  function watchEvent(el) {
    const key = keyFor(el);
    if (!key) return;

    if (dismissed.has(key)) {
      el.remove();
      return;
    }
    if (timers.has(key)) return;

    const timer = window.setTimeout(() => {
      timers.delete(key);
      dismissKey(key);
    }, SHOW_MS);
    timers.set(key, timer);
  }

  function sync() {
    document.querySelectorAll('.transient-event-overlay[data-event-seq]').forEach((el) => {
      if (el instanceof HTMLElement) watchEvent(el);
    });
  }

  const observer = new MutationObserver(sync);
  function boot() {
    observer.observe(document.body, { childList:true, subtree:true });
    sync();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once:true });
  } else {
    boot();
  }
})();
