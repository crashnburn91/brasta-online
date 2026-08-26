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

  function scoreProjection(state) {
    if (!state) return null;
    if (state.roundScore && (state.phase === 'roundEnd' || state.phase === 'matchEnd')) return state.roundScore;
    try {
      const engine = window.Brasta;
      if (engine && typeof engine.calculateRoundScore === 'function') {
        return engine.calculateRoundScore(state);
      }
    } catch {}
    return null;
  }

  function renderScoreStrip() {
    const topbar = document.querySelector('.topbar');
    if (!topbar || !latestState) return;

    const projection = scoreProjection(latestState);
    if (!projection) return;

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
    const roundA = Number(projection.A?.total || 0);
    const roundB = Number(projection.B?.total || 0);
    const target = Number(latestState.targetScore || 110);

    strip.innerHTML = `
      <div class="live-score-group match-score-live" title="Match total from completed rounds">
        <small>MATCH</small>
        <span class="live-team team-a-live">A <b>${matchA}</b></span>
        <span class="live-score-dash">–</span>
        <span class="live-team team-b-live">B <b>${matchB}</b></span>
      </div>
      <span class="live-score-divider" aria-hidden="true"></span>
      <div class="live-score-group round-score-live" title="Live round projection. Majority and last-pickup points can change before the round ends.">
        <small>ROUND</small>
        <span class="live-team team-a-live">A <b>${roundA}</b></span>
        <span class="live-score-dash">–</span>
        <span class="live-team team-b-live">B <b>${roundB}</b></span>
      </div>
      <span class="live-score-target">First to ${target}</span>`;
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
