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
  let partyInfo = null;
  let partyTimer = null;
  let partyInFlight = false;
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

  function rankBadge(rank, options = {}) {
    if (window.BrastaRankBadge?.render) return window.BrastaRankBadge.render(rank, options);
    const extra = options.className ? ` ${esc(options.className)}` : '';
    const label = options.label == null ? String(rank || 'Unranked') : String(options.label);
    return `<span class="rank-badge ${rankClass(rank)}${extra}">${esc(label)}</span>`;
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
        <div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div>${rankBadge('Unranked')}</div>
        <p>Queue solo or bring a partner. Brasta fills the remaining seats and balances the match by hidden skill.</p>
        <div class="competitive-actions"><button class="primary" data-ranked-2v2-signin>Sign In to Play 2v2</button><button data-ranked-2v2-leaderboard>2v2 Leaderboard</button></div>
        <div class="server-note">Your 2v2 rank is completely separate from your 1v1 rank.</div>`;
      bindCard();
      return;
    }

    if (!profile) {
      card.innerHTML = `<div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div>${rankBadge('Unranked', { label: '…' })}</div><p>Loading your 2v2 competitive profile…</p>`;
      return;
    }

    const rank = profile.rankName || 'Unranked';
    const partner = partyInfo?.members?.find((member) => !member.you) || null;
    const queued = queueInfo?.state === 'queued';
    card.innerHTML = `
      <div class="competitive-title-row"><div><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2></div>${rankBadge(rank)}</div>
      <p>${rank === 'Unranked' ? 'Complete five team placement matches to receive your first 2v2 rank.' : 'Queue solo or bring a partner and climb the separate 2v2 ranked ladder.'}</p>
      <div class="competitive-statline">
        <span><small>Record</small><b>${profile.wins}–${profile.losses}</b></span>
        <span><small>${rank === 'Unranked' ? 'Placements' : 'Current streak'}</small><b>${rank === 'Unranked' ? `${Math.min(profile.placementGames, 5)}/5` : profile.currentStreak}</b></span>
        <span><small>Best streak</small><b>${profile.bestStreak}</b></span>
      </div>
      ${backendUnavailable ? `<div class="competitive-warning">${esc(backendUnavailable)}</div>` : ''}
      <div class="competitive-actions">
        <button class="primary" data-ranked-2v2-solo ${backendUnavailable || queued ? 'disabled' : ''}>${queued && queueInfo?.queueType === 'solo' ? 'Searching…' : 'Solo Queue'}</button>
        <button data-ranked-2v2-party ${backendUnavailable || queued ? 'disabled' : ''}>${partner ? `Duo · ${esc(partner.username)}` : 'Queue with Partner'}</button>
        <button data-ranked-2v2-leaderboard>2v2 Leaderboard</button>
        <button data-ranked-2v2-history>2v2 Match History</button>
      </div>
      <div class="server-note">${partner ? `Duo ready with ${esc(partner.username)}. Matchmaking uses both players’ 2v2 ratings.` : 'Solo players can be matched with another solo teammate. Duos are always kept on the same team.'}</div>`;
    bindCard();
  }

  function bindCard() {
    document.querySelector('[data-ranked-2v2-signin]')?.addEventListener('click', () => document.querySelector('.account-dock')?.click(), { once: true });
    document.querySelector('[data-ranked-2v2-solo]')?.addEventListener('click', () => void joinQueue('solo'), { once: true });
    document.querySelector('[data-ranked-2v2-party]')?.addEventListener('click', () => void openPartnerModal(), { once: true });
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
      partyInfo = data.party || null;
      if (data.state === 'matched') return handleMatched(data.assignment);
      if (data.state === 'queued') {
        queueInfo = data;
        showQueueModal(data);
        startQueuePolling();
      }
      renderCard();
    } catch {}
  }

  async function joinQueue(queueAs = 'solo') {
    if (!token()) return document.querySelector('.account-dock')?.click();
    backendUnavailable = '';
    try {
      const data = await api('join', { queueAs });
      if (data.competitive) profile = data.competitive;
      partyInfo = data.party || null;
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
      partyInfo = data.party || null;
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
      try {
        const data = await api('leave');
        partyInfo = data.party || null;
      } catch {}
    }
    queueInfo = null;
    closeModal('competitive-2v2-queue-modal');
    renderCard();
  }

  function partnerFromParty(party = partyInfo) {
    return party?.members?.find((member) => !member.you) || null;
  }

  function stopPartyPolling() {
    if (partyTimer) window.clearTimeout(partyTimer);
    partyTimer = null;
  }

  function startPartyPolling(delay = 1400) {
    if (partyTimer || partyInFlight || !document.getElementById('competitive-2v2-party-modal')) return;
    partyTimer = window.setTimeout(() => {
      partyTimer = null;
      void pollParty();
    }, delay);
  }

  async function pollParty() {
    if (partyInFlight || !token() || !document.getElementById('competitive-2v2-party-modal')) return;
    partyInFlight = true;
    try {
      const data = await api('party-status');
      partyInfo = data.party || null;
      if (data.competitive) profile = data.competitive;
      renderPartnerModal();
      renderCard();
    } catch (error) {
      const status = document.querySelector('[data-duo-status]');
      if (status) status.textContent = error.message || 'Could not refresh your duo.';
    } finally {
      partyInFlight = false;
      startPartyPolling();
    }
  }

  async function openPartnerModal() {
    if (!token()) return document.querySelector('.account-dock')?.click();
    stopPartyPolling();
    let modal = document.getElementById('competitive-2v2-party-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'competitive-2v2-party-modal';
      modal.className = 'competitive-modal-backdrop';
      document.body.appendChild(modal);
    }
    modal.innerHTML = '<section class="competitive-modal duo-modal" role="dialog" aria-modal="true"><button class="competitive-close" aria-label="Close">×</button><div class="eyebrow">RANKED 2v2</div><h2>Queue with Partner</h2><p data-duo-status>Loading your duo…</p></section>';
    modal.querySelector('.competitive-close').onclick = () => {
      stopPartyPolling();
      modal.remove();
    };
    try {
      const data = await api('party-status');
      partyInfo = data.party || null;
      if (data.competitive) profile = data.competitive;
      renderPartnerModal();
      renderCard();
      startPartyPolling();
    } catch (error) {
      const status = modal.querySelector('[data-duo-status]');
      if (status) status.textContent = error.message || 'Could not load your duo.';
    }
  }

  function renderPartnerModal() {
    const modal = document.getElementById('competitive-2v2-party-modal');
    if (!modal) return;
    const party = partyInfo;
    const partner = partnerFromParty(party);

    if (!party) {
      modal.innerHTML = `<section class="competitive-modal duo-modal" role="dialog" aria-modal="true">
        <button class="competitive-close" aria-label="Close">×</button>
        <div class="eyebrow">RANKED 2v2</div>
        <h2>Queue with Partner</h2>
        <p>Create a duo and send the code to your partner, or enter the code they sent you.</p>
        <div class="duo-actions"><button class="primary" data-duo-create>Create Duo</button></div>
        <div class="duo-divider"><span>or join a duo</span></div>
        <div class="duo-code-entry"><input data-duo-code-input maxlength="5" autocomplete="off" autocapitalize="characters" placeholder="DUO CODE" aria-label="Duo code"><button data-duo-join>Join</button></div>
        <div class="duo-footnote">Both players keep their own 2v2 rating. Your ratings are combined for matchmaking.</div>
      </section>`;
      modal.querySelector('.competitive-close').onclick = () => { stopPartyPolling(); modal.remove(); };
      modal.querySelector('[data-duo-create]').onclick = () => void createDuo();
      modal.querySelector('[data-duo-join]').onclick = () => {
        const input = modal.querySelector('[data-duo-code-input]');
        void joinDuo(input?.value || '');
      };
      modal.querySelector('[data-duo-code-input]')?.addEventListener('input', (event) => {
        event.target.value = String(event.target.value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      });
      return;
    }

    const memberRows = (party.members || []).map((member) =>
      `<div class="duo-member ${member.you ? 'you' : ''}"><span><b>${esc(member.username)}</b><small>${member.you ? 'You' : 'Partner'}</small></span>${rankBadge(member.rankName || 'Unranked', { size: 'small', className: 'mini-rank' })}</div>`
    ).join('');

    modal.innerHTML = `<section class="competitive-modal duo-modal" role="dialog" aria-modal="true">
      <button class="competitive-close" aria-label="Close">×</button>
      <div class="eyebrow">RANKED 2v2 DUO</div>
      <h2>${party.full ? 'Duo Ready' : 'Invite Your Partner'}</h2>
      <div class="duo-code-box"><small>DUO CODE</small><strong>${esc(party.code)}</strong><button data-duo-copy>Copy</button></div>
      <div class="duo-members">${memberRows}${party.full ? '' : '<div class="duo-member waiting"><span><b>Waiting for partner…</b><small>Share the code above</small></span></div>'}</div>
      <p data-duo-status>${party.full ? `You and ${esc(partner?.username || 'your partner')} will always be placed on the same team.` : 'Your partner can enter this code from Ranked 2v2 on their account.'}</p>
      <div class="competitive-actions duo-actions">
        ${party.full ? '<button class="primary" data-duo-queue>Queue Together</button>' : ''}
        <button data-duo-leave>${party.full ? 'Leave Duo' : 'Cancel Duo'}</button>
      </div>
    </section>`;
    modal.querySelector('.competitive-close').onclick = () => { stopPartyPolling(); modal.remove(); };
    modal.querySelector('[data-duo-copy]').onclick = async () => {
      try {
        await navigator.clipboard.writeText(party.code);
        modal.querySelector('[data-duo-copy]').textContent = 'Copied';
      } catch {
        const status = modal.querySelector('[data-duo-status]');
        if (status) status.textContent = `Duo code: ${party.code}`;
      }
    };
    modal.querySelector('[data-duo-leave]').onclick = () => void leaveDuo();
    modal.querySelector('[data-duo-queue]')?.addEventListener('click', () => {
      stopPartyPolling();
      modal.remove();
      void joinQueue('duo');
    });
  }

  async function createDuo() {
    try {
      const data = await api('party-create');
      partyInfo = data.party || null;
      renderPartnerModal();
      renderCard();
      startPartyPolling(500);
    } catch (error) {
      showMessageModal('Ranked 2v2 Duo', error.message || 'Could not create a duo.');
    }
  }

  async function joinDuo(code) {
    const normalized = String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
    if (!normalized) return;
    try {
      const data = await api('party-join', { partyCode: normalized });
      partyInfo = data.party || null;
      renderPartnerModal();
      renderCard();
      startPartyPolling(500);
    } catch (error) {
      const status = document.querySelector('[data-duo-status]');
      if (status) status.textContent = error.message || 'Could not join that duo.';
      else showMessageModal('Ranked 2v2 Duo', error.message || 'Could not join that duo.');
    }
  }

  async function leaveDuo() {
    try {
      const data = await api('party-leave');
      partyInfo = data.party || null;
      queueInfo = null;
      renderPartnerModal();
      renderCard();
    } catch (error) {
      showMessageModal('Ranked 2v2 Duo', error.message || 'Could not leave the duo.');
    }
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
      ${rankBadge(rank)}
      <p data-queue-2v2-detail>${data?.queueType === 'duo'
        ? `Queued with ${esc(data.partnerName || 'your partner')}. ${seconds < 20 ? 'Looking for another duo or two solo opponents.' : 'Expanding the search for a balanced opposing team.'}`
        : seconds < 12 ? 'Looking for a teammate and two opponents near your skill level.' : seconds < 32 ? 'Expanding the four-player search.' : 'Searching a wider range for a balanced match.'}</p>
      <div class="queue-time">${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}</div>
      <button data-ranked-2v2-cancel>Cancel Search</button>
    </section>`;
    modal.querySelector('[data-ranked-2v2-cancel]').onclick = () => void cancelQueue(true);
  }

  function handleMatched(assignment) {
    if (!assignment?.roomCode || !assignment?.token || !assignment?.seat) return;
    stopQueuePolling();
    stopPartyPolling();
    queueInfo = null;
    partyInfo = null;
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
        ${rows.length ? `<div class="competitive-table-wrap"><table class="competitive-table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th>W–L</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.leaderboardPosition}</td><td><b>${esc(row.username)}</b></td><td>${rankBadge(row.rankName, { size: 'small', className: 'mini-rank' })}</td><td>${row.wins}–${row.losses}</td></tr>`).join('')}</tbody></table></div>` : '<div class="competitive-empty">No players have completed 2v2 placements yet.</div>'}`;
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
      ${rankBadge(rank, { size: 'large', className: 'result-rank' })}
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
      partyInfo = null;
      backendUnavailable = '';
      stopQueuePolling();
      stopPartyPolling();
      closeModal('competitive-2v2-queue-modal');
      closeModal('competitive-2v2-party-modal');
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