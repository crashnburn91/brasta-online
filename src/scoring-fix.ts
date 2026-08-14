// Scoring compatibility patch: only the Most Captured Cards bonus can tie.
// There are 13 clubs in a standard deck, so Most Clubs always has a single winner.
namespace BrastaScoringFix {
  const originalCalculateRoundScore = Brasta.calculateRoundScore;

  function patchedCalculateRoundScore(state: Brasta.GameState): Brasta.RoundScore {
    const score = originalCalculateRoundScore(state);
    const cardsA = state.captured.A.length;
    const cardsB = state.captured.B.length;

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
