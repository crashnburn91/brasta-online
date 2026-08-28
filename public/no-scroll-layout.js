(() => {
  'use strict';
  if (window.__BRASTA_VIEWPORT_SHELL__) return;
  window.__BRASTA_VIEWPORT_SHELL__ = true;

  const root = document.documentElement;
  let baselineHeight = 0;
  let lastWidth = 0;
  let keyboardOpen = false;
  let shellLocked = false;
  let queued = false;
  let focusTimer = 0;

  function viewport() {
    const vv = window.visualViewport;
    return {
      width: Math.round(vv?.width || window.innerWidth || root.clientWidth || 0),
      height: Math.round(vv?.height || window.innerHeight || root.clientHeight || 0),
    };
  }

  function isEditable(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (element.isContentEditable) return true;
    if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
    if (!(element instanceof HTMLInputElement) || element.disabled || element.readOnly) return false;
    const type = String(element.type || 'text').toLowerCase();
    return !['button','checkbox','color','file','hidden','image','radio','range','reset','submit'].includes(type);
  }

  function hasGameShell() {
    const app = document.getElementById('app');
    if (!app) return false;
    return !!app.querySelector('main.lobby, main .table, main .round-end');
  }

  function setClass(name, enabled) {
    root.classList.toggle(name, enabled);
    document.body?.classList.toggle(name, enabled);
  }

  function densityFor(width, height) {
    if (height < 700 || width < 430) return 'tight';
    if (height < 900 || width < 900) return 'compact';
    return 'comfortable';
  }

  function applyDensity(density) {
    for (const name of ['comfortable','compact','tight']) {
      setClass(`brasta-density-${name}`, shellLocked && density === name);
    }
  }

  function layoutOverflows() {
    if (!shellLocked) return false;
    const app = document.getElementById('app');
    const main = app?.querySelector(':scope > main');
    if (!(main instanceof HTMLElement)) return false;
    if (main.scrollHeight > main.clientHeight + 3 || main.scrollWidth > main.clientWidth + 3) return true;

    const table = main.querySelector('.table');
    if (table instanceof HTMLElement && table.scrollHeight > table.clientHeight + 3) return true;

    const action = main.querySelector('.action-panel');
    if (action instanceof HTMLElement && action.scrollWidth > action.clientWidth + 3) return true;
    return false;
  }

  function syncDensity(width, height) {
    let density = densityFor(width, height);
    applyDensity(density);
    // Content can occasionally be denser than viewport dimensions predict
    // (many loose cards, several builds, long player names). Tighten once more
    // rather than clipping or allowing the document to scroll.
    if (shellLocked && density !== 'tight' && layoutOverflows()) {
      density = 'tight';
      applyDensity(density);
    }
  }

  function keyboardIsOpen(height, width) {
    const active = document.activeElement;
    if (!shellLocked || !isEditable(active)) return false;

    if (!baselineHeight || Math.abs(width - lastWidth) > 80) baselineHeight = height;
    const threshold = Math.max(120, Math.round(baselineHeight * 0.18));
    return baselineHeight - height >= threshold;
  }

  function bringFocusedControlIntoView() {
    const active = document.activeElement;
    if (!isEditable(active)) return;
    window.clearTimeout(focusTimer);
    focusTimer = window.setTimeout(() => {
      try { active.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); }
      catch { try { active.scrollIntoView(); } catch {} }
    }, 80);
  }

  function sync() {
    queued = false;
    const { width, height } = viewport();
    root.style.setProperty('--brasta-visual-height', `${Math.max(1, height)}px`);

    const nextLocked = hasGameShell();
    if (nextLocked !== shellLocked) {
      shellLocked = nextLocked;
      setClass('brasta-shell-locked', shellLocked);
      if (shellLocked) {
        baselineHeight = height;
        lastWidth = width;
      } else {
        keyboardOpen = false;
        setClass('brasta-keyboard-open', false);
        baselineHeight = 0;
      }
    }

    if (!shellLocked) {
      syncDensity(width, height);
      lastWidth = width;
      return;
    }

    const activeEditable = isEditable(document.activeElement);
    if (!activeEditable) {
      if (Math.abs(width - lastWidth) > 80) baselineHeight = height;
      baselineHeight = Math.max(baselineHeight || 0, height);
    }

    const nextKeyboard = keyboardIsOpen(height, width);
    if (nextKeyboard !== keyboardOpen) {
      keyboardOpen = nextKeyboard;
      setClass('brasta-keyboard-open', keyboardOpen);
      if (keyboardOpen) bringFocusedControlIntoView();
      else {
        window.setTimeout(() => {
          if (!keyboardOpen && shellLocked) {
            try { window.scrollTo({ top: 0, left: 0, behavior: 'instant' }); }
            catch { window.scrollTo(0, 0); }
          }
        }, 60);
      }
    }

    // Density uses the pre-keyboard viewport so opening the keyboard does not
    // unnecessarily collapse the whole game into a tighter visual mode.
    syncDensity(width, keyboardOpen ? baselineHeight : height);
    lastWidth = width;
  }

  function queueSync() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  }

  function onFocusChange() {
    queueSync();
    window.setTimeout(queueSync, 40);
    window.setTimeout(queueSync, 180);
  }

  function boot() {
    const app = document.getElementById('app') || document.body;
    new MutationObserver(queueSync).observe(app, { childList: true, subtree: true });
    window.addEventListener('resize', queueSync, { passive: true });
    window.addEventListener('orientationchange', () => {
      baselineHeight = 0;
      window.setTimeout(queueSync, 60);
      window.setTimeout(queueSync, 260);
    }, { passive: true });
    window.visualViewport?.addEventListener('resize', queueSync, { passive: true });
    window.visualViewport?.addEventListener('scroll', queueSync, { passive: true });
    document.addEventListener('focusin', onFocusChange, true);
    document.addEventListener('focusout', onFocusChange, true);
    window.addEventListener('pageshow', queueSync, { passive: true });
    queueSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
