(() => {
  if (window.__BRASTA_SEAT_PICKER__) return;
  window.__BRASTA_SEAT_PICKER__ = true;

  let moving = false;

  function roomCode() {
    const heading = document.querySelector('.lobby-hero h1');
    const fromLobby = (heading?.textContent || '').trim().toUpperCase();
    if (fromLobby) return fromLobby;
    const params = new URLSearchParams(location.search);
    return (params.get('room') || '').trim().toUpperCase();
  }

  function sessionFor(code) {
    try {
      if (window.BrastaNet?.loadSession) return window.BrastaNet.loadSession(code, 'player');
    } catch {}
    try {
      const raw = localStorage.getItem(`brasta-online-session:player:${code}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function teamForSeat(seat) { return seat === 1 || seat === 3 ? 'A' : 'B'; }

  function enhance() {
    const lobby = document.querySelector('.lobby');
    if (!lobby) return;
    const seats = Array.from(lobby.querySelectorAll('.lobby-seat'));
    if (seats.length !== 4) return;

    lobby.classList.add('seat-picker-enabled');
    seats.forEach((seatEl) => {
      const numberText = seatEl.querySelector('.seat-number')?.textContent || '';
      const match = numberText.match(/Seat\s+(\d)/i);
      const seat = match ? Number(match[1]) : 0;
      if (!seat) return;

      const isOpen = seatEl.classList.contains('empty');
      const isYou = !!seatEl.querySelector('.you-badge');
      seatEl.classList.toggle('seat-pickable', isOpen);
      seatEl.classList.toggle('seat-current', isYou);
      seatEl.dataset.seatNumber = String(seat);

      let hint = seatEl.querySelector('.seat-picker-hint');
      if (isOpen && !hint) {
        hint = document.createElement('div');
        hint.className = 'seat-picker-hint';
        hint.textContent = `Choose Seat ${seat} · Team ${teamForSeat(seat)}`;
        seatEl.appendChild(hint);
      } else if (!isOpen && hint) {
        hint.remove();
      }

      if (isOpen) {
        seatEl.setAttribute('role', 'button');
        seatEl.setAttribute('tabindex', '0');
        seatEl.setAttribute('aria-label', `Choose Seat ${seat}, Team ${teamForSeat(seat)}`);
      } else {
        seatEl.removeAttribute('role');
        seatEl.removeAttribute('tabindex');
        seatEl.removeAttribute('aria-label');
      }
    });
  }

  async function chooseSeat(seatEl) {
    if (moving || !seatEl.classList.contains('seat-pickable')) return;
    const seat = Number(seatEl.dataset.seatNumber || 0);
    const code = roomCode();
    const session = sessionFor(code);
    if (!seat || !code || !session?.token) return;

    moving = true;
    document.documentElement.classList.add('seat-move-pending');
    seatEl.classList.add('seat-moving');
    const hint = seatEl.querySelector('.seat-picker-hint');
    if (hint) hint.textContent = 'Moving…';

    try {
      const response = await fetch('/api/seat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ code, token: session.token, seat }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result?.ok) throw new Error(result?.error || 'Could not change seats.');

      // The existing WebSocket is bound to the old seat. Reloading immediately
      // resumes the same saved token and lets the server attach it to the new seat.
      location.reload();
    } catch (error) {
      moving = false;
      document.documentElement.classList.remove('seat-move-pending');
      seatEl.classList.remove('seat-moving');
      if (hint) hint.textContent = `Choose Seat ${seat} · Team ${teamForSeat(seat)}`;
      const message = error instanceof Error ? error.message : 'Could not change seats.';
      let notice = document.querySelector('.seat-picker-error');
      if (!notice) {
        notice = document.createElement('div');
        notice.className = 'error seat-picker-error';
        const seats = document.querySelector('.lobby-seats');
        seats?.insertAdjacentElement('beforebegin', notice);
      }
      if (notice) notice.textContent = message;
    }
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.lobby-seat.seat-pickable') : null;
    if (!target) return;
    event.preventDefault();
    void chooseSeat(target);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target instanceof Element ? event.target.closest('.lobby-seat.seat-pickable') : null;
    if (!target) return;
    event.preventDefault();
    void chooseSeat(target);
  });

  function start() {
    const app = document.getElementById('app');
    if (!app) return void setTimeout(start, 50);
    let queued = false;
    const queueEnhance = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; enhance(); });
    };
    new MutationObserver(queueEnhance).observe(app, { childList: true, subtree: true });
    enhance();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
