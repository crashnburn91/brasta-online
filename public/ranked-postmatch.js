(() => {
  if (window.__BRASTA_RANKED_POSTMATCH__) return;
  window.__BRASTA_RANKED_POSTMATCH__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SESSION_PREFIX = 'brasta-online-session:player:';
  const MARKER_PREFIX = 'brasta-ranked-room:';
  const REQUEUE_KEY = 'brasta-ranked-requeue';

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

  function isRankedRoom(code = roomCode()) {
    if (!code) return false;
    try { return Boolean(localStorage.getItem(MARKER_PREFIX + code)); }
    catch { return false; }
  }

  function accessToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
    catch { return ''; }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function confirmResult(code) {
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
        body: JSON.stringify({ action: 'monitor', roomCode: code }),
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
    setBusy(row, 'Saving ranked result…');
    try {
      await confirmResult(code);
      if (requeue) {
        try { sessionStorage.setItem(REQUEUE_KEY, '1'); } catch {}
      }
      clearFinishedRoom(code);
      location.assign(location.pathname);
    } catch (error) {
      setError(row, error?.message || 'Could not save the ranked result yet.');
    }
  }

  function decorateCoreMatchEnd() {
    const code = roomCode();
    if (!isRankedRoom(code)) return;
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
    if (!modal || modal.querySelector('[data-ranked-play-again]')) return;
    const row = modal.querySelector('.result-actions');
    if (!row) return;
    const code = roomCode();
    if (!isRankedRoom(code)) return;
    const playAgain = document.createElement('button');
    playAgain.className = 'primary';
    playAgain.dataset.rankedPlayAgain = '1';
    playAgain.textContent = 'Play Again';
    row.prepend(playAgain);
    playAgain.onclick = () => void finish(code, true, row);
  }

  function tryAutomaticRequeue() {
    if (roomCode()) return;
    let wantsRequeue = false;
    try { wantsRequeue = sessionStorage.getItem(REQUEUE_KEY) === '1'; } catch {}
    if (!wantsRequeue) return;

    const button = document.querySelector('[data-ranked-find]');
    if (!button || button.disabled) return;
    try { sessionStorage.removeItem(REQUEUE_KEY); } catch {}
    button.click();
  }

  function refresh() {
    decorateCoreMatchEnd();
    decorateResultModal();
    tryAutomaticRequeue();
  }

  const observer = new MutationObserver(refresh);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  window.addEventListener('brasta-competitive-updated', refresh);
  window.addEventListener('brasta-auth-changed', refresh);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', refresh, { once: true });
  else refresh();
})();
