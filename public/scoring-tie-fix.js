(() => {
  if (window.__BRASTA_SCORING_TIE_FIX__) return;

  function install() {
    const Brasta = window.Brasta;
    if (!Brasta || typeof Brasta.calculateRoundScore !== 'function') {
      window.setTimeout(install, 25);
      return;
    }
    if (window.__BRASTA_SCORING_TIE_FIX__) return;
    window.__BRASTA_SCORING_TIE_FIX__ = true;

    const original = Brasta.calculateRoundScore.bind(Brasta);
    Brasta.calculateRoundScore = (state) => {
      const score = original(state);
      const clubsA = state.captured.A.filter((id) => state.cards[id].suit === 'clubs').length;
      const clubsB = state.captured.B.filter((id) => state.cards[id].suit === 'clubs').length;
      const cardsA = state.captured.A.length;
      const cardsB = state.captured.B.length;

      if (clubsA === clubsB) {
        score.A.clubsMajority = 1;
        score.B.clubsMajority = 1;
      }
      if (cardsA === cardsB) {
        score.A.cardsMajority = 1;
        score.B.cardsMajority = 1;
      }

      for (const side of ['A', 'B']) {
        const b = score[side];
        b.total = b.aces + b.jacks + b.big2 + b.big10 + b.clubsMajority + b.cardsMajority + b.brastas + b.burnedJacks + b.lastPickup;
      }
      return score;
    };
  }

  install();
})();
