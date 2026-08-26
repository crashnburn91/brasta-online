(() => {
  'use strict';

  if (window.__BRASTA_MATCH_MENU__) return;
  window.__BRASTA_MATCH_MENU__ = true;

  let queued = false;
  let observer = null;

  function closeMenus() {
    document.querySelectorAll('[data-match-menu]').forEach((menu) => {
      const trigger = menu.querySelector('[data-match-menu-toggle]');
      const panel = menu.querySelector('[data-match-menu-panel]');
      if (panel) panel.hidden = true;
      if (trigger) trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function updateMeta(menu, topbar) {
    const room = String(topbar.querySelector('.room-pill')?.textContent || '').replace(/^Room\s+/i, '').trim();
    const connection = String(topbar.querySelector('.connection')?.textContent || 'Unknown').trim();
    const watcherText = String(topbar.querySelector('.watcher-pill')?.textContent || '');
    const watcherCount = (watcherText.match(/\d+/) || ['0'])[0];

    const roomValue = menu.querySelector('[data-match-menu-room]');
    const statusValue = menu.querySelector('[data-match-menu-status]');
    const spectatorsValue = menu.querySelector('[data-match-menu-spectators]');
    if (roomValue) roomValue.textContent = room || '—';
    if (statusValue) {
      statusValue.textContent = connection || 'Unknown';
      statusValue.className = `match-menu-status ${connection.toLowerCase()}`;
    }
    if (spectatorsValue) spectatorsValue.textContent = watcherCount;
  }

  function enhance() {
    queued = false;
    const topbar = document.querySelector('.topbar');
    const nav = topbar?.querySelector('nav');
    if (!topbar || !nav || !topbar.querySelector('.room-pill')) return;

    const existing = nav.querySelector(':scope > [data-match-menu]');
    if (existing) {
      updateMeta(existing, topbar);
      return;
    }

    const actions = Array.from(nav.querySelectorAll(':scope > button[data-copy-invite], :scope > button[data-copy-spectate], :scope > button[data-online-home]'));
    if (!actions.length) return;

    const menu = document.createElement('div');
    menu.className = 'match-menu';
    menu.dataset.matchMenu = '1';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'match-menu-trigger';
    trigger.dataset.matchMenuToggle = '1';
    trigger.setAttribute('aria-label', 'Open match menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.innerHTML = '<span aria-hidden="true">☰</span>';

    const panel = document.createElement('div');
    panel.className = 'match-menu-panel';
    panel.dataset.matchMenuPanel = '1';
    panel.setAttribute('role', 'menu');
    panel.hidden = true;
    panel.innerHTML = `
      <div class="match-menu-heading">Match Menu</div>
      <div class="match-menu-meta">
        <div><span>Room</span><b data-match-menu-room>—</b></div>
        <div><span>Status</span><b class="match-menu-status" data-match-menu-status>Unknown</b></div>
        <div><span>Spectators</span><b data-match-menu-spectators>0</b></div>
      </div>
      <div class="match-menu-divider"></div>
      <div class="match-menu-actions" data-match-menu-actions></div>`;

    const actionList = panel.querySelector('[data-match-menu-actions]');
    for (const action of actions) {
      action.classList.add('match-menu-item');
      action.setAttribute('role', 'menuitem');
      if (action.hasAttribute('data-copy-invite')) action.textContent = 'Invite Player';
      else if (action.hasAttribute('data-copy-spectate')) action.textContent = 'Invite to Spectate';
      else if (action.hasAttribute('data-online-home')) action.textContent = /stop spectating/i.test(action.textContent || '') ? 'Stop Spectating' : 'Return Home';
      actionList?.appendChild(action);
    }

    menu.append(trigger, panel);
    nav.appendChild(menu);
    updateMeta(menu, topbar);

    trigger.onclick = (event) => {
      event.stopPropagation();
      const open = panel.hidden;
      closeMenus();
      panel.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    panel.onclick = (event) => event.stopPropagation();
    actionList?.addEventListener('click', (event) => {
      if ((event.target instanceof Element) && event.target.closest('button')) {
        window.setTimeout(closeMenus, 0);
      }
    });

    window.dispatchEvent(new CustomEvent('brasta-match-menu-ready'));
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function start() {
    document.addEventListener('click', closeMenus);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closeMenus();
    });

    const app = document.getElementById('app');
    if (app && !observer) {
      observer = new MutationObserver(queueEnhance);
      observer.observe(app, { childList: true, subtree: true });
    }
    queueEnhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
