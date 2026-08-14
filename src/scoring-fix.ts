// Scoring compatibility patch: tied majority bonuses split 1–1.
// Kept separate so the authoritative generated server engine can mirror the same rule during sync.
namespace BrastaScoringFix {
  const originalCalculateRoundScore = Brasta.calculateRoundScore;

  function patchedCalculateRoundScore(state: Brasta.GameState): Brasta.RoundScore {
    const score = originalCalculateRoundScore(state);
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

    score.A.total = score.A.aces + score.A.jacks + score.A.big2 + score.A.big10 + score.A.clubsMajority + score.A.cardsMajority + score.A.brastas + score.A.burnedJacks + score.A.lastPickup;
    score.B.total = score.B.aces + score.B.jacks + score.B.big2 + score.B.big10 + score.B.clubsMajority + score.B.cardsMajority + score.B.brastas + score.B.burnedJacks + score.B.lastPickup;
    return score;
  }

  (Brasta as any).calculateRoundScore = patchedCalculateRoundScore;
}
