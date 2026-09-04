(() => {
  'use strict';
  if (window.__BRASTA_PLAYER_PROFILE_UI__) return;
  window.__BRASTA_PLAYER_PROFILE_UI__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  let openBackdrop = null;

  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function refreshAuthToken() {
    return new Promise((resolve, reject) => {
      const requestId = `player-profile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      let settled = false;
      const cleanup = () => {
        window.removeEventListener('brasta-auth-token-refreshed', onResult);
        window.clearTimeout(timer);
      };
      const onResult = (event) => {
        if (event?.detail?.requestId !== requestId || settled) return;
        settled = true;
        cleanup();
        if (event.detail.ok && event.detail.accessToken) resolve(event.detail.accessToken);
        else reject(new Error(event.detail.message || 'Your Brasta session expired. Please sign in again.'));
      };
      const timer = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Your Brasta session could not be refreshed. Please sign in again.'));
      }, 8000);
      window.addEventListener('brasta-auth-token-refreshed', onResult);
      window.dispatchEvent(new CustomEvent('brasta-refresh-auth-token', { detail: { requestId } }));
    });
  }

  async function friendsApi(action, extra = {}, retried = false) {
    const accessToken = token();
    if (!accessToken) throw new Error('Sign in to use friends.');
    const response = await fetch('/api/friends', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!retried && response.status === 401) {
      await refreshAuthToken();
      return friendsApi(action, extra, true);
    }
    if (!response.ok || data.error) throw new Error(data.error || `Friends service returned ${response.status}.`);
    return data;
  }

  function avatarHtml(profile, username) {
    const initial = esc((username || 'B').slice(0, 1).toUpperCase());
    if (!profile?.avatarUrl) return `<div class="player-profile-avatar-fallback">${initial}</div>`;
    return `<div class="player-profile-avatar"><img src="${esc(profile.avatarUrl)}" alt="" referrerpolicy="no-referrer"><span>${initial}</span></div>`;
  }

  function rankHtml(rank, label) {
    const rankName = rank?.rankName || 'Unranked';
    const renderer = window.BrastaRankBadge?.render;
    const visual = typeof renderer === 'function'
      ? renderer(rankName, { size: 'medium', className: 'player-profile-rank-visual' })
      : `<strong>${esc(rankName)}</strong>`;
    const placement = rank?.gamesPlayed < 5
      ? `<small>${Math.max(0, Number(rank?.gamesPlayed || 0))}/5 placement games</small>`
      : `<small>${Math.max(0, Number(rank?.wins || 0))}W · ${Math.max(0, Number(rank?.losses || 0))}L · Best streak ${Math.max(0, Number(rank?.bestStreak || 0))}</small>`;
    return `<div class="player-profile-rank-card">
      <span class="player-profile-rank-mode">${esc(label)}</span>
      <div class="player-profile-rank-badge">${visual}</div>
      ${placement}
    </div>`;
  }

  function socialButtons(profile) {
    const accessToken = token();
    const relationship = profile.relationship || 'none';
    if (relationship === 'self') {
      return '<div class="player-profile-self-note">This is your Brasta profile.</div>';
    }
    if (!accessToken) {
      return '<button type="button" class="player-profile-signin" data-profile-signin>Sign in to add or block players</button>';
    }

    let friend = '';
    if (relationship === 'friend') friend = '<button type="button" disabled>✓ Friends</button>';
    else if (relationship === 'outgoing') friend = '<button type="button" disabled>Request Sent</button>';
    else if (relationship === 'incoming') friend = '<button type="button" class="primary" data-profile-friend>Accept Friend</button>';
    else if (relationship === 'blocked') friend = '<button type="button" data-profile-unblock>Unblock</button>';
    else if (relationship === 'blocked_by_player') friend = '<button type="button" disabled>Friend Unavailable</button>';
    else friend = '<button type="button" class="primary" data-profile-friend>Add Friend</button>';

    const block = relationship === 'blocked'
      ? ''
      : '<button type="button" class="player-profile-block" data-profile-block>Block</button>';
    return `<div class="player-profile-social-actions">${friend}${block}</div>`;
  }

  function profileBody(profile) {
    const xp = profile.experience || {};
    const progress = Math.max(0, Math.min(100, Number(xp.progressPercent || 0)));
    const memberSince = profile.memberSince
      ? new Date(profile.memberSince).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })
      : '';

    return `
      <div class="player-profile-head">
        ${avatarHtml(profile, profile.username)}
        <div class="player-profile-identity">
          <div class="player-profile-eyebrow">BRASTA PLAYER</div>
          <h2 id="player-profile-title">${esc(profile.username)}</h2>
          ${memberSince ? `<small>Member since ${esc(memberSince)}</small>` : ''}
        </div>
      </div>

      <div class="player-profile-ranks">
        ${rankHtml(profile.ranks?.['1v1'], 'Ranked 1v1')}
        ${rankHtml(profile.ranks?.['2v2'], 'Ranked 2v2')}
      </div>

      <div class="player-profile-xp">
        <div class="player-profile-xp-head">
          <span>Experience</span>
          <b>${esc(xp.title || 'Beginner')} · Level ${Math.max(1, Number(xp.level || 1))}</b>
        </div>
        <div class="player-profile-xp-track" aria-hidden="true"><i style="width:${progress}%"></i></div>
        <small>${esc(xp.progressLabel || '0 / 5 games')}</small>
      </div>

      <div class="player-profile-social" data-profile-social>
        ${socialButtons(profile)}
      </div>
      <div class="player-profile-message" data-profile-message aria-live="polite"></div>
    `;
  }

  function guestBody(username) {
    return `
      <div class="player-profile-head">
        <div class="player-profile-avatar-fallback">${esc((username || 'B').slice(0,1).toUpperCase())}</div>
        <div class="player-profile-identity">
          <div class="player-profile-eyebrow">BRASTA PLAYER</div>
          <h2 id="player-profile-title">${esc(username)}</h2>
        </div>
      </div>
      <div class="player-profile-guest">
        This player is not currently linked to a Brasta account, so ranks, experience, friend requests, and blocking are unavailable from the profile card.
      </div>
    `;
  }

  function closeProfile() {
    if (!openBackdrop) return;
    document.removeEventListener('keydown', onKeyDown);
    openBackdrop.remove();
    openBackdrop = null;
  }

  function onKeyDown(event) {
    if (event.key === 'Escape') closeProfile();
  }

  function makeBackdrop(username) {
    closeProfile();
    const backdrop = document.createElement('div');
    backdrop.className = 'player-profile-backdrop';
    backdrop.innerHTML = `
      <section class="player-profile-modal" role="dialog" aria-modal="true" aria-labelledby="player-profile-title">
        <button type="button" class="player-profile-close" data-profile-close aria-label="Close player profile">×</button>
        <div class="player-profile-loading">
          <div class="player-profile-avatar-skeleton"></div>
          <div><span></span><strong>${esc(username)}</strong><span></span></div>
        </div>
      </section>`;
    backdrop.addEventListener('click', (event) => {
      if (event.target === backdrop || event.target.closest?.('[data-profile-close]')) closeProfile();
    });
    document.body.appendChild(backdrop);
    openBackdrop = backdrop;
    document.addEventListener('keydown', onKeyDown);
    backdrop.querySelector('[data-profile-close]')?.focus();
    return backdrop;
  }

  async function loadProfile(username, backdrop) {
    const accessToken = token();
    const response = await fetch('/api/player-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ username }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    const modal = backdrop.querySelector('.player-profile-modal');
    if (!modal || backdrop !== openBackdrop) return;

    const close = modal.querySelector('.player-profile-close');
    if (response.status === 404) {
      modal.innerHTML = '';
      if (close) modal.appendChild(close);
      modal.insertAdjacentHTML('beforeend', guestBody(username));
      return;
    }
    if (!response.ok || data.error || !data.profile) {
      modal.innerHTML = '';
      if (close) modal.appendChild(close);
      modal.insertAdjacentHTML('beforeend', `<div class="player-profile-error"><h2 id="player-profile-title">${esc(username)}</h2><p>${esc(data.error || 'Could not load this player profile.')}</p></div>`);
      return;
    }

    modal.innerHTML = '';
    if (close) modal.appendChild(close);
    modal.insertAdjacentHTML('beforeend', profileBody(data.profile));
    bindActions(modal, data.profile);
  }

  function setMessage(modal, message, error = false) {
    const el = modal.querySelector('[data-profile-message]');
    if (!el) return;
    el.textContent = message || '';
    el.classList.toggle('error', Boolean(error));
  }

  function rerenderSocial(modal, profile) {
    const social = modal.querySelector('[data-profile-social]');
    if (!social) return;
    social.innerHTML = socialButtons(profile);
    bindActions(modal, profile);
  }

  function bindActions(modal, profile) {
    const signin = modal.querySelector('[data-profile-signin]');
    if (signin) signin.onclick = () => {
      closeProfile();
      document.querySelector('.account-dock')?.click();
    };

    const friend = modal.querySelector('[data-profile-friend]');
    if (friend) friend.onclick = async () => {
      if (friend.disabled) return;
      friend.disabled = true;
      setMessage(modal, '');
      try {
        const data = await friendsApi('send', { username: profile.username });
        profile.relationship = data.state === 'accepted' ? 'friend' : 'outgoing';
        setMessage(modal, data.state === 'accepted' ? `You and ${profile.username} are now friends.` : `Friend request sent to ${profile.username}.`);
        rerenderSocial(modal, profile);
        window.dispatchEvent(new CustomEvent('brasta-friends-updated'));
      } catch (error) {
        friend.disabled = false;
        setMessage(modal, error?.message || 'Could not send friend request.', true);
      }
    };

    const block = modal.querySelector('[data-profile-block]');
    if (block) block.onclick = async () => {
      if (!window.confirm(`Block ${profile.username}? This also removes any friendship and outstanding game invites.`)) return;
      block.disabled = true;
      setMessage(modal, '');
      try {
        await friendsApi('block', { userId: profile.id });
        profile.relationship = 'blocked';
        setMessage(modal, `${profile.username} blocked.`);
        rerenderSocial(modal, profile);
        window.dispatchEvent(new CustomEvent('brasta-friends-updated'));
      } catch (error) {
        block.disabled = false;
        setMessage(modal, error?.message || 'Could not block this player.', true);
      }
    };

    const unblock = modal.querySelector('[data-profile-unblock]');
    if (unblock) unblock.onclick = async () => {
      unblock.disabled = true;
      setMessage(modal, '');
      try {
        await friendsApi('unblock', { userId: profile.id });
        profile.relationship = 'none';
        setMessage(modal, `${profile.username} unblocked.`);
        rerenderSocial(modal, profile);
        window.dispatchEvent(new CustomEvent('brasta-friends-updated'));
      } catch (error) {
        unblock.disabled = false;
        setMessage(modal, error?.message || 'Could not unblock this player.', true);
      }
    };
  }

  function openProfile(card) {
    const username = String(card?.dataset?.playerProfile || '').trim();
    if (!username) return;
    const backdrop = makeBackdrop(username);
    void loadProfile(username, backdrop);
  }

  document.addEventListener('click', (event) => {
    const card = event.target?.closest?.('[data-player-profile]');
    if (!(card instanceof HTMLElement)) return;
    openProfile(card);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const card = event.target?.closest?.('[data-player-profile]');
    if (!(card instanceof HTMLElement) || event.target !== card) return;
    event.preventDefault();
    openProfile(card);
  });
})();