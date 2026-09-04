(() => {
  'use strict';
  if (window.__BRASTA_PLAYER_PROGRESSION_UI_V2__) return;
  window.__BRASTA_PLAYER_PROGRESSION_UI_V2__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  })[char]);
  const num = (value) => Math.max(0, Number(value) || 0);

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function tile(label, value, suffix = '') {
    return `<div class="ppg-stat"><span>${esc(label)}</span><b>${esc(value)}${suffix}</b></div>`;
  }

  function loadingMarkup(label) {
    return `<div class="ppg-empty"><b>${esc(label)}</b><span>Loading player data…</span></div>`;
  }

  function statsMarkup(profile) {
    const s = profile?.progression?.stats || {};
    const tracked = s.trackedSince
      ? new Date(s.trackedSince).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
      : null;
    return `
      <div class="ppg-stat-hero">
        ${tile('Matches', num(s.matchesPlayed))}
        ${tile('Wins', num(s.wins))}
        ${tile('Win Rate', Number(s.winRate || 0).toFixed(1), '%')}
        ${tile('Best Streak', num(s.bestWinStreak))}
      </div>
      <div class="ppg-heading">Game Stats</div>
      <div class="ppg-stat-grid">
        ${tile('Brastas', num(s.brastas))}
        ${tile('Big 10', num(s.bigTenCaptures))}
        ${tile('Big 2', num(s.bigTwoCaptures))}
        ${tile('Jack Sweeps', num(s.jackSweeps))}
        ${tile('Burn Calls', num(s.burnCalls))}
        ${tile('Jacks Burned', num(s.jackBurns))}
        ${tile('Builds Made', num(s.buildsMade))}
        ${tile('Last Pickups', num(s.lastPickups))}
        ${tile('Cards Captured', num(s.cardsCaptured))}
        ${tile('Current Streak', num(s.currentWinStreak))}
      </div>
      <div class="ppg-note">${tracked ? `Stats tracked since ${esc(tracked)}.` : 'Stats begin tracking with completed matches played after this beta update.'}</div>`;
  }

  function relativeTime(value) {
    const when = new Date(value).getTime();
    if (!Number.isFinite(when)) return '';
    const seconds = Math.max(0, Math.floor((Date.now() - when) / 1000));
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  function duration(value) {
    const seconds = num(value);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    const remainder = seconds % 60;
    return remainder ? `${minutes}m ${remainder}s` : `${minutes}m`;
  }

  function eventName(type) {
    return ({
      brasta: 'BRASTA',
      big_10: 'BIG 10',
      big_2: 'BIG 2',
      jack_sweep: 'Jack Sweep',
      jack_burn: 'Jack Burn',
      burn_call: 'Burn Called',
      last_pickup: 'Last Pickup',
    })[type] || String(type || 'Event').replace(/_/g, ' ');
  }

  function matchMarkup(match, profile) {
    const team = match.team === 'B' ? 'B' : 'A';
    const scoreFor = team === 'A' ? num(match.scoreA) : num(match.scoreB);
    const scoreAgainst = team === 'A' ? num(match.scoreB) : num(match.scoreA);
    const resultText = match.result === 'win' ? 'VICTORY' : match.result === 'loss' ? 'DEFEAT' : 'DRAW';
    const players = Array.isArray(match.players) ? match.players : [];
    const teammates = players.filter((p) => p.team === team && p.playerId !== profile.id).map((p) => p.username);
    const opponents = players.filter((p) => p.team !== team).map((p) => p.username);
    const profileSeat = players.find((p) => p.playerId === profile.id)?.seat;
    const ownEvents = (Array.isArray(match.events) ? match.events : []).filter((e) => e.seat == null || e.seat === profileSeat);
    const highlights = [
      match.brastas ? `${num(match.brastas)} Brasta${num(match.brastas) === 1 ? '' : 's'}` : '',
      match.jackSweeps ? `${num(match.jackSweeps)} Sweep${num(match.jackSweeps) === 1 ? '' : 's'}` : '',
      match.bigTenCaptures ? `Big 10 ×${num(match.bigTenCaptures)}` : '',
      match.bigTwoCaptures ? `Big 2 ×${num(match.bigTwoCaptures)}` : '',
      match.burnCalls ? `${num(match.burnCalls)} Burn Call${num(match.burnCalls) === 1 ? '' : 's'}` : '',
    ].filter(Boolean).join(' · ');
    const rank = match.rankBefore && match.rankAfter && match.rankBefore !== match.rankAfter
      ? `<span class="ppg-rank-change">${esc(match.rankBefore)} → ${esc(match.rankAfter)}</span>` : '';
    const eventRows = ownEvents.length
      ? ownEvents.map((e) => `<div class="ppg-event"><span>R${num(e.round)}</span><b>${esc(eventName(e.eventType))}</b>${e.points ? `<em>${e.points > 0 ? '+' : ''}${Number(e.points)}</em>` : ''}</div>`).join('')
      : '<div class="ppg-empty-mini">No major tracked events for this player.</div>';

    return `<article class="ppg-match ${esc(match.result)}">
      <button type="button" class="ppg-match-main" data-ppg-match aria-expanded="false">
        <div><strong>${resultText}</strong><span>${match.matchType === 'ranked' ? 'Ranked' : match.matchType === 'bot' ? 'Bot' : 'Private'} ${esc(String(match.mode || '').toUpperCase())} · ${esc(relativeTime(match.completedAt))}</span></div>
        <div class="ppg-score"><b>${scoreFor}</b><i>–</i><b>${scoreAgainst}</b></div>
      </button>
      <div class="ppg-match-meta">
        ${teammates.length ? `<span>with ${esc(teammates.join(', '))}</span>` : '<span>Solo</span>'}
        ${opponents.length ? `<span>vs ${esc(opponents.join(', '))}</span>` : ''}
        <span>${esc(duration(match.durationSeconds))}</span>${rank}
      </div>
      ${highlights ? `<div class="ppg-highlights">${esc(highlights)}</div>` : ''}
      <div class="ppg-match-details" hidden>
        <div class="ppg-teams">
          <div><span>Team A</span>${players.filter((p) => p.team === 'A').map((p) => `<b>${esc(p.username)}</b>`).join('')}</div>
          <div><span>Team B</span>${players.filter((p) => p.team === 'B').map((p) => `<b>${esc(p.username)}</b>`).join('')}</div>
        </div>
        <div class="ppg-event-list">${eventRows}</div>
      </div>
    </article>`;
  }

  function matchesMarkup(profile) {
    const matches = Array.isArray(profile?.progression?.matches) ? profile.progression.matches : [];
    if (!matches.length) {
      return '<div class="ppg-empty"><b>No tracked matches yet</b><span>Completed matches played after this beta update will appear here.</span></div>';
    }
    return `<div class="ppg-match-list">${matches.map((match) => matchMarkup(match, profile)).join('')}</div>`;
  }

  function achievementMarkup(achievement) {
    const progress = num(achievement.progress);
    const target = Math.max(1, num(achievement.target));
    const pct = Math.max(0, Math.min(100, Math.round((progress / target) * 100)));
    const complete = Boolean(achievement.completed);
    return `<div class="ppg-achievement ${complete ? 'complete' : ''}">
      <div class="ppg-achievement-icon">${esc(achievement.icon || '🏆')}</div>
      <div class="ppg-achievement-copy">
        <div><b>${esc(achievement.name)}</b><span>${complete ? '✓' : `${Math.min(progress, target)} / ${target}`}</span></div>
        <p>${esc(achievement.description)}</p>
        <div class="ppg-progress"><i style="width:${pct}%"></i></div>
      </div>
    </div>`;
  }

  function achievementsMarkup(profile) {
    const items = Array.isArray(profile?.progression?.achievements) ? profile.progression.achievements : [];
    if (!items.length) {
      return '<div class="ppg-empty"><b>No achievement data yet</b><span>Complete a match to begin earning achievements.</span></div>';
    }
    const unlocked = items.filter((item) => item.completed).length;
    return `<div class="ppg-achievement-summary"><b>${unlocked}</b><span>of ${items.length} unlocked</span></div><div class="ppg-achievement-list">${items.map(achievementMarkup).join('')}</div>`;
  }

  function wireTabs(modal) {
    const tabs = [...modal.querySelectorAll('[data-ppg-tab]')];
    const panels = [...modal.querySelectorAll('[data-ppg-panel]')];
    tabs.forEach((tab) => {
      tab.onclick = () => {
        const key = tab.dataset.ppgTab;
        tabs.forEach((candidate) => candidate.setAttribute('aria-selected', candidate === tab ? 'true' : 'false'));
        panels.forEach((panel) => { panel.hidden = panel.dataset.ppgPanel !== key; });
      };
    });
  }

  function wireMatchRows(modal) {
    modal.querySelectorAll('[data-ppg-match]').forEach((button) => {
      button.onclick = () => {
        const details = button.closest('.ppg-match')?.querySelector('.ppg-match-details');
        if (!details) return;
        const opening = details.hidden;
        details.hidden = !opening;
        button.setAttribute('aria-expanded', opening ? 'true' : 'false');
      };
    });
  }

  function attachShell(modal) {
    if (!(modal instanceof HTMLElement)) return false;
    if (modal.dataset.ppgShell === 'true') return true;

    const head = modal.querySelector('.player-profile-head');
    const ranks = modal.querySelector('.player-profile-ranks');
    if (!head || !ranks) return false;

    const overview = document.createElement('div');
    overview.className = 'ppg-panel';
    overview.dataset.ppgPanel = 'overview';
    ['.player-profile-ranks', '.player-profile-xp', '.player-profile-social', '.player-profile-message'].forEach((selector) => {
      const node = modal.querySelector(selector);
      if (node) overview.appendChild(node);
    });

    const tabs = document.createElement('div');
    tabs.className = 'ppg-tabs';
    tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', 'Player profile sections');
    tabs.innerHTML = `
      <button type="button" data-ppg-tab="overview" aria-selected="true">Overview</button>
      <button type="button" data-ppg-tab="stats" aria-selected="false">Stats</button>
      <button type="button" data-ppg-tab="matches" aria-selected="false">Matches</button>
      <button type="button" data-ppg-tab="achievements" aria-selected="false">Achievements</button>`;

    const stats = document.createElement('div');
    stats.className = 'ppg-panel';
    stats.dataset.ppgPanel = 'stats';
    stats.hidden = true;
    stats.innerHTML = loadingMarkup('Stats');

    const matches = document.createElement('div');
    matches.className = 'ppg-panel';
    matches.dataset.ppgPanel = 'matches';
    matches.hidden = true;
    matches.innerHTML = loadingMarkup('Match History');

    const achievements = document.createElement('div');
    achievements.className = 'ppg-panel';
    achievements.dataset.ppgPanel = 'achievements';
    achievements.hidden = true;
    achievements.innerHTML = loadingMarkup('Achievements');

    head.insertAdjacentElement('afterend', tabs);
    tabs.insertAdjacentElement('afterend', overview);
    overview.insertAdjacentElement('afterend', stats);
    stats.insertAdjacentElement('afterend', matches);
    matches.insertAdjacentElement('afterend', achievements);

    modal.dataset.ppgShell = 'true';
    modal.dataset.ppgEnhanced = 'true';
    wireTabs(modal);
    return true;
  }

  function renderProfileData(modal, profile) {
    if (!attachShell(modal)) return;
    const stats = modal.querySelector('[data-ppg-panel="stats"]');
    const matches = modal.querySelector('[data-ppg-panel="matches"]');
    const achievements = modal.querySelector('[data-ppg-panel="achievements"]');
    if (stats) stats.innerHTML = statsMarkup(profile);
    if (matches) matches.innerHTML = matchesMarkup(profile);
    if (achievements) achievements.innerHTML = achievementsMarkup(profile);
    wireMatchRows(modal);
    modal.dataset.ppgLoaded = 'true';
  }

  async function loadProgression(modal) {
    if (!attachShell(modal)) return;
    if (modal.dataset.ppgLoaded === 'true' || modal.dataset.ppgLoading === 'true') return;

    const username = String(modal.querySelector('#player-profile-title')?.textContent || '').trim();
    if (!username) return;

    modal.dataset.ppgLoading = 'true';
    try {
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
      if (!modal.isConnected) return;
      if (response.ok && data.profile) {
        renderProfileData(modal, data.profile);
      } else {
        const message = esc(data.error || 'Player data could not be loaded.');
        modal.querySelectorAll('[data-ppg-panel]:not([data-ppg-panel="overview"])').forEach((panel) => {
          panel.innerHTML = `<div class="ppg-empty"><b>Unable to load</b><span>${message}</span></div>`;
        });
      }
    } catch (error) {
      if (modal.isConnected) {
        modal.querySelectorAll('[data-ppg-panel]:not([data-ppg-panel="overview"])').forEach((panel) => {
          panel.innerHTML = '<div class="ppg-empty"><b>Unable to load</b><span>Please close and reopen the profile.</span></div>';
        });
      }
      console.warn('[brasta player progression]', error);
    } finally {
      delete modal.dataset.ppgLoading;
    }
  }

  function scan() {
    document.querySelectorAll('.player-profile-modal').forEach((modal) => {
      if (attachShell(modal)) void loadProgression(modal);
    });
  }

  const observer = new MutationObserver(scan);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('brasta-player-profile-loaded', scan);
  scan();
})();