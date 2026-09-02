(() => {
  'use strict';
  if (window.__BRASTA_DEAL_ANIMATION__) return;
  window.__BRASTA_DEAL_ANIMATION__ = true;

  const DEAL_GAP_MS = 82;
  const DEAL_DURATION_MS = 245;
  const CARDS_PER_HAND = 4;

  let previousCounts = new Map();
  let matchActive = false;
  let animationRun = 0;
  let inspectQueued = false;
  let audioContext = null;
  let audioUnlocked = false;

  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      void audioContext.resume();
      audioUnlocked = true;
    } catch {}
  }

  function playDealSound(delayMs = 0) {
    if (!audioUnlocked || !audioContext) return;
    try {
      const context = audioContext;
      const length = Math.max(1, Math.floor(context.sampleRate * 0.045));
      const buffer = context.createBuffer(1, length, context.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i += 1) {
        const envelope = 1 - (i / length);
        data[i] = (Math.random() * 2 - 1) * envelope;
      }

      const source = context.createBufferSource();
      source.buffer = buffer;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1750;
      filter.Q.value = 0.75;
      const gain = context.createGain();
      const at = context.currentTime + Math.max(0, delayMs) / 1000;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.045, at + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);

      source.connect(filter);
      filter.connect(gain);
      gain.connect(context.destination);
      source.start(at);
      source.stop(at + 0.06);
    } catch {}
  }

  function handCount(card) {
    const fan = card.querySelector('.player-card-back-fan');
    if (!(fan instanceof HTMLElement)) return 0;
    const label = fan.getAttribute('aria-label') || '';
    const parsed = Number((label.match(/\d+/) || [])[0] || 0);
    return Number.isFinite(parsed) ? parsed : fan.querySelectorAll('.player-card-back').length;
  }

  function currentSeats() {
    return Array.from(document.querySelectorAll('.player-chip.player-card[data-seat]'))
      .map((card) => ({
        card,
        seat: Number(card.dataset.seat || 0),
        count: handCount(card),
        starter: card.dataset.starter === '1',
      }))
      .filter((entry) => entry.seat > 0)
      .sort((a, b) => a.seat - b.seat);
  }

  function dealOrder(seats) {
    if (!seats.length) return seats;
    const starterIndex = seats.findIndex((entry) => entry.starter);
    if (starterIndex < 0) return seats;
    return [...seats.slice(starterIndex), ...seats.slice(0, starterIndex)];
  }

  function removeFlights(run) {
    window.setTimeout(() => {
      document.querySelectorAll(`.deal-flight-card[data-deal-run="${run}"]`).forEach((node) => node.remove());
    }, DEAL_DURATION_MS + 160);
  }

  function flyCard(origin, destination, delay, run) {
    const start = origin.getBoundingClientRect();
    const end = destination.getBoundingClientRect();
    if (!start.width || !end.width) return;

    const card = document.createElement('span');
    card.className = 'deal-flight-card';
    card.dataset.dealRun = String(run);
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = '<span>B</span>';
    card.style.left = `${start.left + start.width * 0.25}px`;
    card.style.top = `${start.top + start.height * 0.18}px`;
    card.style.setProperty('--deal-x', `${end.left + end.width * 0.5 - (start.left + start.width * 0.25) - 18}px`);
    card.style.setProperty('--deal-y', `${end.top + end.height * 0.72 - (start.top + start.height * 0.18) - 25}px`);
    card.style.setProperty('--deal-delay', `${delay}ms`);
    card.style.setProperty('--deal-duration', `${DEAL_DURATION_MS}ms`);
    document.body.appendChild(card);

    window.setTimeout(() => card.classList.add('dealing'), 16);
    playDealSound(delay);
    removeFlights(run);
  }

  function animateFullDeal(seats) {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const deck = document.querySelector('.table-deck-stack');
    if (!(deck instanceof HTMLElement) || !seats.length) return;

    animationRun += 1;
    const run = animationRun;
    const order = dealOrder(seats);
    let sequence = 0;

    for (let cardIndex = 0; cardIndex < CARDS_PER_HAND; cardIndex += 1) {
      for (const seat of order) {
        const delay = sequence * DEAL_GAP_MS;
        window.setTimeout(() => {
          if (run !== animationRun || !seat.card.isConnected) return;
          flyCard(deck, seat.card, 0, run);
        }, delay);
        sequence += 1;
      }
    }
  }

  function inspect() {
    inspectQueued = false;
    const table = document.querySelector('.table');
    const seats = currentSeats();

    if (!table || !seats.length) {
      previousCounts = new Map();
      matchActive = false;
      return;
    }

    const current = new Map(seats.map((entry) => [entry.seat, entry.count]));
    const fullHandNow = seats.every((entry) => entry.count === CARDS_PER_HAND);

    if (!matchActive) {
      matchActive = true;
      previousCounts = current;
      if (fullHandNow) animateFullDeal(seats);
      return;
    }

    const wasFullHand = seats.every((entry) => previousCounts.get(entry.seat) === CARDS_PER_HAND);
    const replenished = fullHandNow && !wasFullHand
      && seats.some((entry) => (previousCounts.get(entry.seat) || 0) < CARDS_PER_HAND);

    previousCounts = current;
    if (replenished) animateFullDeal(seats);
  }

  function scheduleInspect() {
    if (inspectQueued) return;
    inspectQueued = true;
    requestAnimationFrame(inspect);
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) {
      window.setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(scheduleInspect);
    observer.observe(app, { childList: true, subtree: true });
    scheduleInspect();
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();