/**
 * Ranked matchmaking starts close to the player's rating, then favors getting
 * a game over preserving a narrow rank band when the queue is small.
 *
 * Ordinal rank divisions are three points wide, so these windows correspond
 * to roughly one, three, and five visible divisions. A null range means the
 * search is fully open and the matchmaker should choose the closest available
 * player or group.
 */
export function rankedSearchWindow(waitMs: number): number | null {
  const waitedMs = Math.max(0, waitMs);
  if (waitedMs < 10_000) return 3;
  if (waitedMs < 20_000) return 9;
  if (waitedMs < 30_000) return 15;
  return null;
}

export function rankedSearchAllows(ordinalGap: number, firstWaitMs: number, secondWaitMs: number): boolean {
  const firstWindow = rankedSearchWindow(firstWaitMs);
  const secondWindow = rankedSearchWindow(secondWaitMs);
  if (firstWindow === null || secondWindow === null) return true;
  return Math.abs(ordinalGap) <= Math.max(firstWindow, secondWindow);
}
