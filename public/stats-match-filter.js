(() => {
  'use strict';
  if (window.__BRASTA_STATS_MATCH_FILTER_V2__) return;
  window.__BRASTA_STATS_MATCH_FILTER_V2__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const TYPE_SCOPES = [
    { key: 'all', label: 'All' },
    { key: 'ranked', label: 'Ranked' },
    { key: 'private', label: 'Private' },
    { key: 'bot', label: 'Bot' },
  ];
  const MODE_SCOPES = [
    { key: 'all', label: 'All Modes' },
    { key: '1v1', label: '1v1' },
    { key: '2v2', label: '2v2' },
  ];
  const profileCache = new Map();

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function usernameForPanel(panel) {
    const modal = panel.closest('.player-profile-modal, .account-modal');
    if (!modal) return '';
    return String(
      modal.querySelector('#player-profile-title')?.textContent ||
      modal.querySelector('.account-profile-head h2')?.textContent ||
      ''
    ).trim();
  }

  async function fetchProfile(username) {
    if (!username) throw new Error('Missing player username.');
    if (profileCache.has(username)) return profileCache.get(username);
    const promise = (async () => {
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
      if (!response.ok || !data.profile) throw new Error(data.error || 'Could not load filtered stats.');
      return data.profile;
    })();
    profileCache.set(username, promise);
    try { return await promise; }
    catch (error) { profileCache.delete(username); throw error; }
  }

  function typeControlMarkup(kind) {
    return `<div class="ppg-type-filters" data-ppg-type-filters="${kind}" role="group" aria-label="Filter ${kind} by match type">${TYPE_SCOPES.map(({ key, label }) =>
      `<button type="button" data-ppg-type-filter="${key}" aria-pressed="${key === 'all' ? 'true' : 'false'}">${label}</button>`
    ).join('')}</div>`;
  }

  function modeControlMarkup(kind) {
    return `<div class="ppg-mode-filter-row"><span>Mode</span><div class="ppg-mode-filters" data-ppg-mode-filters="${kind}" role="group" aria-label="Filter ${kind} by game mode">${MODE_SCOPES.map(({ key, label }) =>
      `<button type="button" data-ppg-mode-filter="${key}" aria-pressed="${key === 'all' ? 'true' : 'false'}">${label}</button>`
    ).join('')}</div></div>`;
  }

  function controlsMarkup(kind) {
    return `<div class="ppg-filter-stack" data-ppg-filter-stack="${kind}">${typeControlMarkup(kind)}${modeControlMarkup(kind)}</div>`;
  }

  const statKeys = {
    'Matches': ['matchesPlayed', false],
    'Wins': ['wins', false],
    'Win Rate': ['winRate', true],
    'Best Streak': ['bestWinStreak', false],
    'Brastas': ['brastas', false],
    'Big 10': ['bigTenCaptures', false],
    'Big 2': ['bigTwoCaptures', false],
    'Jack Sweeps': ['jackSweeps', false],
    'Burn Calls': ['burnCalls', false],
    'Jacks Burned': ['jackBurns', false],
    'Builds Made': ['buildsMade', false],
    'Last Pickups': ['lastPickups', false],
    'Cards Captured': ['cardsCaptured', false],
    'Current Streak': ['currentWinStreak', false],
    'Best Brasta Streak': ['bestBrastaStreak', false],
    'Opponent Jack Burns': ['opponentJackBurns', false],
  };

  function setTypeActive(controls, key) {
    controls.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.ppgTypeFilter === key ? 'true' : 'false');
    });
  }

  function setModeActive(controls, key) {
    controls.querySelectorAll('[data-ppg-mode-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.ppgModeFilter === key ? 'true' : 'false');
    });
  }

  function scopeLabel(type, mode) {
    const typeLabel = type === 'all' ? 'All matches' : type.charAt(0).toUpperCase() + type.slice(1);
    if (mode === 'all') return typeLabel;
    return `${typeLabel} · ${mode}`;
  }

  function renderStats(panel, type, mode, stats) {
    panel.dataset.ppgStatsScope = type;
    panel.dataset.ppgStatsMode = mode;
    panel.querySelectorAll('.ppg-stat').forEach((tile) => {
      const label = String(tile.querySelector('span')?.textContent || '').trim();
      const mapping = statKeys[label];
      if (!mapping) return;
      const [key, percent] = mapping;
      const value = Number(stats?.[key] || 0);
      const output = percent ? `${value.toFixed(1)}%` : String(Math.max(0, value));
      const target = tile.querySelector('b');
      if (target) target.textContent = output;
    });
    const note = panel.querySelector('.ppg-note');
    if (note) {
      const tracked = stats?.trackedSince
        ? new Date(stats.trackedSince).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;
      const label = scopeLabel(type, mode);
      note.textContent = tracked ? `${label} · tracked since ${tracked}.` : `${label} · no completed matches yet.`;
    }
  }

  async function enhanceStats(panel) {
    if (!(panel instanceof HTMLElement) || !panel.querySelector('.ppg-stat-hero')) return;
    if (!panel.querySelector('[data-ppg-filter-stack="stats"]')) {
      panel.insertAdjacentHTML('afterbegin', controlsMarkup('stats'));
    }
    const stack = panel.querySelector('[data-ppg-filter-stack="stats"]');
    if (!stack || stack.dataset.wired === 'true') return;
    stack.dataset.wired = 'true';

    const typeControls = stack.querySelector('[data-ppg-type-filters="stats"]');
    const modeControls = stack.querySelector('[data-ppg-mode-filters="stats"]');
    const username = usernameForPanel(panel);
    let profile;
    try { profile = await fetchProfile(username); }
    catch (error) {
      console.warn('[Brasta stats filter]', error);
      return;
    }
    if (!panel.isConnected) return;

    const matrix = profile?.progression?.statsMatrix || {};
    const byType = profile?.progression?.statsByType || { all: profile?.progression?.stats || {} };
    const apply = () => {
      const type = panel.dataset.ppgStatsScope || 'all';
      const mode = panel.dataset.ppgStatsMode || 'all';
      if (typeControls) setTypeActive(typeControls, type);
      if (modeControls) setModeActive(modeControls, mode);
      const stats = matrix?.[type]?.[mode] || (mode === 'all' ? byType?.[type] : null) || {};
      renderStats(panel, type, mode, stats);
    };

    typeControls?.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        panel.dataset.ppgStatsScope = button.dataset.ppgTypeFilter || 'all';
        apply();
      });
    });
    modeControls?.querySelectorAll('[data-ppg-mode-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        panel.dataset.ppgStatsMode = button.dataset.ppgModeFilter || 'all';
        apply();
      });
    });
    apply();
  }

  function matchType(card) {
    const meta = String(card.querySelector('.ppg-match-main span')?.textContent || '').trim().toLowerCase();
    if (meta.startsWith('ranked ')) return 'ranked';
    if (meta.startsWith('private ')) return 'private';
    if (meta.startsWith('bot ')) return 'bot';
    return 'unknown';
  }

  function matchMode(card) {
    const meta = String(card.querySelector('.ppg-match-main span')?.textContent || '').trim().toLowerCase();
    if (/\b1v1\b/.test(meta)) return '1v1';
    if (/\b2v2\b/.test(meta)) return '2v2';
    return 'unknown';
  }

  function applyMatchFilter(panel) {
    const type = panel.dataset.ppgMatchesScope || 'all';
    const mode = panel.dataset.ppgMatchesMode || 'all';
    const typeControls = panel.querySelector('[data-ppg-type-filters="matches"]');
    const modeControls = panel.querySelector('[data-ppg-mode-filters="matches"]');
    if (typeControls) setTypeActive(typeControls, type);
    if (modeControls) setModeActive(modeControls, mode);

    const cards = [...panel.querySelectorAll('.ppg-match-list > .ppg-match')];
    let visible = 0;
    cards.forEach((card) => {
      const typeMatch = type === 'all' || matchType(card) === type;
      const modeMatch = mode === 'all' || matchMode(card) === mode;
      const show = typeMatch && modeMatch;
      card.hidden = !show;
      if (show) visible += 1;
    });

    let empty = panel.querySelector('[data-ppg-match-filter-empty]');
    if (!empty && panel.querySelector('.ppg-match-list')) {
      empty = document.createElement('div');
      empty.className = 'ppg-filter-empty';
      empty.dataset.ppgMatchFilterEmpty = 'true';
      panel.querySelector('.ppg-match-list').insertAdjacentElement('afterend', empty);
    }
    if (empty) {
      empty.hidden = visible !== 0;
      const typeText = type === 'all' ? '' : `${type} `;
      const modeText = mode === 'all' ? '' : `${mode} `;
      empty.textContent = `No ${typeText}${modeText}matches in your recent history.`;
    }
  }

  function enhanceMatches(panel) {
    if (!(panel instanceof HTMLElement) || !panel.querySelector('.ppg-match-list')) return;
    if (!panel.querySelector('[data-ppg-filter-stack="matches"]')) {
      panel.insertAdjacentHTML('afterbegin', controlsMarkup('matches'));
    }
    const stack = panel.querySelector('[data-ppg-filter-stack="matches"]');
    if (!stack || stack.dataset.wired === 'true') return;
    stack.dataset.wired = 'true';
    const typeControls = stack.querySelector('[data-ppg-type-filters="matches"]');
    const modeControls = stack.querySelector('[data-ppg-mode-filters="matches"]');

    typeControls?.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        panel.dataset.ppgMatchesScope = button.dataset.ppgTypeFilter || 'all';
        applyMatchFilter(panel);
      });
    });
    modeControls?.querySelectorAll('[data-ppg-mode-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        panel.dataset.ppgMatchesMode = button.dataset.ppgModeFilter || 'all';
        applyMatchFilter(panel);
      });
    });
    applyMatchFilter(panel);
  }

  function scan() {
    document.querySelectorAll('[data-ppg-panel="stats"], [data-account-ppg-panel="stats"]').forEach((panel) => { void enhanceStats(panel); });
    document.querySelectorAll('[data-ppg-panel="matches"], [data-account-ppg-panel="matches"]').forEach(enhanceMatches);
  }

  let queued = false;
  const observer = new MutationObserver(() => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();