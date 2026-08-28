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
  let pullStartX = 0;
  let pullStartY = 0;
  let pullDistance = 0;
  let pullTracking = false;
  let pullIndicator = null;

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

  function pullTargetIsSafe(target) {
    if (!(target instanceof Element)) return true;
    return !target.closest('button, input, textarea, select, a, [role="button"], [role="dialog"], .card, .build, .hand, .action-panel, .lobby-controls, .target-list');
  }

  function ensurePullIndicator() {
    if (pullIndicator?.isConnected) return pullIndicator;
    const el = document.createElement('div');
    el.className = 'brasta-pull-refresh';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="brasta-pull-refresh-icon">↻</span><span class="brasta-pull-refresh-label">Pull to refresh</span>';
    document.body.appendChild(el);
    pullIndicator = el;
    return el;
  }

  function resetPullRefresh() {
    pullTracking = false;
    pullDistance = 0;
    if (pullIndicator) {
      pullIndicator.classList.remove('visible', 'armed');
      pullIndicator.style.setProperty('--brasta-pull-distance', '0px');
    }
  }

  function onPullStart(event) {
    if (!shellLocked || keyboardOpen || document.querySelector('[role="dialog"], .burn-call-modal')) return;
    const touch = event.touches?.[0];
    if (!touch || !pullTargetIsSafe(event.target)) return;
    pullStartX = touch.clientX;
    pullStartY = touch.clientY;
    pullDistance = 0;
    pullTracking = true;
  }

  function onPullMove(event) {
    if (!pullTracking || !shellLocked || keyboardOpen) return;
    const touch = event.touches?.[0];
    if (!touch) return;
    const dx = touch.clientX - pullStartX;
    const dy = touch.clientY - pullStartY;

    // Horizontal gestures or upward drags are not refresh gestures.
    if (dy <= 0 || Math.abs(dx) > Math.max(38, dy * 0.55)) {
      resetPullRefresh();
      return;
    }

    // Ignore tiny movements so taps/clicks still feel completely normal.
    if (dy < 12) return;

    // Apply resistance like a native pull-to-refresh surface.
    pullDistance = Math.min(118, Math.round(dy * 0.46));
    const indicator = ensurePullIndicator();
    const armed = pullDistance >= 52;
    indicator.classList.add('visible');
    indicator.classList.toggle('armed', armed);
    indicator.style.setProperty('--brasta-pull-distance', `${pullDistance}px`);
    const label = indicator.querySelector('.brasta-pull-refresh-label');
    if (label) label.textContent = armed ? 'Release to refresh' : 'Pull to refresh';

    // The locked shell has no document scroll to consume this movement; prevent
    // browser rubber-band/gesture side effects only after we know it is a pull.
    event.preventDefault();
  }

  function onPullEnd() {
    if (!pullTracking) return;
    const shouldRefresh = pullDistance >= 52;
    resetPullRefresh();
    if (!shouldRefresh) return;

    const indicator = ensurePullIndicator();
    indicator.classList.add('visible', 'refreshing');
    const label = indicator.querySelector('.brasta-pull-refresh-label');
    if (label) label.textContent = 'Refreshing…';
    window.setTimeout(() => location.reload(), 90);
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
    document.addEventListener('touchstart', onPullStart, { passive: true });
    document.addEventListener('touchmove', onPullMove, { passive: false });
    document.addEventListener('touchend', onPullEnd, { passive: true });
    document.addEventListener('touchcancel', resetPullRefresh, { passive: true });
    window.addEventListener('pageshow', queueSync, { passive: true });
    queueSync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
