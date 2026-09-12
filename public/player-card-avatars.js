(() => {
  'use strict';
  if (window.__BRASTA_PLAYER_CARD_AVATARS__) return;
  window.__BRASTA_PLAYER_CARD_AVATARS__ = true;

  const CACHE_MS = 60_000;
  const avatarCache = new Map();
  const pendingLookups = new WeakMap();
  const renderedAvatars = new WeakMap();
  let ownAvatarOverride = null;
  let queued = false;

  function usernameFor(card) {
    return String(card?.querySelector?.('.player-name')?.textContent || card?.dataset?.playerProfile || '').trim().replace(/^@/, '');
  }

  function cacheKey(username) {
    return String(username || '').trim().toLowerCase();
  }

  function avatarFor(username) {
    const key = cacheKey(username);
    if (!key) return Promise.resolve(null);
    const cached = avatarCache.get(key);
    if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;

    const promise = fetch('/api/player-avatar', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username }),
      cache: 'no-store',
    })
      .then((response) => response.ok ? response.json() : { avatarUrl: null })
      .then((data) => typeof data?.avatarUrl === 'string' && data.avatarUrl.startsWith('https://') ? data.avatarUrl : null)
      .catch(() => null);

    avatarCache.set(key, { at: Date.now(), promise });
    return promise;
  }

  function renderAvatar(holder, username, avatarUrl) {
    if (!(holder instanceof HTMLElement)) return;
    const initial = (String(username || 'B').trim().slice(0, 1) || 'B').toUpperCase();
    const renderKey = avatarUrl || `initial:${initial}`;
    // Keep a loaded image alive across game renders and cosmetic DOM updates.
    // Replacing it on every observer scan can prevent it from ever painting.
    if (renderedAvatars.get(holder) === renderKey) return;
    renderedAvatars.set(holder, renderKey);
    const fallback = document.createElement('span');
    fallback.className = 'player-card-avatar-fallback brasta-avatar-portrait';
    fallback.textContent = initial;
    holder.replaceChildren(fallback);
    holder.classList.remove('has-image');
    if (avatarUrl) {
      const image = document.createElement('img');
      image.className = 'brasta-avatar-portrait';
      image.src = avatarUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.draggable = false;
      image.addEventListener('error', () => {
        if (image.parentElement !== holder) return;
        image.remove();
        holder.classList.remove('has-image');
      }, { once: true });
      holder.appendChild(image);
      holder.classList.add('has-image');
    }
  }

  function ownAvatarFor(card, key) {
    if (card.dataset.you !== '1') return undefined;
    if (ownAvatarOverride?.username === key) return ownAvatarOverride.avatarUrl;
    const account = document.querySelector('.account-dock[data-brasta-username]');
    if (cacheKey(account?.dataset.brastaUsername) !== key) return undefined;
    const photo = account.querySelector('img');
    return photo?.src?.startsWith('https://') ? photo.src : undefined;
  }

  function enhanceCard(card) {
    if (!(card instanceof HTMLElement)) return;
    const top = card.querySelector('.player-card-top');
    if (!(top instanceof HTMLElement)) return;
    const username = usernameFor(card);
    const key = cacheKey(username);
    if (!key) return;

    let holder = top.querySelector('[data-player-card-avatar]');
    if (!(holder instanceof HTMLElement) || holder.dataset.playerCardAvatarUser !== key) {
      holder?.remove();
      holder = document.createElement('span');
      holder.className = 'player-card-avatar';
      holder.dataset.playerCardAvatar = 'true';
      holder.dataset.playerCardAvatarUser = key;
      holder.setAttribute('aria-hidden', 'true');
      renderAvatar(holder, username, null);
      top.prepend(holder);
    }

    const ownAvatar = ownAvatarFor(card, key);
    if (ownAvatar !== undefined) {
      pendingLookups.delete(holder);
      renderAvatar(holder, username, ownAvatar);
      return;
    }

    const lookup = avatarFor(username);
    if (pendingLookups.get(holder) === lookup) return;
    pendingLookups.set(holder, lookup);
    void lookup.then((avatarUrl) => {
      if (!card.isConnected || !holder?.isConnected) return;
      if (usernameFor(card).toLowerCase() !== key) return;
      if (pendingLookups.get(holder) !== lookup) return;
      renderAvatar(holder, username, avatarUrl);
    });
  }

  function scan() {
    document.querySelectorAll('.player-chip.player-card[data-player-profile]').forEach(enhanceCard);
  }

  function schedule() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      scan();
    });
  }

  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true,
    attributeFilter: ['src', 'data-brasta-username', 'data-you', 'data-player-profile'],
  });

  window.addEventListener('brasta-profile-avatar-changed', (event) => {
    const ownCard = document.querySelector('.player-chip.player-card[data-you="1"]');
    const username = usernameFor(ownCard);
    const key = cacheKey(username);
    const avatarUrl = typeof event?.detail?.avatarUrl === 'string' && event.detail.avatarUrl.startsWith('https://')
      ? event.detail.avatarUrl
      : null;
    ownAvatarOverride = key ? { username: key, avatarUrl } : null;
    if (key) avatarCache.set(key, { at: Date.now(), promise: Promise.resolve(avatarUrl) });
    const holder = ownCard?.querySelector?.('[data-player-card-avatar]');
    if (holder instanceof HTMLElement) {
      pendingLookups.delete(holder);
      renderAvatar(holder, username, avatarUrl);
    }
    schedule();
  });

  window.addEventListener('brasta-auth-changed', () => {
    ownAvatarOverride = null;
    schedule();
  });

  schedule();
})();
