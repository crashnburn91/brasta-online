(() => {
  'use strict';
  if (window.__BRASTA_PROFILE_BADGES_UI__) return;
  window.__BRASTA_PROFILE_BADGES_UI__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const collectionCache = new Map();
  const equippedCache = new Map();
  const panelResults = new WeakMap();
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  async function api(action, body = {}) {
    const accessToken = token();
    const response = await fetch('/api/profile-badges', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ action, ...body }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || 'Profile title request failed.');
    return data;
  }

  function normalizedUsername(value) {
    return String(value || '').trim().replace(/^@/, '');
  }

  async function collection(username, force = false) {
    const clean = normalizedUsername(username);
    const key = clean.toLowerCase();
    if (!clean) return null;
    if (force) collectionCache.delete(key);
    if (!collectionCache.has(key)) {
      collectionCache.set(key, api('collection', { username: clean }).catch((error) => {
        collectionCache.delete(key);
        throw error;
      }));
    }
    return collectionCache.get(key);
  }

  async function equipped(username, force = false) {
    const clean = normalizedUsername(username);
    const key = clean.toLowerCase();
    if (!clean) return null;
    if (force) equippedCache.delete(key);
    if (!equippedCache.has(key)) {
      equippedCache.set(key, api('equipped', { username: clean }).then((data) => data.equipped || null).catch(() => null));
    }
    return equippedCache.get(key);
  }

  function emblem(badge, compact = false) {
    if (!badge) return '';
    const cosmetic = badge.awardType === 'season_preview';
    return `<span class="profile-badge-emblem tier-${esc(badge.tier || 'standard')} badge-${esc(badge.key)}${compact ? ' compact' : ''}${cosmetic ? ' has-cosmetic-art' : ''}" aria-hidden="true">${cosmetic ? `<img src="${esc(badge.artUrl)}" alt="">` : esc(badge.icon || '★')}</span>`;
  }

  function applyHeadBadge(modal, badge) {
    const h2 = modal.querySelector('.player-profile-identity h2, .account-profile-head h2');
    if (!h2) return;
    let line = modal.querySelector('[data-profile-equipped-badge]');
    if (!badge) {
      line?.remove();
      return;
    }
    if (!line) {
      line = document.createElement('div');
      line.className = 'profile-equipped-badge';
      line.dataset.profileEquippedBadge = 'true';
      h2.insertAdjacentElement('afterend', line);
    }
    line.innerHTML = `${emblem(badge, true)}<span>${esc(badge.name)}</span>`;
    line.title = badge.description || badge.name;
  }

  function cardMarkup(badge, isSelf) {
    const locked = !badge.unlocked;
    const special = badge.awardType === 'admin';
    const cosmetic = badge.awardType === 'season_preview';
    const status = badge.equipped ? 'Equipped'
      : cosmetic ? (badge.premium ? 'Premium · Beta' : 'Free')
      : badge.unlocked ? 'Unlocked'
      : special ? 'Admin awarded'
      : 'Achievement reward';
    const action = (isSelf || cosmetic) && badge.unlocked
      ? `<button type="button" data-badge-equip="${esc(badge.key)}" ${badge.equipped ? 'disabled' : ''}>${badge.equipped ? 'Equipped' : 'Equip'}</button>`
      : '';
    return `<article class="profile-badge-card tier-${esc(badge.tier || 'standard')} ${locked ? 'locked' : 'unlocked'} ${badge.equipped ? 'equipped' : ''} ${special ? 'special' : ''}" data-badge-key="${esc(badge.key)}">
      <div class="profile-badge-card-icon">${emblem(badge)}</div>
      <div class="profile-badge-card-copy"><div><b>${esc(badge.name)}</b><span>${esc(status)}</span></div><p>${cosmetic ? `${esc(badge.setName)} · ` : ''}${esc(badge.description)}</p>${action}</div>
    </article>`;
  }

  function renderPanel(panel, result, username) {
    panelResults.set(panel, { result, username });
    const data = result?.badges || { equipped: null, items: [] };
    const earnedItems = Array.isArray(data.items) ? data.items : [];
    const cosmetics = window.BrastaCosmetics;
    const ownCosmetics = cosmetics?.isOwnProfile(username);
    const cosmeticItems = ownCosmetics ? cosmetics.titleItems() : [];
    const equippedBadge = ownCosmetics ? cosmetics.effectiveTitle(data.equipped || null) : data.equipped || null;
    const items = earnedItems.concat(cosmeticItems).map((item) => ({ ...item, equipped: item.key === equippedBadge?.key }));
    const unlocked = earnedItems.filter((item) => item.unlocked).length;
    const isSelf = Boolean(result?.isSelf);
    panel.dataset.profileBadgeUsername = normalizedUsername(username);
    panel.innerHTML = `
      <div class="profile-badge-hero ${equippedBadge ? 'has-badge' : ''}">
        <div class="profile-badge-hero-emblem">${equippedBadge ? emblem(equippedBadge) : '<span class="profile-badge-empty-emblem">B</span>'}</div>
        <div><span>EQUIPPED TITLE</span><b>${equippedBadge ? esc(equippedBadge.name) : 'None'}</b><small>${equippedBadge ? esc(equippedBadge.description) : 'Choose an unlocked title to represent you.'}</small></div>
        ${(isSelf || (ownCosmetics && equippedBadge?.awardType === 'season_preview')) && equippedBadge ? '<button type="button" data-badge-unequip>Remove</button>' : ''}
      </div>
      <div class="profile-badge-summary"><b>${unlocked}</b><span>of ${earnedItems.length} earned titles unlocked${cosmeticItems.length ? ` · ${cosmeticItems.length} set titles available` : ''}</span></div>
      ${ownCosmetics ? '<p class="cosmetic-beta-note">Equip one title and its matching badge. Premium set titles are available during beta; selections are saved in this browser.</p>' : ''}
      ${result?.error ? `<div class="profile-badge-error">${esc(result.error)}</div>` : ''}
      <div class="profile-badge-grid">${items.map((item) => cardMarkup(item, isSelf)).join('')}</div>`;

    panel.querySelectorAll('[data-badge-equip]').forEach((button) => {
      button.addEventListener('click', () => void changeBadge(panel, username, button.dataset.badgeEquip || null));
    });
    panel.querySelector('[data-badge-unequip]')?.addEventListener('click', () => void changeBadge(panel, username, null));
  }

  async function changeBadge(panel, username, badgeKey) {
    if (panel.dataset.profileBadgeBusy === 'true') return;
    panel.dataset.profileBadgeBusy = 'true';
    panel.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    try {
      const cosmetics = window.BrastaCosmetics;
      const ownCosmetics = cosmetics?.isOwnProfile(username);
      const cosmeticTitle = ownCosmetics && cosmetics.titleItems().some((item) => item.key === badgeKey);
      if (cosmeticTitle || (ownCosmetics && !badgeKey && cosmetics.read().titleSource !== 'earned')) {
        cosmetics.equip('profileTitle', badgeKey);
        return;
      }
      const data = await api('equip', { badgeKey });
      // Keep the cosmetic selection if equipping an earned title fails.
      if (ownCosmetics) {
        if (badgeKey) cosmetics.useEarnedTitle();
        else cosmetics.equip('profileTitle', null);
      }
      const key = normalizedUsername(username).toLowerCase();
      collectionCache.delete(key);
      equippedCache.delete(key);
      const result = { badges: data.badges, isSelf: true };
      renderPanel(panel, result, username);
      applyHeadBadge(panel.closest('.player-profile-modal, .account-modal'), data.badges?.equipped || null);
      window.dispatchEvent(new CustomEvent('brasta-profile-badge-changed', { detail: { username: normalizedUsername(username), equipped: data.badges?.equipped || null } }));
    } catch (error) {
      const cached = panelResults.get(panel);
      if (cached) renderPanel(panel, cached.result, cached.username);
      const message = document.createElement('div');
      message.className = 'profile-badge-error';
      message.textContent = error?.message || 'Could not update your title.';
      panel.prepend(message);
    } finally {
      delete panel.dataset.profileBadgeBusy;
    }
  }

  function usernameForModal(modal) {
    return normalizedUsername(modal.querySelector('#player-profile-title, .account-profile-head h2')?.textContent || '');
  }

  async function loadModal(modal, panel, force = false) {
    const username = usernameForModal(modal);
    if (!username) return;
    if (!force && panel.dataset.profileBadgeLoaded === username.toLowerCase()) return;
    panel.dataset.profileBadgeLoaded = username.toLowerCase();
    panel.innerHTML = '<div class="ppg-empty"><b>Loading titles</b><span>Checking title collection…</span></div>';
    try {
      const result = await collection(username, force);
      if (!panel.isConnected) return;
      renderPanel(panel, result, username);
      applyHeadBadge(modal, result?.badges?.equipped || null);
    } catch (error) {
      if (!panel.isConnected) return;
      renderPanel(panel, { error: `Earned titles are unavailable: ${error?.message || 'Please close and reopen the profile.'}` }, username);
    }
  }

  function hideAccountOverview(modal) {
    const selector = '.account-experience-card,.account-status-card,.account-connections-card,.account-secondary,.account-delete-panel,.account-message,.account-policy-links';
    modal.querySelectorAll(selector).forEach((node) => { node.hidden = true; });
  }

  function enhanceModal(modal) {
    if (!(modal instanceof HTMLElement)) return;
    const tabs = modal.querySelector('.ppg-tabs');
    if (!tabs) return;
    const account = modal.classList.contains('account-modal');
    let button = tabs.querySelector('[data-profile-badges-tab]');
    let panel = modal.querySelector('[data-profile-badges-panel]');

    if (!button) {
      button = document.createElement('button');
      button.type = 'button';
      button.textContent = 'Titles';
      button.dataset.profileBadgesTab = 'true';
      button.setAttribute('role', 'tab');
      button.setAttribute('aria-selected', 'false');
      tabs.appendChild(button);
      tabs.dataset.profileBadgesTabs = 'true';
    } else if (button.textContent !== 'Titles') {
      button.textContent = 'Titles';
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'ppg-panel profile-badges-panel';
      panel.dataset.profileBadgesPanel = account ? 'account' : 'player';
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-label', 'Titles');
      panel.hidden = true;
      const anchor = account
        ? modal.querySelector('[data-account-ppg-panel="achievements"]')
        : modal.querySelector('[data-ppg-panel="achievements"]');
      (anchor || tabs).insertAdjacentElement('afterend', panel);
    }

    if (button.dataset.profileBadgesWired !== 'true') {
      button.dataset.profileBadgesWired = 'true';
      button.addEventListener('click', () => {
        tabs.querySelectorAll('button').forEach((candidate) => candidate.setAttribute('aria-selected', candidate === button ? 'true' : 'false'));
        if (account) {
          hideAccountOverview(modal);
          modal.querySelectorAll('[data-account-ppg-panel]').forEach((node) => { node.hidden = true; });
          modal.dataset.ppgAccountActive = 'badges';
        } else {
          modal.querySelectorAll('[data-ppg-panel]').forEach((node) => { node.hidden = true; });
        }
        panel.hidden = false;
      });
      tabs.addEventListener('click', (event) => {
        const clicked = event.target?.closest?.('button');
        if (clicked && clicked !== button) {
          panel.hidden = true;
          button.setAttribute('aria-selected', 'false');
        }
      });
    }

    void loadModal(modal, panel);
  }

  function enhancePlayerCard(card) {
    if (!(card instanceof HTMLElement)) return;
    const name = card.querySelector('.player-name');
    const username = normalizedUsername(name?.textContent || '');
    if (!username) return;
    const existing = card.querySelector('[data-player-card-profile-badge]');
    if (existing && existing.dataset.playerCardBadgeUser === username.toLowerCase()) return;
    existing?.remove();
    if (card.dataset.profileBadgeLookup === username.toLowerCase()) return;
    card.dataset.profileBadgeLookup = username.toLowerCase();
    void equipped(username).then((badge) => {
      if (!card.isConnected || normalizedUsername(card.querySelector('.player-name')?.textContent || '').toLowerCase() !== username.toLowerCase()) return;
      if (!badge) return;
      const holder = document.createElement('span');
      holder.className = 'player-card-profile-badge';
      holder.dataset.playerCardProfileBadge = 'true';
      holder.dataset.playerCardBadgeUser = username.toLowerCase();
      holder.title = badge.name;
      holder.setAttribute('aria-label', badge.name);
      holder.innerHTML = emblem(badge, true);
      (card.querySelector('.player-name-line') || name?.parentElement)?.appendChild(holder);
    });
  }

  function scan() {
    document.querySelectorAll('.player-profile-modal, .account-modal').forEach(enhanceModal);
    document.querySelectorAll('.player-chip.player-card').forEach(enhancePlayerCard);
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('brasta-profile-badge-changed', (event) => {
    const username = normalizedUsername(event?.detail?.username || '').toLowerCase();
    if (username) {
      collectionCache.delete(username);
      equippedCache.delete(username);
    } else {
      collectionCache.clear();
      equippedCache.clear();
    }
    document.querySelectorAll('.player-chip.player-card').forEach((card) => {
      const cardName = normalizedUsername(card.querySelector('.player-name')?.textContent || '').toLowerCase();
      if (!username || cardName === username) {
        card.querySelector('[data-player-card-profile-badge]')?.remove();
        delete card.dataset.profileBadgeLookup;
      }
    });
    document.querySelectorAll('[data-profile-badges-panel]').forEach((panel) => {
      const modal = panel.closest('.player-profile-modal, .account-modal');
      const modalName = usernameForModal(modal).toLowerCase();
      if (!username || modalName === username) {
        delete panel.dataset.profileBadgeLoaded;
        void loadModal(modal, panel, true);
      }
    });
    scan();
  });

  let lastTitleSelection;
  function refreshCosmeticTitles() {
    const value = window.BrastaCosmetics?.read();
    const selection = value ? `${value.titleSource}:${value.profileTitle}` : '';
    if (selection === lastTitleSelection) return;
    lastTitleSelection = selection;
    document.querySelectorAll('[data-profile-badges-panel]').forEach((panel) => {
      const cached = panelResults.get(panel);
      if (cached) renderPanel(panel, cached.result, cached.username);
    });
  }
  document.addEventListener('brasta-cosmetics-ready', refreshCosmeticTitles);
  document.addEventListener('brasta-cosmetics-changed', refreshCosmeticTitles);

  scan();
})();
