(() => {
  'use strict';

  if (window.__BRASTA_MATCH_MENU__) return;
  window.__BRASTA_MATCH_MENU__ = true;

  let queued = false;
  let observer = null;
  let abandonSubmitting = false;

  const SOLO_RANKED_PREFIX = 'brasta-ranked-room:';
  const TEAM_RANKED_PREFIX = 'brasta-ranked-2v2-room:';

  function roomCode() {
    try {
      return String(new URLSearchParams(location.search).get('room') || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
    } catch {
      return '';
    }
  }

  function isRankedRoom(code = roomCode()) {
    if (!code) return false;
    try {
      return Boolean(localStorage.getItem(SOLO_RANKED_PREFIX + code) || localStorage.getItem(TEAM_RANKED_PREFIX + code));
    } catch {
      return false;
    }
  }

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

  function shouldShowAbandon() {
    const chatContext = window.__BRASTA_CHAT_CONTEXT__;
    if (!chatContext?.active || chatContext.role !== 'player') return false;
    if (!roomCode() || chatContext.ranked || isRankedRoom()) return false;
    if (!document.querySelector('.players')) return false;
    if (document.querySelector('.round-end .match-score')) return false;
    if (document.querySelector('.table')) return true;
    return /^Round\s+\d+\s+complete/i.test(String(document.querySelector('.round-end h2')?.textContent || ''));
  }

  function closeAbandonModal(force = false) {
    if (abandonSubmitting && !force) return;
    document.querySelector('.private-abandon-backdrop')?.remove();
  }

  function openAbandonModal() {
    closeMenus();
    if (!shouldShowAbandon() || document.querySelector('.private-abandon-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'private-abandon-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const card = document.createElement('section');
    card.className = 'private-abandon-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'private-abandon-title');
    card.innerHTML = `
      <div class="private-abandon-eyebrow">PRIVATE MATCH</div>
      <h2 id="private-abandon-title">Abandon this match?</h2>
      <p>This permanently closes the room for every player and removes it from Resume Match.</p>
      <div class="private-abandon-warning"><strong>This cannot be undone.</strong> Bot matches will also stop immediately.</div>
      <div class="private-abandon-actions">
        <button type="button" data-cancel-private-abandon>Cancel</button>
        <button type="button" class="private-abandon-confirm" data-confirm-private-abandon>Abandon Match</button>
      </div>
      <small data-private-abandon-status></small>`;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);
    const cancel = card.querySelector('[data-cancel-private-abandon]');
    const confirm = card.querySelector('[data-confirm-private-abandon]');
    cancel?.addEventListener('click', () => closeAbandonModal());
    confirm?.addEventListener('click', () => {
      if (abandonSubmitting) return;
      abandonSubmitting = true;
      confirm.disabled = true;
      confirm.textContent = 'Abandoning…';
      if (cancel) cancel.disabled = true;
      const status = card.querySelector('[data-private-abandon-status]');
      if (status) status.textContent = 'Closing the private room…';
      window.dispatchEvent(new CustomEvent('brasta-abandon-match'));
    });
    backdrop.addEventListener('mousedown', (event) => {
      if (event.target === backdrop) closeAbandonModal();
    });
    cancel?.focus();
  }

  function syncAbandonAction(panel) {
    const existing = panel?.querySelector('[data-private-abandon-group]');
    if (!shouldShowAbandon()) {
      existing?.remove();
      return;
    }
    if (existing || !panel) return;

    const group = document.createElement('div');
    group.className = 'match-menu-danger private-abandon-menu-group';
    group.dataset.privateAbandonGroup = '1';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'match-menu-item private-abandon-menu-button';
    button.dataset.privateAbandon = '1';
    button.setAttribute('role', 'menuitem');
    button.textContent = 'Abandon Match';
    button.addEventListener('click', openAbandonModal);
    group.appendChild(button);
    panel.appendChild(group);
  }

  function enhance() {
    queued = false;
    const topbar = document.querySelector('.topbar');
    const nav = topbar?.querySelector('nav');
    if (!topbar || !nav || !topbar.querySelector('.room-pill')) return;

    const existing = nav.querySelector(':scope > [data-match-menu]');
    if (existing) {
      updateMeta(existing, topbar);
      syncAbandonAction(existing.querySelector('[data-match-menu-panel]'));
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
    syncAbandonAction(panel);

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
      if (event.key === 'Escape') {
        closeMenus();
        closeAbandonModal();
      }
    });

    window.addEventListener('brasta-chat-context', queueEnhance);
    window.addEventListener('brasta-match-abandoned', () => {
      abandonSubmitting = false;
      closeAbandonModal(true);
      queueEnhance();
    });
    window.addEventListener('brasta-abandon-match-error', (event) => {
      abandonSubmitting = false;
      const card = document.querySelector('.private-abandon-card');
      const confirm = card?.querySelector('[data-confirm-private-abandon]');
      const cancel = card?.querySelector('[data-cancel-private-abandon]');
      const status = card?.querySelector('[data-private-abandon-status]');
      if (confirm) {
        confirm.disabled = false;
        confirm.textContent = 'Abandon Match';
      }
      if (cancel) cancel.disabled = false;
      if (status) status.textContent = event.detail?.message || 'Could not abandon the match. Try again.';
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
