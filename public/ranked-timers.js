(() => {
  if (window.__BRASTA_RANKED_TIMERS__) return;
  window.__BRASTA_RANKED_TIMERS__ = true;

  const firedTimeouts = new Set();
  const snapshotSeenAt = new Map();

  function rememberTimeout(key) {
    firedTimeouts.add(key);
    while (firedTimeouts.size > 40) {
      firedTimeouts.delete(firedTimeouts.values().next().value);
    }
  }

  function secondsLeft(deadline, serverNow = 0) {
    if (!serverNow) return Math.max(0, Math.ceil((deadline - Date.now()) / 1000));

    // Deadlines are generated from the server clock. Never compare them
    // directly to the device clock: a phone/PC that is 30 seconds slow would
    // otherwise show a 40-second "10 second" break. Anchor each server snapshot
    // to the local instant when we first see it and count down relatively.
    const key = `${serverNow}:${deadline}`;
    let seenAt = snapshotSeenAt.get(key);
    if (!seenAt) {
      seenAt = Date.now();
      snapshotSeenAt.set(key, seenAt);
      while (snapshotSeenAt.size > 80) {
        snapshotSeenAt.delete(snapshotSeenAt.keys().next().value);
      }
    }
    const remainingAtSnapshot = Math.max(0, deadline - serverNow);
    return Math.max(0, Math.ceil((remainingAtSnapshot - (Date.now() - seenAt)) / 1000));
  }

  function updateTurnTimer() {
    const timer = document.querySelector('[data-ranked-turn-timer]');
    if (!(timer instanceof HTMLElement)) return;

    const deadline = Number(timer.dataset.deadline || 0);
    if (!deadline) return;

    const serverNow = Number(timer.dataset.serverNow || 0);
    const seconds = secondsLeft(deadline, serverNow);
    const value = timer.querySelector('b');
    const nextText = String(seconds);
    if (value && value.textContent !== nextText) value.textContent = nextText;

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
    const serverNow = Number(timer.dataset.serverNow || 0);
    const nextText = String(secondsLeft(deadline, serverNow));
    if (timer.textContent !== nextText) timer.textContent = nextText;
  }

  function update() {
    updateTurnTimer();
    updateRoundTimer();
  }

  const boot = () => {
    // The legacy Brasta app redraws ranked UI frequently. Polling is deliberate
    // here: observing the same DOM nodes that this timer updates caused a
    // MutationObserver feedback loop and could freeze the browser at match start.
    update();
    window.setInterval(update, 200);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();