(() => {
  'use strict';
  if (window.__BRASTA_PLAYER_CARD_AVATARS__) return;
  window.__BRASTA_PLAYER_CARD_AVATARS__ = true;

  const CACHE_MS = 60_000;
  const avatarCache = new Map();
  let queued = false;

  function usernameFor(card) {
    return String(card?.querySelector?.('.player-name')?.textContent || card?.dataset?.playerProfile || '').trim().replace(/^@/, '');
  }

  function cacheKey(username) {
    return String(username || '').trim().toLowerCase();
  }

  async function avatarFor(username) {
    const key = cacheKey(username);
    if (!key) return null;
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
    holder.replaceChildren();
    if (avatarUrl) {
      const image = document.createElement('img');
      image.src = avatarUrl;
      image.alt = '';
      image.referrerPolicy = 'no-referrer';
      image.draggable = false;
      holder.appendChild(image);
      holder.classList.add('has-image');
      return;
    }

    const fallback = document.createElement('span');
    fallback.className = 'player-card-avatar-fallback';
    fallback.textContent = (String(username || 'B').trim().slice(0, 1) || 'B').toUpperCase();
    holder.appendChild(fallback);
    holder.classList.remove('has-image');
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

    const requestKey = `${key}:${Date.now()}`;
    holder.dataset.playerCardAvatarRequest = requestKey;
    void avatarFor(username).then((avatarUrl) => {
      if (!card.isConnected || !holder?.isConnected) return;
      if (usernameFor(card).toLowerCase() !== key) return;
      if (holder.dataset.playerCardAvatarRequest !== requestKey) return;
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
  observer.observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('brasta-profile-avatar-changed', (event) => {
    const ownCard = document.querySelector('.player-chip.player-card[data-you="1"]');
    const username = usernameFor(ownCard);
    const key = cacheKey(username);
    const avatarUrl = typeof event?.detail?.avatarUrl === 'string' && event.detail.avatarUrl.startsWith('https://')
      ? event.detail.avatarUrl
      : null;
    if (key) avatarCache.set(key, { at: Date.now(), promise: Promise.resolve(avatarUrl) });
    const holder = ownCard?.querySelector?.('[data-player-card-avatar]');
    if (holder instanceof HTMLElement) renderAvatar(holder, username, avatarUrl);
    schedule();
  });

  schedule();
})();
