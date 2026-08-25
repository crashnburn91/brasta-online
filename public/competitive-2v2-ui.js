(() => {
  if (window.__BRASTA_COMPETITIVE_2V2_UI__) return;
  window.__BRASTA_COMPETITIVE_2V2_UI__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SESSION_PREFIX = 'brasta-online-session:player:';
  const MARKER_PREFIX = 'brasta-ranked-2v2-room:';
  const LAST_NAME_KEY = 'brasta-online-last-name';
  const REQUEUE_KEY = 'brasta-ranked-2v2-requeue';
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
  let backendUnavailable = '';
  let appObserver = null;

  function token() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; }
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char]);
  }

  function rankClass(rank) {
    return `rank-${String(rank || 'unranked').toLowerCase().replace(/\s+/g, '-')}`;
  }

  function roomCodeFromUrl() {
    try {
      return String(new URLSearchParams(location.search).get('room') || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    } catch { return ''; }
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
      body: JSON.stringify({ action, mode: '2v2', ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(data.error || `Competitive service returned ${response.status}.`);
    return data;
  }

  function cardHost() {
    return document.querySelector('.landing.landing-wide .landing-grid');
  }

  function renderCard() {
    const card = document.querySelector('[data-competitive-2v2-card]');
    if (!card) return;
    if (!token()) {
      card.innerHTML = `
        <div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div><span class="rank-badge rank-unranked">Unranked</span></div>
        <p>Queue solo. Brasta finds three players and balances the teams by hidden skill.</p>
        <div class="competitive-actions"><button class="primary" data-ranked-2v2-signin>Sign In to Play 2v2</button><button data-ranked-2v2-leaderboard>2v2 Leaderboard</button></div>
        <div class="server-note">Your 2v2 rank is completely separate from your 1v1 rank.</div>`;
      bindCard();
      return;
    }

    if (!profile) {
      card.innerHTML = `<div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div><span class="rank-badge rank-unranked">…</span></div><p>Loading your 2v2 competitive profile…</p>`;
      return;
    }

    const rank = profile.rankName || 'Unranked';
    card.innerHTML = `
      <div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div><span class="rank-badge ${rankClass(rank)}">${esc(rank)}</span></div>
      <p>${rank === 'Unranked' ? 'Complete five team placement matches to receive your first 2v2 rank.' : 'Queue solo and climb the separate 2v2 ranked ladder.'}</p>
      <div class="competitive-statline">
        <span><small>Record</small><b>${profile.wins}–${profile.losses}</b></span>
        <span><small>${rank === 'Unranked' ? 'Placements' : 'Current streak'}</small><b>${rank === 'Unranked' ? `${Math.min(profile.placementGames, 5)}/5` : profile.currentStreak}</b></span>
        <span><small>Best streak</small><b>${profile.bestStreak}</b></span>
      </div>
      ${backendUnavailable ? `<div class="competitive-warning">${esc(backendUnavailable)}</div>` : ''}
      <div class="competitive-actions">
        <button class="primary" data-ranked-2v2-find ${backendUnavailable ? 'disabled' : ''}>${queueInfo?.state === 'queued' ? 'Searching…' : 'Find Ranked 2v2 Match'}</button>
        <button data-ranked-2v2-leaderboard>2v2 Leaderboard</button>
        <button data-ranked-2v2-history>2v2 Match History</button>
      </div>
      <div class="server-note">Teams are balanced automatically using hidden skill ratings.</div>`;
    bindCard();
  }

  function bindCard() {
    document.querySelector('[data-ranked-2v2-signin]')?.addEventListener('click', () => document.querySelector('.account-dock')?.click(), { once: true });
    document.querySelector('[data-ranked-2v2-find]')?.addEventListener('click', () => void joinQueue(), { once: true });
    document.querySelector('[data-ranked-2v2-leaderboard]')?.addEventListener('click', () => void showLeaderboard(), { once: true });
    document.querySelector('[data-ranked-2v2-history]')?.addEventListener('click', () => void showHistory(), { once: true });
  }

  function injectCard() {
    if (roomCodeFromUrl() || new URLSearchParams(location.search).get('spectate') || location.hash === '#lab') return;
    const grid = cardHost();
    if (!grid || grid.querySelector('[data-competitive-2v2-card]')) return;
    const card = document.createElement('section');
    card.className = 'landing-card competitive-card competitive-card-2v2';
    card.setAttribute('data-competitive-2v2-card', '1');
    const one = grid.querySelector('[data-competitive-card]');
    if (one) one.insertAdjacentElement('afterend', card);
    else grid.prepend(card);
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
      backendUnavailable = error.message || 'Could not load 2v2 competitive profile.';
      renderCard();
    } finally {
      profileLoading = false;
    }
  }

  async function resumeQueueIfNeeded() {
    if (!token()) return;
    try {
      const data = await api('status');
      if (data.competitive) profile = data.competitive;
      if (data.state === 'matched') return handleMatched(data.assignment);
      if (data.state === 'queued') {
        queueInfo = data;
        showQueueModal(data);
        startQueuePolling();
      }
      renderCard();
    } catch {}
  }

  async function joinQueue() {
    if (!token()) return document.querySelector('.account-dock')?.click();
    backendUnavailable = '';
    try {
      const data = await api('join');
      if (data.competitive) profile = data.competitive;
      if (data.state === 'matched') return handleMatched(data.assignment);
      queueInfo = data;
      renderCard();
      showQueueModal(data);
      startQueuePolling();
    } catch (error) {
      showMessageModal('Ranked 2v2', error.message || 'Could not enter 2v2 matchmaking.');
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
    let again = false;
    try {
      const data = await api('status');
      if (data.state === 'matched') return handleMatched(data.assignment);
      if (data.state === 'queued') {
        queueInfo = data;
        if (data.competitive) profile = data.competitive;
        showQueueModal(data);
        renderCard();
        again = true;
        return;
      }
      queueInfo = null;
      closeModal('competitive-2v2-queue-modal');
      renderCard();
    } catch (error) {
      const detail = document.querySelector('[data-queue-2v2-detail]');
      if (detail) detail.textContent = error.message || 'Reconnecting to 2v2 matchmaking…';
      again = true;
    } finally {
      queueInFlight = false;
      if (again) startQueuePolling();
    }
  }

  async function cancelQueue(callServer = true) {
    stopQueuePolling();
    if (callServer && token()) {
      try { await api('leave'); } catch {}
    }
    queueInfo = null;
    closeModal('competitive-2v2-queue-modal');
    renderCard();
  }

  function showQueueModal(data) {
    let modal = document.getElementById('competitive-2v2-queue-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'competitive-2v2-queue-modal';
      modal.className = 'competitive-modal-backdrop';
      document.body.appendChild(modal);
    }
    const rank = data?.competitive?.rankName || profile?.rankName || 'Unranked';
    const seconds = Number(data?.waitSeconds || 0);
    modal.innerHTML = `<section class="competitive-modal queue-modal" role="dialog" aria-modal="true">
      <div class="queue-pulse"><i></i><i></i><i></i></div>
      <div class="eyebrow">RANKED 2v2</div>
      <h2>Finding a team match…</h2>
      <span class="rank-badge ${rankClass(rank)}">${esc(rank)}</span>
      <p data-queue-2v2-detail>${seconds < 12 ? 'Looking for three players near your skill level.' : seconds < 32 ? 'Expanding the four-player search.' : 'Searching a wider range for a balanced match.'}</p>
      <div class="queue-time">${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</div>
      <button data-ranked-2v2-cancel>Cancel Search</button>
    </section>`;
    modal.querySelector('[data-ranked-2v2-cancel]').onclick = () => void cancelQueue(true);
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
      localStorage.setItem(MARKER_PREFIX + code, JSON.stringify({ ...assignment, mode: '2v2', createdAt: Date.now() }));
    } catch {}
    closeModal('competitive-2v2-queue-modal');
    location.assign(`${location.pathname}?room=${encodeURIComponent(code)}`);
  }

  function closeModal(id) {
    document.getElementById(id)?.remove();
  }

  function showMessageModal(title, text) {
    closeModal('competitive-2v2-message-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-2v2-message-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">BRASTA</div><h2>${esc(title)}</h2><p>${esc(text)}</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => modal.remove();
    document.body.appendChild(modal);
  }

  async function showLeaderboard() {
    closeModal('competitive-2v2-list-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-2v2-list-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal competitive-list-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 2v2</div><h2>2v2 Leaderboard</h2><p>Loading ranked players…</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => modal.remove();
    document.body.appendChild(modal);
    try {
      const data = await api('leaderboard', { limit: 50 }, false);
      const rows = data.leaderboard || [];
      modal.querySelector('.competitive-list-modal').innerHTML = `<button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 2v2</div><h2>2v2 Leaderboard</h2>
        ${rows.length ? `<div class="competitive-table-wrap"><table class="competitive-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>W–L</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.leaderboardPosition}</td><td><b>${esc(row.username)}</b></td><td><span class="mini-rank ${rankClass(row.rankName)}">${esc(row.rankName)}</span></td><td>${row.wins}–${row.losses}</td></tr>`).join('')}</tbody></table></div>` : '<div class="competitive-empty">No players have completed 2v2 placements yet.</div>'}`;
      modal.querySelector('.competitive-close').onclick = () => modal.remove();
    } catch (error) {
      modal.querySelector('p').textContent = error.message || 'Could not load 2v2 leaderboard.';
    }
  }

  async function showHistory() {
    if (!token()) return document.querySelector('.account-dock')?.click();
    closeModal('competitive-2v2-history-modal');
    const modal = document.createElement('div');
    modal.id = 'competitive-2v2-history-modal';
    modal.className = 'competitive-modal-backdrop';
    modal.innerHTML = `<section class="competitive-modal competitive-list-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 2v2</div><h2>2v2 Match History</h2><p>Loading recent matches…</p></section>`;
    modal.querySelector('.competitive-close').onclick = () => modal.remove();
    document.body.appendChild(modal);
    try {
      const data = await api('history', { limit: 12 });
      const rows = data.matches || [];
      modal.querySelector('.competitive-list-modal').innerHTML = `<button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 2v2</div><h2>2v2 Match History</h2>
        ${rows.length ? `<div class="match-history-list">${rows.map((row) => `<div class="history-row ${row.result === 'win' ? 'win' : 'loss'}"><strong>${row.result === 'win' ? 'WIN' : 'LOSS'}</strong><div><b>vs ${esc(row.opponentUsername)}</b><small>${row.scoreFor}–${row.scoreAgainst}${row.rankBefore !== row.rankAfter ? ` · ${esc(row.rankBefore)} → ${esc(row.rankAfter)}` : ''}</small></div></div>`).join('')}</div>` : '<div class="competitive-empty">No ranked 2v2 matches yet.</div>'}`;
      modal.querySelector('.competitive-close').onclick = () => modal.remove();
    } catch (error) {
      modal.querySelector('p').textContent = error.message || 'Could not load 2v2 match history.';
    }
  }

  function applyRankedDecor() {
    const code = roomCodeFromUrl();
    const active = Boolean(code && marker(code));
    if (!active) return;
    document.body.classList.add('brasta-ranked-active');
    const roomPill = document.querySelector('.topbar .room-pill');
    let badge = document.querySelector('.ranked-pill');
    if (roomPill && !badge) {
      badge = document.createElement('span');
      badge.className = 'pill ranked-pill';
      roomPill.insertAdjacentElement('afterend', badge);
    }
    if (badge) badge.textContent = 'RANKED 2v2';
    document.querySelectorAll('.lobby-hero .eyebrow').forEach((node) => { node.textContent = 'RANKED TEAM MATCH'; });
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
      monitorState = data.state || 'playing';
      applyRankedDecor();
      if (data.state === 'waiting') {
        showRankedWaiting(data.message || 'Waiting for all four players to connect.');
        nextDelay = MONITOR_WAIT_MS;
      } else {
        removeRankedWaiting();
      }
      if (data.state === 'roundEnd') {
        nextDelay = Math.max(250, Number(data.advanceInMs || 0) + 80);
      } else if (data.state === 'finalizing') {
        nextDelay = MONITOR_FINALIZE_MS;
      } else if (data.state === 'completed' && data.result) {
        monitorState = 'completed';
        showRankedResult(code, data.result);
      } else if (data.state === 'playing') {
        nextDelay = null;
      }
    } catch (error) {
      console.warn('[Brasta ranked 2v2 monitor]', error.message || error);
      monitorState = 'error';
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
      ${placementsDoneNow ? '<div class="eyebrow">2v2 PLACEMENTS COMPLETE</div>' : '<div class="eyebrow">RANKED 2v2</div>'}
      <span class="rank-badge result-rank ${rankClass(rank)}">${esc(rank)}</span>
      <p>${rank === 'Unranked' ? `Placement ${Math.min(result.placementGamesAfter, 5)} / 5 complete.` : `${result.winsAfter} wins · ${result.lossesAfter} losses`}</p>
      ${result.rankBefore !== result.rankAfter && result.rankBefore !== 'Unranked' ? `<div class="rank-change">${esc(result.rankBefore)} → <b>${esc(result.rankAfter)}</b></div>` : ''}
      <div class="competitive-actions result-actions"><button class="primary" data-ranked-2v2-again>Play Again</button><button data-ranked-2v2-home>Return Home</button><button data-result-2v2-leaderboard>Leaderboard</button></div>
    </section>`;
    modal.querySelector('[data-ranked-2v2-again]').onclick = () => leaveCompletedRanked(code, true);
    modal.querySelector('[data-ranked-2v2-home]').onclick = () => leaveCompletedRanked(code, false);
    modal.querySelector('[data-result-2v2-leaderboard]').onclick = () => { modal.remove(); void showLeaderboard(); };
    document.body.appendChild(modal);
    window.dispatchEvent(new CustomEvent('brasta-competitive-updated'));
  }

  function leaveCompletedRanked(code, requeue) {
    try {
      localStorage.removeItem(MARKER_PREFIX + code);
      localStorage.removeItem(SESSION_PREFIX + code);
      if (requeue) sessionStorage.setItem(REQUEUE_KEY, '1');
    } catch {}
    location.assign(location.pathname);
  }

  function maybeRequeue() {
    if (!token() || roomCodeFromUrl()) return;
    try {
      if (sessionStorage.getItem(REQUEUE_KEY) !== '1') return;
      sessionStorage.removeItem(REQUEUE_KEY);
    } catch { return; }
    window.setTimeout(() => void joinQueue(), 200);
  }

  function onAppMutation() {
    injectCard();
    applyRankedDecor();
    const code = roomCodeFromUrl();
    if (code && marker(code) && document.querySelector('.round-end')) startRankedMonitor(true);
  }

  function attachObserver() {
    const app = document.getElementById('app');
    if (!app || appObserver) return;
    appObserver = new MutationObserver(onAppMutation);
    appObserver.observe(app, { childList: true });
  }

  function boot() {
    attachObserver();
    injectCard();
    startRankedMonitor(true);
    maybeRequeue();
  }

  window.addEventListener('brasta-auth-changed', (event) => {
    if (event?.detail?.signedIn) {
      profile = null;
      backendUnavailable = '';
      void loadProfile();
      maybeRequeue();
    } else {
      profile = null;
      queueInfo = null;
      backendUnavailable = '';
      stopQueuePolling();
      closeModal('competitive-2v2-queue-modal');
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