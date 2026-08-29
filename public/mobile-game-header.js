(() => {
  'use strict';
  if (window.__BRASTA_MOBILE_MERGED_HEADER__) return;
  window.__BRASTA_MOBILE_MERGED_HEADER__ = true;

  let queued = false;
  let lastConnectionState = null;
  let reconnectSeen = false;
  let connectedTimer = 0;

  function topbarRoundText(topbar) {
    const first = topbar?.querySelector(':scope > div:first-child');
    if (!first) return '';
    const pills = Array.from(first.querySelectorAll('.pill'));
    const round = pills.find((pill) => !pill.classList.contains('room-pill')
      && !pill.classList.contains('spectator-pill')
      && !pill.classList.contains('watcher-pill')
      && /^Round\s+\d+/i.test(String(pill.textContent || '').trim()));
    return round ? String(round.textContent || '').trim() : '';
  }

  function connectionState(topbar) {
    const source = topbar?.querySelector('.connection');
    if (source?.classList.contains('connected')) return 'connected';
    if (source?.classList.contains('connecting')) return 'connecting';
    return 'disconnected';
  }

  function connectionOverlay() {
    let overlay = document.querySelector('.mobile-connection-overlay');
    if (overlay instanceof HTMLElement) return overlay;

    overlay = document.createElement('div');
    overlay.className = 'mobile-connection-overlay';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    overlay.innerHTML = '<span class="mobile-connection-spinner" aria-hidden="true"></span><b>Reconnecting…</b>';
    document.body.appendChild(overlay);
    return overlay;
  }

  function syncConnectionOverlay(topbar) {
    const state = connectionState(topbar);
    const overlay = connectionOverlay();

    if (state === 'connecting' || state === 'disconnected') {
      reconnectSeen = true;
      if (connectedTimer) {
        window.clearTimeout(connectedTimer);
        connectedTimer = 0;
      }
      overlay.className = 'mobile-connection-overlay show reconnecting';
      overlay.innerHTML = '<span class="mobile-connection-spinner" aria-hidden="true"></span><b>Reconnecting…</b>';
    } else if (state === 'connected' && reconnectSeen && lastConnectionState !== 'connected') {
      reconnectSeen = false;
      overlay.className = 'mobile-connection-overlay show connected';
      overlay.innerHTML = '<span class="mobile-connection-check" aria-hidden="true">✓</span><b>Connected</b>';
      if (connectedTimer) window.clearTimeout(connectedTimer);
      connectedTimer = window.setTimeout(() => {
        overlay.className = 'mobile-connection-overlay';
        connectedTimer = 0;
      }, 1200);
    } else if (state === 'connected' && !reconnectSeen && lastConnectionState === null) {
      overlay.className = 'mobile-connection-overlay';
    }

    lastConnectionState = state;
  }

  function ensureGlobalControls(topbar) {
    const navInner = document.querySelector('.brasta-site-nav-inner');
    if (!(navInner instanceof HTMLElement)) return;

    let menu = navInner.querySelector('.mobile-header-menu');
    if (!(menu instanceof HTMLButtonElement)) {
      menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'mobile-header-menu';
      menu.setAttribute('aria-label', 'Open match menu');
      menu.innerHTML = '<span aria-hidden="true">☰</span>';
      menu.addEventListener('click', () => {
        const trigger = document.querySelector('.topbar .match-menu-trigger');
        if (trigger instanceof HTMLButtonElement) {
          trigger.click();
          menu.setAttribute('aria-expanded', trigger.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
        }
      });
      navInner.appendChild(menu);
    }

    const nativeTrigger = document.querySelector('.topbar .match-menu-trigger');
    if (nativeTrigger instanceof HTMLButtonElement) {
      menu.setAttribute('aria-expanded', nativeTrigger.getAttribute('aria-expanded') === 'true' ? 'true' : 'false');
    } else {
      menu.setAttribute('aria-expanded', 'false');
    }
  }

  function ensureRoundPill(topbar) {
    const strip = topbar?.querySelector('.live-score-strip');
    if (!(strip instanceof HTMLElement)) return;

    const roundText = topbarRoundText(topbar);
    let pill = strip.querySelector('.mobile-score-round-pill');

    if (!roundText) {
      pill?.remove();
      return;
    }

    if (!(pill instanceof HTMLElement)) {
      pill = document.createElement('span');
      pill.className = 'mobile-score-round-pill';
    }
    pill.textContent = roundText;

    if (pill.parentElement !== strip || pill !== strip.firstElementChild) {
      strip.insertBefore(pill, strip.firstChild);
    }
  }

  function cleanInactive() {
    document.body.classList.remove('brasta-mobile-merged-header');
    document.querySelectorAll('.mobile-header-menu,.mobile-connection-overlay').forEach((node) => node.remove());
    if (connectedTimer) {
      window.clearTimeout(connectedTimer);
      connectedTimer = 0;
    }
    lastConnectionState = null;
    reconnectSeen = false;
  }

  function enhance() {
    queued = false;
    const topbar = document.querySelector('.topbar');
    const activeMatch = !!topbar && !!document.querySelector('.players') && !!document.querySelector('.table');
    if (!activeMatch) {
      cleanInactive();
      return;
    }

    document.body.classList.add('brasta-mobile-merged-header');
    ensureGlobalControls(topbar);
    ensureRoundPill(topbar);
    syncConnectionOverlay(topbar);
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    new MutationObserver(queueEnhance).observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'aria-expanded'],
    });
    window.addEventListener('resize', queueEnhance, { passive: true });
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
