(() => {
  if (window.__BRASTA_RANKED_POSTMATCH__) return;
  window.__BRASTA_RANKED_POSTMATCH__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SESSION_PREFIX = 'brasta-online-session:player:';
  const MARKER_PREFIX = 'brasta-ranked-room:';
  const TEAM_MARKER_PREFIX = 'brasta-ranked-2v2-room:';
  const REQUEUE_KEY = 'brasta-ranked-requeue';
  const TEAM_REQUEUE_KEY = 'brasta-ranked-2v2-requeue';

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

  function readMarker(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function rankedMarker(code = roomCode()) {
    if (!code) return null;
    const team = readMarker(TEAM_MARKER_PREFIX + code);
    if (team) return { ...team, mode: '2v2' };
    const solo = readMarker(MARKER_PREFIX + code);
    if (solo) return { ...solo, mode: '1v1' };
    return null;
  }

  function accessToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
    catch { return ''; }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function confirmResult(code, mode) {
    const token = accessToken();
    if (!token) throw new Error('Your Brasta sign-in session is unavailable.');

    let lastMessage = 'Saving ranked result…';
    for (let attempt = 0; attempt < 12; attempt++) {
      const response = await fetch('/api/competitive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'monitor', roomCode: code, mode }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `Could not save ranked result (${response.status}).`);
      if (data.state === 'completed') return data;
      if (data.message) lastMessage = data.message;
      await sleep(350);
    }
    throw new Error(lastMessage || 'The ranked result is still being finalized. Try again in a moment.');
  }

  function clearFinishedRoom(code) {
    try {
      localStorage.removeItem(MARKER_PREFIX + code);
      localStorage.removeItem(TEAM_MARKER_PREFIX + code);
      localStorage.removeItem(SESSION_PREFIX + code);
    } catch {}
  }

  function setBusy(row, message) {
    if (!row) return;
    row.querySelectorAll('button').forEach((button) => { button.disabled = true; });
    let status = row.querySelector('[data-ranked-postmatch-status]');
    if (!status) {
      status = document.createElement('span');
      status.dataset.rankedPostmatchStatus = '1';
      status.style.marginLeft = '8px';
      status.style.opacity = '.75';
      status.style.fontSize = '12px';
      row.appendChild(status);
    }
    status.textContent = message;
  }

  function setError(row, message) {
    if (!row) return;
    row.querySelectorAll('button').forEach((button) => { button.disabled = false; });
    let status = row.querySelector('[data-ranked-postmatch-status]');
    if (!status) {
      status = document.createElement('span');
      status.dataset.rankedPostmatchStatus = '1';
      row.appendChild(status);
    }
    status.textContent = message;
    status.style.marginLeft = '8px';
    status.style.color = '#ffb0b6';
    status.style.fontSize = '12px';
  }

  async function finish(code, requeue, row) {
    const marker = rankedMarker(code);
    if (!marker) return;
    setBusy(row, 'Saving ranked result…');
    try {
      await confirmResult(code, marker.mode);
      if (requeue) {
        try { sessionStorage.setItem(marker.mode === '2v2' ? TEAM_REQUEUE_KEY : REQUEUE_KEY, '1'); } catch {}
      }
      clearFinishedRoom(code);
      location.assign(location.pathname);
    } catch (error) {
      setError(row, error?.message || 'Could not save the ranked result yet.');
    }
  }

  function decorateCoreMatchEnd() {
    const code = roomCode();
    if (!rankedMarker(code)) return;
    const end = document.querySelector('.round-end');
    if (!end || end.querySelector('[data-ranked-postmatch-actions]')) return;
    const heading = String(end.querySelector('h2')?.textContent || '');
    if (!/wins|tie match/i.test(heading)) return;

    const oldCopy = Array.from(end.querySelectorAll('p')).find((p) => /return home or reconnect/i.test(p.textContent || ''));
    if (oldCopy) oldCopy.textContent = 'Your ranked result is being saved.';

    const row = document.createElement('div');
    row.className = 'button-row ranked-postmatch-actions';
    row.dataset.rankedPostmatchActions = '1';
    row.style.marginTop = '18px';
    row.innerHTML = '<button class="primary" data-ranked-play-again>Play Again</button><button data-ranked-return-home>Return Home</button>';
    end.appendChild(row);

    row.querySelector('[data-ranked-play-again]').onclick = () => void finish(code, true, row);
    row.querySelector('[data-ranked-return-home]').onclick = () => void finish(code, false, row);
  }

  function decorateResultModal() {
    const modal = document.getElementById('competitive-result-modal');
    if (!modal || modal.querySelector('[data-ranked-play-again]') || modal.querySelector('[data-ranked-2v2-again]')) return;
    const row = modal.querySelector('.result-actions');
    if (!row) return;
    const code = roomCode();
    if (!rankedMarker(code)) return;
    const playAgain = document.createElement('button');
    playAgain.className = 'primary';
    playAgain.dataset.rankedPlayAgain = '1';
    playAgain.textContent = 'Play Again';
    row.prepend(playAgain);
    playAgain.onclick = () => void finish(code, true, row);
  }

  function tryAutomaticRequeue() {
    if (roomCode()) return;
    let mode = null;
    try {
      if (sessionStorage.getItem(TEAM_REQUEUE_KEY) === '1') mode = '2v2';
      else if (sessionStorage.getItem(REQUEUE_KEY) === '1') mode = '1v1';
    } catch {}
    if (!mode) return;

    const button = document.querySelector(mode === '2v2' ? '[data-ranked-2v2-find]' : '[data-ranked-find]');
    if (!button || button.disabled) return;
    try { sessionStorage.removeItem(mode === '2v2' ? TEAM_REQUEUE_KEY : REQUEUE_KEY); } catch {}
    button.click();
  }

  function refresh() {
    decorateCoreMatchEnd();
    decorateResultModal();
    tryAutomaticRequeue();
  }

  function boot() {
    const app = document.getElementById('app');
    if (app) new MutationObserver(refresh).observe(app, { childList: true });
    refresh();
  }

  window.addEventListener('brasta-competitive-updated', refresh);
  window.addEventListener('brasta-auth-changed', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
