(() => {
  if (window.__BRASTA_RANKED_MATCH_TRANSITION__) return;
  window.__BRASTA_RANKED_MATCH_TRANSITION__ = true;

  const MARKER_PREFIX = 'brasta-ranked-room:';
  const TEAM_MARKER_PREFIX = 'brasta-ranked-2v2-room:';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;',
    })[char]);
  }

  function roomCode() {
    try {
      return String(new URLSearchParams(location.search).get('room') || '')
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 6);
    } catch {
      return '';
    }
  }

  function parseStored(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function assignment(code) {
    if (!code) return null;
    return parseStored(TEAM_MARKER_PREFIX + code) || parseStored(MARKER_PREFIX + code);
  }

  function ensureStyles() {
    if (document.getElementById('ranked-match-transition-style')) return;
    const style = document.createElement('style');
    style.id = 'ranked-match-transition-style';
    style.textContent = `
      .ranked-match-transition{min-height:calc(100dvh - 72px);display:grid!important;place-items:center!important;padding:28px!important;background:radial-gradient(circle at 50% 35%,#143a29 0,#071c14 42%,#04110c 100%)!important}
      .ranked-match-transition>.ranked-wait-note{display:none!important}
      .ranked-match-found{width:min(680px,100%);text-align:center;color:#f7f2e8;padding:44px 32px;border:1px solid #d8b75e55;border-radius:28px;background:linear-gradient(180deg,#0c291eeb,#061711f2);box-shadow:0 30px 100px #0009,0 0 70px #d8b75e0b;position:relative;overflow:hidden}
      .ranked-match-found:before,.ranked-match-found:after{content:"";position:absolute;border:1px solid #d8b75e16;border-radius:50%;pointer-events:none}
      .ranked-match-found:before{width:260px;height:260px;right:-145px;top:-145px;box-shadow:0 0 0 38px #d8b75e08,0 0 0 76px #d8b75e05}
      .ranked-match-found:after{width:190px;height:190px;left:-120px;bottom:-130px;box-shadow:0 0 0 32px #d8b75e06}
      .ranked-transition-mark{width:64px;height:64px;margin:0 auto 18px;border-radius:18px;display:grid;place-items:center;background:#d8b75e;color:#082016;font-size:36px;font-weight:1000;box-shadow:0 10px 35px #0007}
      .ranked-match-found .eyebrow{color:#d8b75e;font-weight:900;letter-spacing:.18em;font-size:11px}
      .ranked-match-found h1{font-size:clamp(34px,6vw,52px);margin:7px 0 24px;line-height:1}
      .ranked-matchup{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:16px;margin:0 auto 24px;max-width:560px}
      .ranked-player{padding:16px 12px;border:1px solid #ffffff18;border-radius:16px;background:#ffffff08;min-width:0}
      .ranked-player small{display:block;text-transform:uppercase;letter-spacing:.12em;color:#82978d;font-size:9px;margin-bottom:4px}
      .ranked-player strong{display:block;font-size:20px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ranked-player em{display:block;font-style:normal;color:#aebfb5;font-size:13px;margin-top:5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .ranked-vs{color:#d8b75e;font-size:12px;font-weight:1000;letter-spacing:.12em}
      .ranked-connect-copy{margin:0;color:#aebfb5;font-size:14px}
      .ranked-connect-pulse{height:52px;display:flex;align-items:center;justify-content:center;gap:8px}
      .ranked-connect-pulse i{width:10px;height:10px;border-radius:50%;background:#d8b75e;animation:rankedConnectBounce 1.1s ease-in-out infinite}
      .ranked-connect-pulse i:nth-child(2){animation-delay:.14s}.ranked-connect-pulse i:nth-child(3){animation-delay:.28s}
      @keyframes rankedConnectBounce{0%,65%,100%{transform:translateY(0);opacity:.3}35%{transform:translateY(-10px);opacity:1}}
      @media(max-width:600px){.ranked-match-transition{padding:16px!important}.ranked-match-found{padding:34px 18px;border-radius:22px}.ranked-matchup{grid-template-columns:1fr;gap:8px}.ranked-vs{padding:1px}.ranked-player{padding:12px}.ranked-player strong{font-size:18px}}
    `;
    document.head.appendChild(style);
  }

  function decorate() {
    const code = roomCode();
    const match = assignment(code);
    if (!code || !match) return;

    const lobby = document.querySelector('main.lobby');
    if (!lobby || lobby.dataset.rankedTransition === '1') return;

    const is2v2 = match.mode === '2v2';
    const opponents = Array.isArray(match.opponents) ? match.opponents : [match.opponent || 'Opponent'];
    ensureStyles();
    lobby.dataset.rankedTransition = '1';
    lobby.className = 'ranked-match-transition';
    lobby.innerHTML = `
      <section class="ranked-match-found" aria-live="polite">
        <div class="ranked-transition-mark" aria-hidden="true">B</div>
        <div class="eyebrow">RANKED ${is2v2 ? '2v2' : '1v1'}</div>
        <h1>Match Found</h1>
        <div class="ranked-matchup">
          <div class="ranked-player"><small>${is2v2 ? 'Your Team' : 'You'}</small><strong>${esc(match.name || 'You')}</strong>${is2v2 ? `<em>+ ${esc(match.teammate || 'Teammate')}</em>` : ''}</div>
          <div class="ranked-vs">VS</div>
          <div class="ranked-player"><small>${is2v2 ? 'Opposing Team' : 'Opponent'}</small><strong>${esc(opponents[0] || 'Opponent')}</strong>${is2v2 ? `<em>+ ${esc(opponents[1] || 'Opponent')}</em>` : ''}</div>
        </div>
        <div class="ranked-connect-pulse" aria-hidden="true"><i></i><i></i><i></i></div>
        <p class="ranked-connect-copy">${is2v2 ? 'Connecting all four players…' : 'Connecting both players…'}</p>
      </section>`;
  }

  function boot() {
    const app = document.getElementById('app');
    if (app) new MutationObserver(decorate).observe(app, { childList: true });
    decorate();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
