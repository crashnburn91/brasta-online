import crypto from 'node:crypto';

export type SeededTournamentTeam = {
  id: string;
  seed: number;
};

export type TournamentMatchInsert = {
  id: string;
  tournament_id: string;
  round_number: number;
  round_label: string;
  match_number: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  next_match_id: string | null;
  next_slot: 1 | 2 | null;
  status: 'pending' | 'ready' | 'bye';
};

export function bracketSizeFor(teamCount: number): 2 | 4 | 8 | 16 {
  if (teamCount <= 2) return 2;
  if (teamCount <= 4) return 4;
  if (teamCount <= 8) return 8;
  return 16;
}

export function bracketSeedOrder(size: 2 | 4 | 8 | 16): number[] {
  let order = [1, 2];
  for (let current = 4; current <= size; current *= 2) {
    order = order.flatMap((seed) => [seed, current + 1 - seed]);
  }
  return order;
}

function roundLabel(round: number, totalRounds: number): string {
  const fromFinal = totalRounds - round;
  if (fromFinal === 0) return 'Final';
  if (fromFinal === 1) return 'Semifinal';
  if (fromFinal === 2) return 'Quarterfinal';
  return 'First Round';
}

export function buildTournamentBracket(tournamentId: string, teams: SeededTournamentTeam[]): {
  bracketSize: 2 | 4 | 8 | 16;
  matches: TournamentMatchInsert[];
} {
  if (teams.length < 2 || teams.length > 12) throw new Error('A tournament bracket requires 2 to 12 teams.');

  const bracketSize = bracketSizeFor(teams.length);
  const totalRounds = Math.log2(bracketSize);
  const matchIds = Array.from({ length: totalRounds }, (_, roundIndex) =>
    Array.from({ length: bracketSize / (2 ** (roundIndex + 1)) }, () => crypto.randomUUID()),
  );
  const bySeed = new Map(teams.map((team) => [team.seed, team.id]));
  const orderedSlots = bracketSeedOrder(bracketSize).map((seed) => bySeed.get(seed) || null);
  const matches: TournamentMatchInsert[] = [];
  const knownWinners = new Map<string, string>();

  for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
    const round = roundIndex + 1;
    const matchCount = matchIds[roundIndex].length;
    for (let matchIndex = 0; matchIndex < matchCount; matchIndex += 1) {
      const id = matchIds[roundIndex][matchIndex];
      let team1: string | null = null;
      let team2: string | null = null;

      if (roundIndex === 0) {
        team1 = orderedSlots[matchIndex * 2] || null;
        team2 = orderedSlots[matchIndex * 2 + 1] || null;
      } else {
        const source1 = matchIds[roundIndex - 1][matchIndex * 2];
        const source2 = matchIds[roundIndex - 1][matchIndex * 2 + 1];
        team1 = knownWinners.get(source1) || null;
        team2 = knownWinners.get(source2) || null;
      }

      const byeWinner = team1 && !team2 ? team1 : team2 && !team1 ? team2 : null;
      const nextMatchId = roundIndex + 1 < totalRounds
        ? matchIds[roundIndex + 1][Math.floor(matchIndex / 2)]
        : null;
      const nextSlot = nextMatchId ? (matchIndex % 2 === 0 ? 1 : 2) as 1 | 2 : null;
      const status = byeWinner ? 'bye' : team1 && team2 ? 'ready' : 'pending';

      if (byeWinner) knownWinners.set(id, byeWinner);
      matches.push({
        id,
        tournament_id: tournamentId,
        round_number: round,
        round_label: roundLabel(round, totalRounds),
        match_number: matchIndex + 1,
        team1_id: team1,
        team2_id: team2,
        winner_team_id: byeWinner,
        next_match_id: nextMatchId,
        next_slot: nextSlot,
        status,
      });
    }
  }

  return { bracketSize, matches };
}
