(() => {
  if (window.__BRASTA_PRIVATE_POSTMATCH__) return;
  window.__BRASTA_PRIVATE_POSTMATCH__ = true;

  const REMATCH_KEY = 'brasta-private-new-match';
  const BOT_PENDING_KEY = 'brasta-bot-pending';
  const BOT_NAME = 'Brasta Bot';
  const RANKED_PREFIXES = ['brasta-ranked-room:', 'brasta-ranked-2v2-room:'];
  let queued = false;

  function roomCode() {
    try {
      return String(new URLSearchParams(location.search).get('room') || '')
        .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    } catch { return ''; }
  }

  function isRankedRoom(code = roomCode()) {
    if (!code) return false;
    try { return RANKED_PREFIXES.some((prefix) => !!localStorage.getItem(prefix + code)); }
    catch { return false; }
  }

  function currentPlayerName() {
    const you = document.querySelector('.players .you-badge');
    const card = you?.closest('.player-chip');
    const name = card?.querySelector('b')?.textContent?.trim();
    if (name) return name;
    try { return localStorage.getItem('brasta-online-last-name') || ''; } catch { return ''; }
  }

  function currentMode() {
    const count = document.querySelectorAll('.players .player-chip').length;
    return count > 2 ? '2v2' : '1v1';
  }

  function isBotMatch() {
    return Array.from(document.querySelectorAll('.players .player-chip .player-name, .players .player-chip b'))
      .some((el) => String(el.textContent || '').trim().startsWith(BOT_NAME));
  }

  function markNextRoomForBot() {
    try { localStorage.setItem(BOT_PENDING_KEY, '1'); } catch {}
  }

  function currentTarget() {
    const text = document.querySelector('.round-end p')?.textContent || '';
    return /220/.test(text) ? '220' : '110';
  }

  function goHome() {
    const home = document.querySelector('[data-online-home]');
    if (home instanceof HTMLElement) home.click();
    else location.assign(location.pathname);
  }

  function startNewMatch() {
    const payload = {
      name: currentPlayerName(),
      mode: currentMode(),
      target: currentTarget(),
      ts: Date.now(),
    };
    try { sessionStorage.setItem(REMATCH_KEY, JSON.stringify(payload)); } catch {}
    goHome();
  }

  function autoCreateIfRequested() {
    let payload = null;
    try {
      const raw = sessionStorage.getItem(REMATCH_KEY);
      if (raw) payload = JSON.parse(raw);
    } catch {}
    if (!payload) return;

    const create = document.querySelector(`[data-create-room="${payload.mode === '2v2' ? '2v2' : '1v1'}"]`);
    const name = document.querySelector('#create-name');
    const target = document.querySelector('#create-target');
    if (!(create instanceof HTMLButtonElement) || !(name instanceof HTMLInputElement) || !(target instanceof HTMLSelectElement)) return;

    try { sessionStorage.removeItem(REMATCH_KEY); } catch {}
    if (payload.name) name.value = String(payload.name);
    target.value = payload.target === '220' ? '220' : '110';
    create.click();
  }

  function decorateMatchEnd() {
    const code = roomCode();
    if (!code || isRankedRoom(code)) return;
    const end = document.querySelector('.round-end');
    if (!end || end.querySelector('[data-private-postmatch-actions]')) return;
    const heading = String(end.querySelector('h2')?.textContent || '');
    if (!/wins|tie match/i.test(heading)) return;

    const oldCopy = Array.from(end.querySelectorAll('p')).find((p) => /return home or reconnect/i.test(p.textContent || ''));
    if (oldCopy) oldCopy.remove();

    const botMatch = isBotMatch();
    const row = document.createElement('div');
    row.className = 'button-row ranked-postmatch-actions private-postmatch-actions';
    row.dataset.privatePostmatchActions = '1';
    row.innerHTML = `<button class="primary" data-private-new-match>${botMatch ? 'Play Again' : 'New Match'}</button><button data-private-return-home>Return Home</button>`;
    end.appendChild(row);

    row.querySelector('[data-private-new-match]').addEventListener('click', () => {
      if (botMatch) markNextRoomForBot();
      startNewMatch();
    });
    row.querySelector('[data-private-return-home]').addEventListener('click', goHome);
  }

  function refresh() {
    queued = false;
    decorateMatchEnd();
    autoCreateIfRequested();
  }

  function queueRefresh() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(refresh);
  }

  function boot() {
    const app = document.getElementById('app') || document.body;
    new MutationObserver(queueRefresh).observe(app, { childList: true, subtree: true });
    queueRefresh();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
