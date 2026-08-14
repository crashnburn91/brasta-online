(() => {
  if (window.__BRASTA_OPENING_ORDER_FIX__) return;
  window.__BRASTA_OPENING_ORDER_FIX__ = true;

  function patch() {
    if (!window.Brasta || typeof window.Brasta.resolveOpening !== 'function') {
      window.setTimeout(patch, 25);
      return;
    }
    if (window.Brasta.__openingOrderFixed) return;

    window.Brasta.resolveOpening = function resolveOpeningFixed(state, choice) {
      if (state.phase !== 'openingChoice') return { ok: false, state, error: 'Opening choice is not active.' };
      const next = JSON.parse(JSON.stringify(state));
      const starter = next.players.find((p) => p.seat === next.starterSeat);
      if (!starter) return { ok: false, state, error: 'Opening starter is not active.' };

      const seats = window.Brasta.activeSeats(next.mode);
      const starterIndex = seats.indexOf(next.starterSeat);
      const otherSeats = seats.slice(starterIndex + 1).concat(seats.slice(0, starterIndex));
      const draw = (count) => next.deck.splice(0, Math.min(count, next.deck.length));
      const deal = (seat, count) => {
        const player = next.players.find((p) => p.seat === seat);
        if (player) player.hand.push(...draw(count));
      };

      if (choice === 'put') {
        next.loose.push(...starter.hand);
        starter.hand = [];
        window.Brasta.sanitizeOpeningBoard(next);
        for (const seat of otherSeats) deal(seat, 4);
        deal(next.starterSeat, 4);
      } else {
        for (const seat of otherSeats) deal(seat, 4);
        next.loose.push(...draw(4));
        window.Brasta.sanitizeOpeningBoard(next);
      }

      const badHand = next.players.find((p) => p.hand.length !== 4);
      if (next.loose.length !== 4 || badHand) {
        return { ok: false, state, error: 'Opening validation failed; expected four board cards and four cards per active hand.' };
      }
      next.phase = 'play';
      next.currentSeat = next.starterSeat;
      next.message = `Seat ${next.currentSeat}'s turn.`;
      return { ok: true, state: next };
    };

    window.Brasta.__openingOrderFixed = true;
  }

  patch();
})();
