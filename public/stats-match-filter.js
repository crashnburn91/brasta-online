(() => {
  'use strict';
  if (window.__BRASTA_STATS_MATCH_FILTER__) return;
  window.__BRASTA_STATS_MATCH_FILTER__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SCOPES = [
    { key: 'all', label: 'All' },
    { key: 'ranked', label: 'Ranked' },
    { key: 'private', label: 'Private' },
    { key: 'bot', label: 'Bot' },
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

  function controlMarkup(kind) {
    return `<div class="ppg-type-filters" data-ppg-type-filters="${kind}" role="group" aria-label="Filter ${kind} by match type">${SCOPES.map(({ key, label }) =>
      `<button type="button" data-ppg-type-filter="${key}" aria-pressed="${key === 'all' ? 'true' : 'false'}">${label}</button>`
    ).join('')}</div>`;
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
  };

  function setActive(controls, key) {
    controls.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.setAttribute('aria-pressed', button.dataset.ppgTypeFilter === key ? 'true' : 'false');
    });
  }

  function renderStats(panel, scope, stats) {
    panel.dataset.ppgStatsScope = scope;
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
      const label = scope === 'all' ? 'All matches' : scope.charAt(0).toUpperCase() + scope.slice(1);
      const tracked = stats?.trackedSince
        ? new Date(stats.trackedSince).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : null;
      note.textContent = tracked ? `${label} · tracked since ${tracked}.` : `${label} · no completed matches yet.`;
    }
  }

  async function enhanceStats(panel) {
    if (!(panel instanceof HTMLElement) || !panel.querySelector('.ppg-stat-hero')) return;
    if (!panel.querySelector('[data-ppg-type-filters="stats"]')) {
      panel.insertAdjacentHTML('afterbegin', controlMarkup('stats'));
    }
    const controls = panel.querySelector('[data-ppg-type-filters="stats"]');
    if (!controls || controls.dataset.wired === 'true') return;
    controls.dataset.wired = 'true';
    const username = usernameForPanel(panel);
    let profile;
    try { profile = await fetchProfile(username); }
    catch (error) {
      console.warn('[Brasta stats filter]', error);
      return;
    }
    if (!panel.isConnected) return;
    const byType = profile?.progression?.statsByType || { all: profile?.progression?.stats || {} };
    const apply = (key) => {
      setActive(controls, key);
      renderStats(panel, key, byType[key] || {});
    };
    controls.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.addEventListener('click', () => apply(button.dataset.ppgTypeFilter || 'all'));
    });
    apply(panel.dataset.ppgStatsScope || 'all');
  }

  function matchType(card) {
    const meta = String(card.querySelector('.ppg-match-main span')?.textContent || '').trim().toLowerCase();
    if (meta.startsWith('ranked ')) return 'ranked';
    if (meta.startsWith('private ')) return 'private';
    if (meta.startsWith('bot ')) return 'bot';
    return 'unknown';
  }

  function applyMatchFilter(panel, key) {
    const controls = panel.querySelector('[data-ppg-type-filters="matches"]');
    if (controls) setActive(controls, key);
    panel.dataset.ppgMatchesScope = key;
    const cards = [...panel.querySelectorAll('.ppg-match-list > .ppg-match')];
    let visible = 0;
    cards.forEach((card) => {
      const show = key === 'all' || matchType(card) === key;
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
      const label = key === 'all' ? 'matches' : `${key} matches`;
      empty.textContent = `No ${label} in your recent history.`;
    }
  }

  function enhanceMatches(panel) {
    if (!(panel instanceof HTMLElement) || !panel.querySelector('.ppg-match-list')) return;
    if (!panel.querySelector('[data-ppg-type-filters="matches"]')) {
      panel.insertAdjacentHTML('afterbegin', controlMarkup('matches'));
    }
    const controls = panel.querySelector('[data-ppg-type-filters="matches"]');
    if (!controls || controls.dataset.wired === 'true') return;
    controls.dataset.wired = 'true';
    controls.querySelectorAll('[data-ppg-type-filter]').forEach((button) => {
      button.addEventListener('click', () => applyMatchFilter(panel, button.dataset.ppgTypeFilter || 'all'));
    });
    applyMatchFilter(panel, panel.dataset.ppgMatchesScope || 'all');
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