(() => {
  'use strict';

  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket || window.__BRASTA_LIVE_SCORE_INSTALLED__) return;
  window.__BRASTA_LIVE_SCORE_INSTALLED__ = true;

  let latestState = null;
  let renderQueued = false;
  let appObserver = null;

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => {
      renderQueued = false;
      renderScoreStrip();
    });
  }

  function securedTeamScore(state, team) {
    const ids = Array.isArray(state?.captured?.[team]) ? state.captured[team] : [];
    let aces = 0;
    let jacks = 0;
    let big2 = 0;
    let big10 = 0;

    for (const id of ids) {
      const card = state?.cards?.[id];
      if (!card) continue;
      if (card.rank === 'A') aces += 1;
      if (card.rank === 'J') jacks += 1;
      if (card.rank === '2' && card.suit === 'clubs') big2 = 10;
      if (card.rank === '10' && card.suit === 'diamonds') big10 = 10;
    }

    const brastas = Number(state?.roundStats?.brastas?.[team] || 0) * 10;
    const burnedJacks = Number(state?.roundStats?.burnedJacks?.[team] || 0) * -10;
    return aces + jacks + big2 + big10 + brastas + burnedJacks;
  }

  function roundScore(state) {
    if (!state) return null;
    if (state.roundScore && (state.phase === 'roundEnd' || state.phase === 'matchEnd')) {
      return {
        A: Number(state.roundScore.A?.total || 0),
        B: Number(state.roundScore.B?.total || 0),
      };
    }
    return {
      A: securedTeamScore(state, 'A'),
      B: securedTeamScore(state, 'B'),
    };
  }

  function renderScoreStrip() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || !latestState) return;

    const liveRound = roundScore(latestState);
    if (!liveRound) return;

    let strip = topbar.querySelector('.live-score-strip');
    if (!strip) {
      strip = document.createElement('div');
      strip.className = 'live-score-strip';
      strip.setAttribute('role', 'status');
      strip.setAttribute('aria-live', 'polite');
      const nav = topbar.querySelector('nav');
      if (nav) topbar.insertBefore(strip, nav);
      else topbar.appendChild(strip);
    }

    topbar.classList.add('live-score-enabled');
    const matchA = Number(latestState.score?.A || 0);
    const matchB = Number(latestState.score?.B || 0);
    const roundA = liveRound.A;
    const roundB = liveRound.B;
    const target = Number(latestState.targetScore || 110);

    const rankedTurnTimer = topbar.querySelector('.scoreline [data-ranked-turn-timer]');
    topbar.classList.toggle('ranked-turn-clock-visible', rankedTurnTimer instanceof HTMLElement);

    strip.innerHTML = `
      <div class="live-score-group match-score-live" title="Blue Team vs Red Team match total from completed rounds">
        <small>MATCH</small>
        <span class="live-team team-a-live" aria-label="Blue Team ${matchA}"><b>${matchA}</b></span>
        <span class="live-score-dash">–</span>
        <span class="live-team team-b-live" aria-label="Red Team ${matchB}"><b>${matchB}</b></span>
      </div>
      <span class="live-score-divider" aria-hidden="true"></span>
      <div class="live-score-group round-score-live" title="Blue Team vs Red Team secured points this round. Majority and last-pickup points are added only when the round ends.">
        <small>ROUND</small>
        <span class="live-team team-a-live" aria-label="Blue Team ${roundA}"><b>${roundA}</b></span>
        <span class="live-score-dash">–</span>
        <span class="live-team team-b-live" aria-label="Red Team ${roundB}"><b>${roundB}</b></span>
      </div>
      <span class="live-score-target">First to ${target}</span>`;

    // The core scoreline is hidden once the enhanced live-score strip is active.
    // Move the ranked turn clock into the visible strip so it remains prominent
    // on desktop and mobile without maintaining a second timer instance.
    if (rankedTurnTimer instanceof HTMLElement) {
      const targetNode = strip.querySelector('.live-score-target');
      if (targetNode) strip.insertBefore(rankedTurnTimer, targetNode);
      else strip.appendChild(rankedTurnTimer);
    }
  }

  function captureServerMessage(event) {
    try {
      const message = JSON.parse(String(event.data || ''));
      if (message?.type !== 'ROOM_STATE') return;
      latestState = message.update?.state || null;
      queueRender();
    } catch {}
  }

  function TrackingWebSocket(url, protocols) {
    const socket = protocols === undefined
      ? new NativeWebSocket(url)
      : new NativeWebSocket(url, protocols);
    socket.addEventListener('message', captureServerMessage);
    return socket;
  }

  TrackingWebSocket.prototype = NativeWebSocket.prototype;
  try { Object.setPrototypeOf(TrackingWebSocket, NativeWebSocket); } catch {}
  window.WebSocket = TrackingWebSocket;

  function bindAppObserver() {
    const app = document.getElementById('app');
    if (!app || appObserver) return;
    appObserver = new MutationObserver(queueRender);
    appObserver.observe(app, { childList: true });
    queueRender();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindAppObserver, { once: true });
  } else {
    bindAppObserver();
  }
})();
