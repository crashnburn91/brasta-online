(() => {
  if (window.__BRASTA_RANKED_TIMERS__) return;
  window.__BRASTA_RANKED_TIMERS__ = true;

  const firedTimeouts = new Set();

  function rememberTimeout(key) {
    firedTimeouts.add(key);
    while (firedTimeouts.size > 40) {
      firedTimeouts.delete(firedTimeouts.values().next().value);
    }
  }

  function secondsLeft(deadline) {
    return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  }

  function updateTurnTimer() {
    const timer = document.querySelector('[data-ranked-turn-timer]');
    if (!(timer instanceof HTMLElement)) return;

    const deadline = Number(timer.dataset.deadline || 0);
    if (!deadline) return;

    const seconds = secondsLeft(deadline);
    const value = timer.querySelector('b');
    if (value) value.textContent = String(seconds);

    timer.classList.toggle('warning', seconds <= 10 && seconds > 5);
    timer.classList.toggle('danger', seconds <= 5);

    if (seconds > 0) return;
    const key = `${deadline}:${timer.dataset.turnSeat || ''}`;
    if (firedTimeouts.has(key)) return;
    rememberTimeout(key);
    window.dispatchEvent(new CustomEvent('brasta-ranked-turn-timeout', {
      detail: {
        deadline,
        seat: Number(timer.dataset.turnSeat || 0),
      },
    }));
  }

  function updateRoundTimer() {
    const timer = document.querySelector('[data-ranked-round-countdown]');
    if (!(timer instanceof HTMLElement)) return;
    const deadline = Number(timer.dataset.deadline || 0);
    if (!deadline) return;
    timer.textContent = String(secondsLeft(deadline));
  }

  function update() {
    updateTurnTimer();
    updateRoundTimer();
  }

  const observer = new MutationObserver(update);
  const boot = () => {
    observer.observe(document.body, { childList: true, subtree: true });
    update();
    window.setInterval(update, 200);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();