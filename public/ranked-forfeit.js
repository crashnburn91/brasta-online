(() => {
  'use strict';

  if (window.__BRASTA_RANKED_FORFEIT__) return;
  window.__BRASTA_RANKED_FORFEIT__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const SOLO_MARKER_PREFIX = 'brasta-ranked-room:';
  const TEAM_MARKER_PREFIX = 'brasta-ranked-2v2-room:';

  let latestState = null;
  let queued = false;
  let submitting = false;
  let appObserver = null;

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
    } catch {
      return null;
    }
  }

  function rankedMarker(code = roomCode()) {
    if (!code) return null;
    const team = readMarker(TEAM_MARKER_PREFIX + code);
    if (team) return { ...team, mode: '2v2' };
    const solo = readMarker(SOLO_MARKER_PREFIX + code);
    if (solo) return { ...solo, mode: '1v1' };
    return null;
  }

  function accessToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; }
    catch { return ''; }
  }

  function attachSocket(ws) {
    if (!ws || ws.__brastaRankedForfeitAttached) return;
    let path = '';
    try { path = new URL(ws.url, location.href).pathname; } catch {}
    if (path !== '/api/ws') return;
    ws.__brastaRankedForfeitAttached = true;
    ws.addEventListener('message', (event) => {
      let message;
      try { message = JSON.parse(String(event.data || '')); } catch { return; }
      if (message?.type !== 'ROOM_STATE') return;
      latestState = message.update?.state || null;
      queueEnhance();
    });
    ws.addEventListener('close', () => {
      latestState = null;
      queueEnhance();
    });
  }

  const previousSend = WebSocket.prototype.send;
  if (!WebSocket.prototype.__brastaRankedForfeitSendPatched) {
    Object.defineProperty(WebSocket.prototype, '__brastaRankedForfeitSendPatched', { value: true });
    WebSocket.prototype.send = function patchedRankedForfeitSend(data) {
      attachSocket(this);
      return previousSend.call(this, data);
    };
  }

  function showToast(text, error = false) {
    document.querySelector('.ranked-forfeit-toast')?.remove();
    const toast = document.createElement('div');
    toast.className = `ranked-forfeit-toast${error ? ' error' : ''}`;
    toast.textContent = text;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 2800);
  }

  function closeModal() {
    if (submitting) return;
    document.querySelector('.ranked-forfeit-backdrop')?.remove();
  }

  async function submitForfeit(code, marker, card) {
    if (submitting) return;
    const token = accessToken();
    if (!token) {
      showToast('Your Brasta sign-in session is unavailable.', true);
      return;
    }

    submitting = true;
    card.classList.add('submitting');
    const confirmButton = card.querySelector('[data-confirm-ranked-forfeit]');
    const cancelButton = card.querySelector('[data-cancel-ranked-forfeit]');
    const status = card.querySelector('[data-ranked-forfeit-status]');
    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = 'Forfeiting…';
    }
    if (cancelButton) cancelButton.disabled = true;
    if (status) status.textContent = 'Recording the ranked result…';

    try {
      const response = await fetch('/api/competitive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ action: 'forfeit', roomCode: code, mode: marker.mode }),
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.error) throw new Error(data.error || `Could not forfeit the match (${response.status}).`);
      document.querySelector('.ranked-forfeit-backdrop')?.remove();
      window.dispatchEvent(new CustomEvent('brasta-competitive-updated', { detail: { mode: marker.mode, forfeit: true } }));
      if (data.state === 'finalizing') showToast('Forfeit accepted. Finalizing ranked result…');
    } catch (error) {
      const message = error?.message || 'Could not forfeit the ranked match.';
      if (status) status.textContent = message;
      if (confirmButton) {
        confirmButton.disabled = false;
        confirmButton.textContent = 'Forfeit Match';
      }
      if (cancelButton) cancelButton.disabled = false;
      card.classList.remove('submitting');
      showToast(message, true);
    } finally {
      submitting = false;
    }
  }

  function openModal() {
    const code = roomCode();
    const marker = rankedMarker(code);
    if (!code || !marker || document.querySelector('.ranked-forfeit-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'ranked-forfeit-backdrop';
    backdrop.setAttribute('role', 'presentation');

    const card = document.createElement('section');
    card.className = 'ranked-forfeit-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'ranked-forfeit-title');

    const teamCopy = marker.mode === '2v2'
      ? 'Forfeiting ends the match for your entire team. You and your teammate will both receive a loss, and both opponents will receive a win.'
      : 'Forfeiting ends the match immediately. You will receive a loss and your opponent will receive a win.';

    card.innerHTML = `
      <div class="ranked-forfeit-eyebrow">RANKED ${marker.mode.toUpperCase()}</div>
      <h2 id="ranked-forfeit-title">Forfeit this match?</h2>
      <p>${teamCopy}</p>
      <div class="ranked-forfeit-warning"><strong>This cannot be undone.</strong> The match will count normally toward ranked rating, placements, record, and player experience.</div>
      <div class="ranked-forfeit-actions">
        <button type="button" data-cancel-ranked-forfeit>Cancel</button>
        <button type="button" class="ranked-forfeit-confirm" data-confirm-ranked-forfeit>Forfeit Match</button>
      </div>
      <small data-ranked-forfeit-status></small>`;

    backdrop.appendChild(card);
    document.body.appendChild(backdrop);

    const cancel = card.querySelector('[data-cancel-ranked-forfeit]');
    const confirm = card.querySelector('[data-confirm-ranked-forfeit]');
    if (cancel) cancel.onclick = closeModal;
    if (confirm) confirm.onclick = () => void submitForfeit(code, marker, card);
    backdrop.onmousedown = (event) => {
      if (event.target === backdrop) closeModal();
    };
    confirm?.focus();
  }

  function decorateForfeitResult() {
    const info = latestState?.forfeitInfo;
    if (!info || latestState?.phase !== 'matchEnd') return;
    const end = document.querySelector('.round-end');
    if (!end) return;

    const heading = end.querySelector('h2');
    if (heading) heading.textContent = `Team ${info.winnerTeam} wins by forfeit`;

    const paragraphs = end.querySelectorAll('p');
    if (paragraphs[0]) paragraphs[0].textContent = `Ranked ${String(info.mode || '').toUpperCase()} · Match ended by forfeit`;

    let note = end.querySelector('[data-ranked-forfeit-result]');
    if (!note) {
      note = document.createElement('div');
      note.className = 'ranked-forfeit-result';
      note.dataset.rankedForfeitResult = '1';
      const score = end.querySelector('.match-score');
      if (score?.nextSibling) score.parentNode.insertBefore(note, score.nextSibling);
      else end.appendChild(note);
    }
    note.textContent = info.mode === '2v2'
      ? `${info.forfeitedBy} forfeited for Team ${info.loserTeam}.`
      : `${info.forfeitedBy} forfeited the match.`;
  }

  function shouldShowButton() {
    const code = roomCode();
    if (!code || !rankedMarker(code) || !accessToken()) return false;
    if (document.querySelector('.topbar .spectator-pill')) return false;
    if (latestState?.phase === 'matchEnd') return false;
    if (document.querySelector('.table')) return true;
    const roundHeading = String(document.querySelector('.round-end h2')?.textContent || '');
    return /^Round\s+\d+\s+complete/i.test(roundHeading);
  }

  function enhance() {
    queued = false;
    decorateForfeitResult();

    const existing = document.querySelector('[data-ranked-forfeit]');
    if (!shouldShowButton()) {
      existing?.remove();
      return;
    }
    if (existing) return;

    const nav = document.querySelector('.topbar nav');
    if (!nav) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ranked-forfeit-button';
    button.dataset.rankedForfeit = '1';
    button.title = 'Forfeit this ranked match';
    button.setAttribute('aria-label', 'Forfeit ranked match');
    button.innerHTML = '<span class="ranked-forfeit-full">Forfeit Match</span><span class="ranked-forfeit-short">Forfeit</span>';
    button.onclick = openModal;
    nav.appendChild(button);
  }

  function queueEnhance() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(enhance);
  }

  function boot() {
    const app = document.getElementById('app');
    if (app && !appObserver) {
      appObserver = new MutationObserver(queueEnhance);
      appObserver.observe(app, { childList: true });
    }
    queueEnhance();
  }

  window.addEventListener('brasta-auth-changed', queueEnhance);
  window.addEventListener('brasta-competitive-updated', queueEnhance);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeModal();
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
