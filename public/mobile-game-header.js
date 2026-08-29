(() => {
  'use strict';
  if (window.__BRASTA_MOBILE_MERGED_HEADER__) return;
  window.__BRASTA_MOBILE_MERGED_HEADER__ = true;

  let queued = false;

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

  function syncConnection(topbar, status) {
    const source = topbar?.querySelector('.connection');
    const state = source?.classList.contains('connected')
      ? 'connected'
      : source?.classList.contains('connecting')
        ? 'connecting'
        : 'disconnected';
    status.className = `mobile-header-connection ${state}`;
    const label = state === 'connected' ? 'Connected' : state === 'connecting' ? 'Connecting' : 'Disconnected';
    status.setAttribute('aria-label', label);
    status.title = label;
  }

  function ensureGlobalControls(topbar) {
    const navInner = document.querySelector('.brasta-site-nav-inner');
    if (!(navInner instanceof HTMLElement)) return;

    let status = navInner.querySelector('.mobile-header-connection');
    if (!(status instanceof HTMLElement)) {
      status = document.createElement('span');
      status.className = 'mobile-header-connection disconnected';
      status.setAttribute('role', 'status');
    }
    const brand = navInner.querySelector('.brasta-site-brand');
    if (brand instanceof HTMLElement && status.previousElementSibling !== brand) {
      brand.insertAdjacentElement('afterend', status);
    } else if (!(brand instanceof HTMLElement) && status.parentElement !== navInner) {
      navInner.prepend(status);
    }
    syncConnection(topbar, status);

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

    const target = strip.querySelector('.live-score-target');
    if (target) {
      if (pill.parentElement !== strip || pill.nextElementSibling !== target) {
        strip.insertBefore(pill, target);
      }
    } else if (pill.parentElement !== strip) {
      strip.appendChild(pill);
    }
  }

  function cleanInactive() {
    document.body.classList.remove('brasta-mobile-merged-header');
    document.querySelectorAll('.mobile-header-connection,.mobile-header-menu').forEach((node) => node.remove());
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
