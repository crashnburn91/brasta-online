(() => {
  if (window.__BRASTA_COMPETITIVE_UI__) return;
  window.__BRASTA_COMPETITIVE_UI__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SESSION_PREFIX = 'brasta-online-session:player:';
  const MARKER_PREFIX = 'brasta-ranked-room:';
  const LAST_NAME_KEY = 'brasta-online-last-name';
  const POLL_MS = 2000;
  const MONITOR_WAIT_MS = 1200;
  const MONITOR_RETRY_MS = 2500;
  const MONITOR_FINALIZE_MS = 700;

  let profile = null;
  let profileLoading = false;
  let queueInfo = null;
  let queueTimer = null;
  let queueInFlight = false;
  let monitorTimer = null;
  let monitorInFlight = false;
  let monitorState = 'idle';
  let leaderboardOpen = false;
  let historyOpen = false;
  let backendUnavailable = '';
  let lastMonitorError = '';
  let observerQueued = false;

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char]);
  }

  function roomCodeFromUrl() {
    const params = new URLSearchParams(location.search);
    return String(params.get('room') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function marker(code) {
    if (!code) return null;
    try {
      const raw = localStorage.getItem(MARKER_PREFIX + code);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function api(action, extra = {}, requireAuth = true) {
    const accessToken = token();
    if (requireAuth && !accessToken) throw new Error('Sign in to use ranked play.');
    const response = await fetch('/api/competitive', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Competitive service returned ${response.status}.`);
    return data;
  }

  function placementCopy(status) {
    if (!status) return '';
    return status.rankName === 'Unranked'
      ? `Placement ${Math.min(status.placementGames, 5)} / 5`
      : `${status.wins}W · ${status.losses}L${status.currentStreak ? ` · ${status.currentStreak} win streak` : ''}`;
  }

  function rankClass(rank) {
    return `rank-${String(rank || 'unranked').toLowerCase().replace(/\s+/g, '-')}`;
  }

  function rankBadge(rank, options = {}) {
    if (window.BrastaRankBadge?.render) return window.BrastaRankBadge.render(rank, options);
    const extra = options.className ? ` ${esc(options.className)}` : '';
    const label = options.label == null ? String(rank || 'Unranked') : String(options.label);
    return `<span class="rank-badge ${rankClass(rank)}${extra}">${esc(label)}</span>`;
  }

  function renderCard() {
    const card = document.querySelector('[data-competitive-card]');
    if (!card) return;
    const signedIn = Boolean(token());
    if (!signedIn) {
      card.innerHTML = `
        <div class="competitive-title-row"><div><div class="eyebrow">RANKED 1v1</div><h2>Competitive Brasta</h2></div>${rankBadge('Unranked')}</div>
        <p>Match automatically with another player and climb from Bronze through Grandmaster.</p>
        <div class="competitive-actions"><button class="primary" data-ranked-signin>Sign In to Play Ranked</button><button data-ranked-leaderboard>Leaderboard</button></div>
        <div class="server-note">Private rooms remain unranked and can still be played as a guest.</div>`;
      bindCard();
      return;
    }

    if (!profile) {
      card.innerHTML = `
        <div class="competitive-title-row"><div><div class="eyebrow">RANKED 1v1</div><h2>Competitive Brasta</h2></div>${rankBadge('Unranked', { label: '…' })}</div>
        <p>Loading your competitive profile…</p>`;
      return;
    }

    const rank = profile.rankName || 'Unranked';
    card.innerHTML = `
      <div class="competitive-title-row"><div><div class="eyebrow">RANKED 1v1</div><h2>Competitive Brasta</h2></div>${rankBadge(rank)}</div>
      <p>${rank === 'Unranked' ? 'Complete five placement matches to receive your first rank.' : 'Match against similarly skilled players and climb the ranked ladder.'}</p>
      <div class="competitive-statline">
        <span><small>Record</small><b>${profile.wins}–${profile.losses}</b></span>
        <span><small>${rank === 'Unranked' ? 'Placements' : 'Current streak'}</small><b>${rank === 'Unranked' ? `${Math.min(profile.placementGames, 5)}/5` : profile.currentStreak}</b></span>
        <span><small>Best streak</small><b>${profile.bestStreak}</b></span>
      </div>
      ${backendUnavailable ? `<div class="competitive-warning">${esc(backendUnavailable)}</div>` : ''}
      <div class="competitive-actions">
        <button class="primary" data-ranked-find ${backendUnavailable ? 'disabled' : ''}>${queueInfo?.state === 'queued' ? 'Searching…' : 'Find Ranked Match'}</button>
        <button data-ranked-leaderboard>Leaderboard</button>
        <button data-ranked-history>Match History</button>
      </div>
      <div class="server-note">Hidden skill rating is used for matchmaking. Only your rank is shown.</div>`;
    bindCard();
  }

  function bindCard() {
    const signIn = document.querySelector('[data-ranked-signin]');
    if (signIn) signIn.onclick = () => document.querySelector('.account-dock')?.click();
    const find = document.querySelector('[data-ranked-find]');
    if (find) find.onclick = () => void joinQueue();
    const board = document.querySelector('[data-ranked-leaderboard]');
    if (board) board.onclick = () => void showLeaderboard();
    const history = document.querySelector('[data-ranked-history]');
    if (history) history.onclick = () => void showHistory();
  }

  function injectCard() {
    const params = new URLSearchParams(location.search);
    if (params.get('room') || params.get('spectate') || location.hash === '#lab') return;
    const grid = document.querySelector('.landing.landing-wide .landing-grid');
    if (!grid || grid.querySelector('[data-competitive-card]')) return;
    const card = document.createElement('section');
    card.className = 'landing-card competitive-card';
    card.dataset.competitiveCard = '1';
    grid.prepend(card);
    renderCard();
    if (token() && !profile && !profileLoading) void loadProfile();
  }

  async function loadProfile() {
    if (!token() || profileLoading) return;
    profileLoading = true;
    try {
      const data = await api('profile');
      profile = data.competitive || null;
      backendUnavailable = '';
      renderCard();
      void resumeQueueIfNeeded();
    } catch (error) {
      profile = null;
      backendUnavailable = error.message || 'Could not load competitive profile.';
      renderCard();
    } finally {
      profileLoading = false;
    }
  }

  async function resumeQueueIfNeeded() {
    if (!token()) return;
    try {
      const data = await api('status');
      if (data.state === 'unavailable') {
        backendUnavailable = data.message || 'Ranked matchmaking is temporarily unavailable.';
        renderCard();
        return;
      }
      backendUnavailable = '';
      if (data.competitive) profile = data.competitive;
      if (data.state === 'matched') return handleMatched(data.assignment);
      if (data.state === 'queued') {
        queueInfo = data;
        showQueueModal(data);
        startQueuePolling();
      }
      renderCard();
    } catch (error) {
      const message = String(error?.message || '');
      if (/backend secret|not configured|requires the production Redis/i.test(message)) {
        backendUnavailable = message;
        renderCard();
      }
    }
  }

  async function joinQueue() {
    if (!token()) return document.querySelector('.account-dock')?.click();
    backendUnavailable = '';
    try {
      const data = await api('join');
      if (data.state === 'unavailable') {
        backendUnavailable = data.message || 'Ranked matchmaking is temporarily unavailable.';
        renderCard();
        return;
      }
      if (data.competitive) profile = data.competitive;
      if (data.state === 'matched') return handleMatched(data.assignment);
      queueInfo = data;
      renderCard();
      showQueueModal(data);
      startQueuePolling();
    } catch (error) {
      showMessageModal('Ranked Matchmaking', error.message || 'Could not enter matchmaking.');
    }
  }

  function startQueuePolling(delay = POLL_MS) {
    if (queueTimer || queueInFlight) return;
    queueTimer = window.setTimeout(() => {
      queueTimer = null;
      void pollQueue();
    }, delay);
  }

  function stopQueuePolling() {
    if (queueTimer) window.clearTimeout(queueTimer);
    queueTimer = null;
  }

  async function pollQueue() {
    if (queueInFlight) return;
    if (!token()) return cancelQueue(false);
    queueInFlight = true;
    let shouldContinue = false;
    try {
      const data = await api('status');
      if (data.state === 'matched') {
        handleMatched(data.assignment);
        return;
      }
      if (data.state === 'queued') {
        queueInfo = data;
        if (data.competitive) profile = data.competitive;
        showQueueModal(data);
        renderCard();
        shouldContinue = true;
        return;
      }
      if (data.state === 'unavailable') {
        backendUnavailable = data.message || 'Ranked matchmaking is unavailable.';
      }
      queueInfo = null;
      closeModal('competitive-queue-modal');
      renderCard();
    } catch (error) {
      document.querySelector('[data-queue-detail]')?.replaceChildren(document.createTextNode(error.message || 'Reconnecting to matchmaking…'));
      shouldContinue = true;
    } finally {
      queueInFlight = false;
      if (shouldContinue) startQueuePolling();
    }
  }

  async function cancelQueue(callServer = true) {
    stopQueuePolling();
    if (callServer && token()) {
      try { await api('leave'); } catch {}
    }
    queueInfo = null;
    closeModal('competitive-queue-modal');
    renderCard();
  }

  function showQueueModal(data) {
    let modal = document.getElementById('competitive-queue-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'competitive-queue-modal';
      modal.className = 'competitive-modal-backdrop';
      document.body.appendChild(modal);
    }
    const rank = data?.competitive?.rankName || profile?.rankName || 'Unranked';
    const seconds = Number(data?.waitSeconds || 0);
    modal.innerHTML = `<section class="competitive-modal queue-modal" role="dialog" aria-modal="true">
      <div class="queue-pulse"><i></i><i></i><i></i></div>
      <div class="eyebrow">RANKED 1v1</div>
      <h2>Finding an opponent…</h2>
      ${rankBadge(rank)}
      <p data-queue-detail>${seconds < 12 ? 'Searching close to your skill level.' : seconds < 32 ? 'Expanding the matchmaking search.' : 'Searching a wider range for the best available opponent.'}</p>
      <div class="queue-time">${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</div>
      <button data-ranked-cancel>Cancel Search</button>
    </section>`;
    modal.querySelector('[data-ranked-cancel]').onclick = () => void cancelQueue(true);
  }

  function handleMatched(assignment) {
    if (!assignment?.roomCode || !assignment?.token || !assignment?.seat) return;
    stopQueuePolling();
    queueInfo = null;
    const code = String(assignment.roomCode).toUpperCase();
    const session = {
      code,
      seat: Number(assignment.seat),
      token: assignment.token,
      name: assignment.name,
      isHost: false,
      role: 'player',
    };
    try {
      localStorage.setItem(SESSION_PREFIX + code, JSON.stringify(session));
      localStorage.setItem(LAST_NAME_KEY, assignment.name || 'Player');
      localStorage.setItem(MARKER_PREFIX + code, JSON.stringify({
        ...assignment,
        createdAt: Date.now(),
      }));
    } catch {}
    closeModal('competitive-queue-modal');
    location.assign(`${location.pathname}?room=${encodeURIComponent(code)}`);
  }

  function closeModal(id) {
    document.getElementById(id)?.remove();
  }

  function showMessageModal(title, text) {
    closeModal('competitive-message-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-message-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">BRASTA</div><h2>${esc(title)}</h2><p>${esc(text)}</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => modal.remove();
    document.body.appendChild(modal);
  }

  async function showLeaderboard() {
    if (leaderboardOpen) return;
    leaderboardOpen = true;
    closeModal('competitive-list-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-list-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal competitive-list-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 1v1</div><h2>Leaderboard</h2><p>Loading ranked players…</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => { modal.remove(); leaderboardOpen = false; };
    document.body.appendChild(modal);
    try {
      const data = await api('leaderboard', { limit: 50 }, false);
      const rows = data.leaderboard || [];
      modal.querySelector('.competitive-list-modal').innerHTML = `<button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 1v1</div><h2>Leaderboard</h2>
        ${rows.length ? `<div class="competitive-table-wrap"><table class="competitive-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>W–L</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.leaderboardPosition}</td><td><b>${esc(row.username)}</b></td><td>${rankBadge(row.rankName, { size: 'small', className: 'mini-rank' })}</td><td>${row.wins}–${row.losses}</td></tr>`).join('')}</tbody></table></div>` : '<div class="competitive-empty">No players have completed placements yet.</div>'}`;
      modal.querySelector('.competitive-close').onclick = () => { modal.remove(); leaderboardOpen = false; };
    } catch (error) {
      modal.querySelector('p').textContent = error.message || 'Could not load leaderboard.';
    }
  }

  async function showHistory() {
    if (historyOpen) return;
    if (!token()) return document.querySelector('.account-dock')?.click();
    historyOpen = true;
    closeModal('competitive-history-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-history-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal competitive-list-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 1v1</div><h2>Match History</h2><p>Loading recent matches…</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => { modal.remove(); historyOpen = false; };
    document.body.appendChild(modal);
    try {
      const data = await api('history', { limit: 12 });
      const rows = data.matches || [];
      modal.querySelector('.competitive-list-modal').innerHTML = `<button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 1v1</div><h2>Match History</h2>
        ${rows.length ? `<div class="match-history-list">${rows.map((row) => `<div class="history-row ${row.result === 'win' ? 'win' : 'loss'}"><strong>${row.result === 'win' ? 'WIN' : 'LOSS'}</strong><div><b>vs ${esc(row.opponentUsername)}</b><small>${row.scoreFor}–${row.scoreAgainst}${row.rankBefore !== row.rankAfter ? ` · ${esc(row.rankBefore)} → ${esc(row.rankAfter)}` : ''}</small></div></div>`).join('')}</div>` : '<div class="competitive-empty">No ranked matches yet.</div>'}`;
      modal.querySelector('.competitive-close').onclick = () => { modal.remove(); historyOpen = false; };
    } catch (error) {
      modal.querySelector('p').textContent = error.message || 'Could not load match history.';
    }
  }

  function applyRankedDecor() {
    const code = roomCodeFromUrl();
    const activeMarker = marker(code);
    const active = Boolean(code && activeMarker);
    document.body.classList.toggle('brasta-ranked-active', active);
    if (!active) return;

    const roomPill = document.querySelector('.topbar .room-pill');
    if (roomPill && !document.querySelector('.ranked-pill')) {
      const badge = document.createElement('span');
      badge.className = 'pill ranked-pill';
      badge.textContent = 'RANKED 1v1';
      roomPill.insertAdjacentElement('afterend', badge);
    }
    document.querySelectorAll('.lobby-hero .eyebrow').forEach((node) => { node.textContent = 'RANKED MATCH'; });
  }

  function scheduleRankedMonitor(code, delay) {
    if (!code || monitorTimer || monitorInFlight) return;
    monitorTimer = window.setTimeout(() => {
      monitorTimer = null;
      void monitorRanked(code);
    }, Math.max(0, delay));
  }

  function startRankedMonitor(force = false) {
    const code = roomCodeFromUrl();
    if (!code || !marker(code) || !token()) return;
    applyRankedDecor();
    if (monitorTimer || monitorInFlight) return;

    const phaseNeedsMonitor = Boolean(document.querySelector('.round-end'));
    if (!force && monitorState === 'playing' && !phaseNeedsMonitor) return;
    scheduleRankedMonitor(code, 0);
  }

  async function monitorRanked(code) {
    if (monitorInFlight) return;
    monitorInFlight = true;
    let nextDelay = null;
    try {
      const data = await api('monitor', { roomCode: code });
      lastMonitorError = '';
      monitorState = data.state || 'playing';
      applyRankedDecor();

      if (data.state === 'waiting') {
        showRankedWaiting(data.message || 'Waiting for your opponent to connect.');
        nextDelay = MONITOR_WAIT_MS;
      } else {
        removeRankedWaiting();
      }

      if (data.state === 'roundEnd') {
        const remaining = Number(data.advanceInMs || 0);
        nextDelay = Math.max(250, remaining + 80);
      } else if (data.state === 'finalizing') {
        nextDelay = MONITOR_FINALIZE_MS;
      } else if (data.state === 'completed' && data.result) {
        monitorState = 'completed';
        if (monitorTimer) window.clearTimeout(monitorTimer);
        monitorTimer = null;
        showRankedResult(code, data.result);
      } else if (data.state === 'playing') {
        // Normal gameplay is already live over WebSocket. Do not poll the
        // competitive API until the DOM reaches roundEnd/matchEnd again.
        nextDelay = null;
      }
    } catch (error) {
      lastMonitorError = error.message || 'Ranked match monitor interrupted.';
      monitorState = 'error';
      console.warn('[Brasta ranked monitor]', lastMonitorError);
      nextDelay = MONITOR_RETRY_MS;
    } finally {
      monitorInFlight = false;
      if (nextDelay != null && monitorState !== 'completed') scheduleRankedMonitor(code, nextDelay);
    }
  }

  function showRankedWaiting(message) {
    let note = document.querySelector('.ranked-wait-note');
    const host = document.querySelector('.lobby-controls') || document.querySelector('main');
    if (!host) return;
    if (!note) {
      note = document.createElement('div');
      note.className = 'ranked-wait-note';
      host.prepend(note);
    }
    note.textContent = message;
  }

  function removeRankedWaiting() {
    document.querySelector('.ranked-wait-note')?.remove();
  }

  function showRankedResult(code, result) {
    if (document.getElementById('competitive-result-modal')) return;
    const rank = result.rankAfter || 'Unranked';
    const placementsDoneNow = result.rankBefore === 'Unranked' && rank !== 'Unranked' && result.gamesPlayedAfter >= 5;
    const modal = document.createElement('div');
    modal.id = 'competitive-result-modal';
    modal.className = 'competitive-modal-backdrop result-backdrop';
    modal.innerHTML = `<section class="competitive-modal result-modal" role="dialog" aria-modal="true">
      <div class="result-word ${result.won ? 'win' : 'loss'}">${result.won ? 'VICTORY' : 'DEFEAT'}</div>
      ${placementsDoneNow ? '<div class="eyebrow">PLACEMENTS COMPLETE</div>' : '<div class="eyebrow">RANKED 1v1</div>'}
      ${rankBadge(rank, { size: 'large', className: 'result-rank' })}
      <p>${rank === 'Unranked' ? `Placement ${Math.min(result.placementGamesAfter, 5)} / 5 complete.` : `${result.winsAfter} wins · ${result.lossesAfter} losses`}</p>
      ${result.rankBefore !== result.rankAfter && result.rankBefore !== 'Unranked' ? `<div class="rank-change">${esc(result.rankBefore)} → <b>${esc(result.rankAfter)}</b></div>` : ''}
      <div class="competitive-actions result-actions"><button class="primary" data-ranked-home>Return Home</button><button data-result-leaderboard>Leaderboard</button></div>
    </section>`;
    modal.querySelector('[data-ranked-home]').onclick = () => leaveCompletedRanked(code);
    modal.querySelector('[data-result-leaderboard]').onclick = () => { modal.remove(); void showLeaderboard(); };
    document.body.appendChild(modal);
    window.dispatchEvent(new CustomEvent('brasta-competitive-updated'));
  }

  function leaveCompletedRanked(code) {
    try {
      localStorage.removeItem(MARKER_PREFIX + code);
      localStorage.removeItem(SESSION_PREFIX + code);
    } catch {}
    location.assign(location.pathname);
  }

  const observer = new MutationObserver(() => {
    if (observerQueued) return;
    observerQueued = true;
    requestAnimationFrame(() => {
      observerQueued = false;
      injectCard();
      applyRankedDecor();
      const code = roomCodeFromUrl();
      if (code && marker(code) && document.querySelector('.round-end')) startRankedMonitor(true);
    });
  });

  function boot() {
    observer.observe(document.documentElement, { childList: true, subtree: true });
    injectCard();
    startRankedMonitor(true);
  }

  window.addEventListener('brasta-auth-changed', (event) => {
    if (event?.detail?.signedIn) {
      profile = null;
      backendUnavailable = '';
      void loadProfile();
    } else {
      profile = null;
      queueInfo = null;
      backendUnavailable = '';
      stopQueuePolling();
      closeModal('competitive-queue-modal');
      renderCard();
    }
  });
  window.addEventListener('brasta-competitive-updated', () => {
    profile = null;
    void loadProfile();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
