(() => {
  'use strict';
  if (window.__BRASTA_DEAL_ANIMATION__) return;
  window.__BRASTA_DEAL_ANIMATION__ = true;

  const DEAL_GAP_MS = 82;
  const DEAL_DURATION_MS = 245;
  const CARDS_PER_HAND = 4;

  let previousCounts = new Map();
  const handledOpeningAnimations = new Set();
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

  function yourSeatNumber() {
    const card = document.querySelector('.player-chip.player-card[data-you="1"][data-seat]');
    return card instanceof HTMLElement ? Number(card.dataset.seat || 0) : 0;
  }

  function realHandCards() {
    return Array.from(document.querySelectorAll('.hand-area .hand > .card'));
  }

  function prepareHandReveal(seats, excludedSeat = 0) {
    for (const seat of seats) {
      if (seat.seat === excludedSeat) continue;
      seat.card.querySelectorAll('.player-card-back').forEach((card, index) => {
        card.classList.toggle('deal-pending-mini-card', index < CARDS_PER_HAND);
        card.classList.remove('deal-mini-card-arrived');
      });
    }

    const yourSeat = yourSeatNumber();
    if (!yourSeat || yourSeat === excludedSeat) return;

    realHandCards().forEach((card, index) => {
      card.classList.toggle('deal-pending-hand-card', index < CARDS_PER_HAND);
      card.classList.remove('deal-hand-card-arrived');
    });
  }

  function revealDealtCard(seat, cardIndex) {
    const miniCard = seat.card.querySelectorAll('.player-card-back')[cardIndex];
    if (miniCard instanceof HTMLElement) {
      miniCard.classList.remove('deal-pending-mini-card');
      miniCard.classList.add('deal-mini-card-arrived');
    }

    if (seat.seat !== yourSeatNumber()) return;
    const handCard = realHandCards()[cardIndex];
    if (!(handCard instanceof HTMLElement)) return;
    handCard.classList.remove('deal-pending-hand-card');
    handCard.classList.add('deal-hand-card-arrived');
  }

  function dealDestination(seat, cardIndex) {
    if (seat.seat === yourSeatNumber()) {
      const handCard = realHandCards()[cardIndex];
      if (handCard instanceof HTMLElement) return handCard;
    }
    return seat.card;
  }

  // Motion is an explicit Brasta preference. The special-move system uses the
  // same flag so a browser/OS accessibility setting does not silently turn
  // the deal sequence into a static state when Brasta motion is enabled.
  function reducedMotionEnabled() {
    return document.documentElement.dataset.brastaMotion === 'reduced';
  }

  function finishHandReveal(run, seats, sequenceCount = CARDS_PER_HAND * Math.max(1, seats.length)) {
    window.setTimeout(() => {
      if (run !== animationRun) return;
      for (const seat of seats) {
        seat.card.querySelectorAll('.player-card-back').forEach((card) => {
          card.classList.remove('deal-pending-mini-card');
        });
      }
      realHandCards().forEach((card) => card.classList.remove('deal-pending-hand-card'));
      document.querySelectorAll('.loose-row > .card').forEach((card) => card.classList.remove('deal-pending-board-card'));
      document.documentElement.classList.remove('brasta-dealing-opening');
    }, sequenceCount * DEAL_GAP_MS + DEAL_DURATION_MS + 180);
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
    window.setTimeout(() => card.remove(), DEAL_DURATION_MS + Math.max(0, delay) + 160);
  }

  function animateKeepOpening(seats, table) {
    if (reducedMotionEnabled()) return;
    const deck = document.querySelector('.table-deck-stack');
    const boardCards = Array.from(document.querySelectorAll('.loose-row > .card')).slice(0, 4);
    const starter = seats.find((seat) => seat.starter);
    if (!(deck instanceof HTMLElement) || boardCards.length !== 4 || !starter) return;

    animationRun += 1;
    const run = animationRun;
    const recipients = dealOrder(seats).filter((seat) => seat.seat !== starter.seat);
    let sequence = 0;

    document.documentElement.classList.add('brasta-dealing-opening');
    prepareHandReveal(recipients, starter.seat);

    boardCards.forEach((card) => {
      card.classList.add('deal-pending-board-card');
      card.classList.remove('deal-board-card-arrived');
    });

    // KEEP: the starter's original four stay in place. Deal four new cards
    // from the deck to the table one at a time before dealing the other hands.
    boardCards.forEach((boardCard, cardIndex) => {
      const delay = sequence * DEAL_GAP_MS;
      window.setTimeout(() => {
        if (run !== animationRun || !boardCard.isConnected) return;
        flyCard(deck, boardCard, 0, run);
        window.setTimeout(() => {
          if (run !== animationRun) return;
          boardCard.classList.remove('deal-pending-board-card');
          boardCard.classList.add('deal-board-card-arrived');
        }, Math.max(80, DEAL_DURATION_MS - 45));
      }, delay);
      sequence += 1;
    });

    for (let cardIndex = 0; cardIndex < CARDS_PER_HAND; cardIndex += 1) {
      for (const seat of recipients) {
        const delay = sequence * DEAL_GAP_MS;
        window.setTimeout(() => {
          if (run !== animationRun || !seat.card.isConnected) return;
          flyCard(deck, dealDestination(seat, cardIndex), 0, run);
          window.setTimeout(() => {
            if (run !== animationRun) return;
            revealDealtCard(seat, cardIndex);
          }, Math.max(80, DEAL_DURATION_MS - 45));
        }, delay);
        sequence += 1;
      }
    }

    finishHandReveal(run, seats, sequence);
  }

  function animateFullDeal(seats) {
    if (reducedMotionEnabled()) return;
    const deck = document.querySelector('.table-deck-stack');
    if (!(deck instanceof HTMLElement) || !seats.length) return;

    animationRun += 1;
    const run = animationRun;
    const order = dealOrder(seats);
    let sequence = 0;

    prepareHandReveal(seats);

    for (let cardIndex = 0; cardIndex < CARDS_PER_HAND; cardIndex += 1) {
      for (const seat of order) {
        const delay = sequence * DEAL_GAP_MS;
        window.setTimeout(() => {
          if (run !== animationRun || !seat.card.isConnected) return;
          flyCard(deck, dealDestination(seat, cardIndex), 0, run);
          window.setTimeout(() => {
            if (run !== animationRun) return;
            revealDealtCard(seat, cardIndex);
          }, Math.max(80, DEAL_DURATION_MS - 45));
        }, delay);
        sequence += 1;
      }
    }

    finishHandReveal(run, seats);
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
    const openingResolution = String(table.dataset.openingResolution || '');
    const openingKey = openingResolution ? `${table.dataset.round || '0'}:${openingResolution}` : '';

    if (!matchActive) {
      matchActive = true;
      previousCounts = current;
      if (openingResolution === 'keep' && !handledOpeningAnimations.has(openingKey)) {
        handledOpeningAnimations.add(openingKey);
        animateKeepOpening(seats, table);
      } else if (fullHandNow) {
        animateFullDeal(seats);
      }
      return;
    }

    const wasFullHand = seats.every((entry) => previousCounts.get(entry.seat) === CARDS_PER_HAND);
    const replenished = fullHandNow && !wasFullHand
      && seats.some((entry) => (previousCounts.get(entry.seat) || 0) < CARDS_PER_HAND);

    previousCounts = current;

    if (openingResolution === 'keep' && !handledOpeningAnimations.has(openingKey)) {
      handledOpeningAnimations.add(openingKey);
      animateKeepOpening(seats, table);
      return;
    }

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
