namespace Brasta {
  export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
  export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';
  export type CardId = string;
  export type Team = 'A' | 'B';
  export type Mode = '1v1' | '2v2';
  export type TargetScore = 110 | 220;
  export type Phase = 'openingChoice' | 'play' | 'roundEnd' | 'matchEnd';
  export type Seat = 1 | 2 | 3 | 4;

  export interface Card {
    id: CardId;
    rank: Rank;
    suit: Suit;
    value: number | null;
  }

  export interface PlayerState {
    seat: Seat;
    name: string;
    hand: CardId[];
  }

  export interface Build {
    id: string;
    kind: 'numeric' | 'rank';
    declaredValue?: number;
    declaredRank?: 'Q' | 'K';
    groups: CardId[][];
    modifiers: CardId[];
  }

  export interface RoundStats {
    brastas: Record<Team, number>;
    burnedJacks: Record<Team, number>;
  }

  export interface ScoreBreakdown {
    aces: number;
    jacks: number;
    big2: number;
    big10: number;
    clubsMajority: number;
    cardsMajority: number;
    brastas: number;
    burnedJacks: number;
    lastPickup: number;
    total: number;
  }

  export interface RoundScore {
    A: ScoreBreakdown;
    B: ScoreBreakdown;
  }

  export interface GameState {
    mode: Mode;
    phase: Phase;
    round: number;
    seed: number;
    targetScore: TargetScore;
    starterSeat: Seat;
    currentSeat: Seat;
    cards: Record<CardId, Card>;
    deck: CardId[];
    players: PlayerState[];
    loose: CardId[];
    builds: Build[];
    captured: Record<Team, CardId[]>;
    score: Record<Team, number>;
    roundStats: RoundStats;
    lastPickupTeam: Team | null;
    lastPickupSeat: Seat | null;
    openingResolution: 'keep' | 'put' | null;
    event: string | null;
    lastMove: string | null;
    lastHandRound: number | null;
    roundScore: RoundScore | null;
    message: string;
  }

  export type LegalActionType =
    | 'PLAY_LOOSE'
    | 'CAPTURE_LOOSE'
    | 'MAKE_BUILD'
    | 'ADD_TO_BUILD'
    | 'RAISE_BUILD'
    | 'CAPTURE_BUILD'
    | 'JACK_SWEEP'
    | 'BURN_JACK';

  export interface LegalAction {
    type: LegalActionType;
    label: string;
  }

  export type Command =
    | { type: 'PLAY_LOOSE'; seat: Seat; cardId: CardId }
    | { type: 'CAPTURE_LOOSE'; seat: Seat; cardId: CardId; looseIds: CardId[] }
    | { type: 'MAKE_BUILD'; seat: Seat; cardId: CardId; declaredValue?: number; declaredRank?: 'Q' | 'K'; looseIds: CardId[] }
    | { type: 'ADD_TO_BUILD'; seat: Seat; cardId: CardId; buildId: string; looseIds: CardId[] }
    | { type: 'RAISE_BUILD'; seat: Seat; cardId: CardId; buildId: string }
    | { type: 'CAPTURE_BUILD'; seat: Seat; cardId: CardId; buildId: string; looseIds: CardId[] }
    | { type: 'JACK_ACTION'; seat: Seat; cardId: CardId };

  export interface ApplyResult {
    ok: boolean;
    state: GameState;
    error?: string;
  }

  export interface BuildDeclarationOption {
    kind: 'numeric' | 'rank';
    value?: number;
    rank?: 'Q' | 'K';
    label: string;
  }

  const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
  const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  function numericValue(rank: Rank): number | null {
    if (rank === 'A') return 1;
    if (/^\d+$/.test(rank)) return Number(rank);
    return null;
  }

  export function createDeck(): { cards: Record<CardId, Card>; deck: CardId[] } {
    const cards: Record<CardId, Card> = {};
    const deck: CardId[] = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        const id = `${rank}-${suit}`;
        cards[id] = { id, rank, suit, value: numericValue(rank) };
        deck.push(id);
      }
    }
    return { cards, deck };
  }

  function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
      a |= 0;
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(ids: CardId[], seed: number): CardId[] {
    const out = [...ids];
    const rng = mulberry32(seed);
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  export function activeSeats(mode: Mode): Seat[] {
    return mode === '1v1' ? [1, 2] : [1, 2, 3, 4];
  }

  export function teamForSeat(mode: Mode, seat: Seat): Team {
    if (mode === '1v1') return seat === 1 ? 'A' : 'B';
    return seat === 1 || seat === 3 ? 'A' : 'B';
  }

  function nextSeat(mode: Mode, seat: Seat): Seat {
    const seats = activeSeats(mode);
    const idx = seats.indexOf(seat);
    return seats[(idx + 1) % seats.length];
  }

  function nextStarter(mode: Mode, seat: Seat): Seat {
    return nextSeat(mode, seat);
  }

  function blankBreakdown(): ScoreBreakdown {
    return {
      aces: 0,
      jacks: 0,
      big2: 0,
      big10: 0,
      clubsMajority: 0,
      cardsMajority: 0,
      brastas: 0,
      burnedJacks: 0,
      lastPickup: 0,
      total: 0,
    };
  }

  function cloneState<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
  }

  function getPlayer(state: GameState, seat: Seat): PlayerState {
    const p = state.players.find((x) => x.seat === seat);
    if (!p) throw new Error(`Seat ${seat} is not active`);
    return p;
  }

  export function cardLabel(card: Card): string {
    const suit = card.suit === 'clubs' ? '♣' : card.suit === 'diamonds' ? '♦' : card.suit === 'hearts' ? '♥' : '♠';
    return `${card.rank}${suit}`;
  }

  function draw(state: GameState, count: number): CardId[] {
    return state.deck.splice(0, count);
  }

  function dealToSeat(state: GameState, seat: Seat, count: number): void {
    getPlayer(state, seat).hand.push(...draw(state, Math.min(count, state.deck.length)));
  }

  function dealAllActive(state: GameState, count: number): void {
    for (const seat of activeSeats(state.mode)) dealToSeat(state, seat, count);
  }

  export function startMatch(mode: Mode, seed = Date.now(), targetScore: TargetScore = 110): GameState {
    const { cards, deck } = createDeck();
    const shuffled = shuffle(deck, seed);
    const players: PlayerState[] = activeSeats(mode).map((seat) => ({ seat, name: `Seat ${seat}`, hand: [] }));
    const state: GameState = {
      mode,
      phase: 'openingChoice',
      round: 1,
      seed,
      targetScore,
      starterSeat: 1,
      currentSeat: 1,
      cards,
      deck: shuffled,
      players,
      loose: [],
      builds: [],
      captured: { A: [], B: [] },
      score: { A: 0, B: 0 },
      roundStats: { brastas: { A: 0, B: 0 }, burnedJacks: { A: 0, B: 0 } },
      lastPickupTeam: null,
      lastPickupSeat: null,
      openingResolution: null,
      event: null,
      lastMove: null,
      lastHandRound: null,
      roundScore: null,
      message: 'Seat 1: keep your opening four or put them on the board.',
    };
    dealToSeat(state, state.starterSeat, 4);
    return state;
  }

  export function sanitizeOpeningBoard(state: GameState): void {
    let guard = 0;
    while (guard++ < 20) {
      const jacks = state.loose.filter((id) => state.cards[id].rank === 'J');
      if (!jacks.length) return;
      state.loose = state.loose.filter((id) => !jacks.includes(id));
      state.deck.push(...jacks);
      state.seed += 1;
      state.deck = shuffle(state.deck, state.seed);
      state.loose.push(...draw(state, jacks.length));
    }
    throw new Error('Opening Jack replacement did not converge');
  }

  export function resolveOpening(state: GameState, choice: 'keep' | 'put'): ApplyResult {
    if (state.phase !== 'openingChoice') return { ok: false, state, error: 'Opening choice is not active.' };
    const next = cloneState(state);
    const starter = getPlayer(next, next.starterSeat);
    if (choice === 'put') {
      next.loose.push(...starter.hand);
      starter.hand = [];
    } else {
      next.loose.push(...draw(next, 4));
    }
    sanitizeOpeningBoard(next);
    if (choice === 'put') {
      dealAllActive(next, 4);
    } else {
      for (const seat of activeSeats(next.mode)) if (seat !== next.starterSeat) dealToSeat(next, seat, 4);
    }
    const badHand = next.players.find((p) => p.hand.length !== 4);
    if (next.loose.length !== 4 || badHand) {
      return { ok: false, state, error: 'Opening validation failed; expected four board cards and four cards per active hand.' };
    }
    next.phase = 'play';
    next.openingResolution = choice;
    next.currentSeat = next.starterSeat;
    next.message = `Seat ${next.currentSeat}'s turn.`;
    return { ok: true, state: next };
  }

  function cardIdsInBuild(build: Build): CardId[] {
    return [...build.groups.flat(), ...build.modifiers];
  }

  export function allBoardCardIds(state: GameState): CardId[] {
    return [...state.loose, ...state.builds.flatMap(cardIdsInBuild)];
  }

  function playerHasCard(state: GameState, seat: Seat, cardId: CardId): boolean {
    return getPlayer(state, seat).hand.includes(cardId);
  }

  function removeFromHand(state: GameState, seat: Seat, cardId: CardId): void {
    const p = getPlayer(state, seat);
    const idx = p.hand.indexOf(cardId);
    if (idx >= 0) p.hand.splice(idx, 1);
  }

  function removeLoose(state: GameState, ids: CardId[]): void {
    const set = new Set(ids);
    state.loose = state.loose.filter((id) => !set.has(id));
  }

  function teamCapture(state: GameState, team: Team, ids: CardId[]): void {
    state.captured[team].push(...ids);
  }

  function countRetainedNumeric(state: GameState, seat: Seat, value: number, excludingCardId?: CardId): number {
    return getPlayer(state, seat).hand.filter((id) => id !== excludingCardId && state.cards[id].value === value).length;
  }

  function countRetainedRank(state: GameState, seat: Seat, rank: 'Q' | 'K', excludingCardId?: CardId): number {
    return getPlayer(state, seat).hand.filter((id) => id !== excludingCardId && state.cards[id].rank === rank).length;
  }

  function uniqueLoose(state: GameState, ids: CardId[]): boolean {
    const set = new Set(ids);
    return set.size === ids.length && ids.every((id) => state.loose.includes(id));
  }

  function sumCards(state: GameState, ids: CardId[]): number | null {
    let total = 0;
    for (const id of ids) {
      const v = state.cards[id]?.value;
      if (v == null) return null;
      total += v;
    }
    return total;
  }

  function combinations<T>(items: T[], min = 1): T[][] {
    const out: T[][] = [];
    const n = items.length;
    for (let mask = 1; mask < (1 << Math.min(n, 20)); mask++) {
      const subset: T[] = [];
      for (let i = 0; i < n; i++) if (mask & (1 << i)) subset.push(items[i]);
      if (subset.length >= min) out.push(subset);
    }
    return out;
  }

  export function findNumericSubsets(state: GameState, ids: CardId[], target: number): CardId[][] {
    if (target <= 0) return [];
    const candidates = ids.filter((id) => {
      const v = state.cards[id]?.value;
      return v != null && v <= target;
    });
    const out: CardId[][] = [];
    function dfs(start: number, sum: number, chosen: CardId[]): void {
      if (sum === target) {
        out.push([...chosen]);
        return;
      }
      if (sum > target) return;
      for (let i = start; i < candidates.length; i++) {
        const id = candidates[i];
        const v = state.cards[id].value!;
        chosen.push(id);
        dfs(i + 1, sum + v, chosen);
        chosen.pop();
      }
    }
    dfs(0, 0, []);
    return out;
  }

  export function partitionNumeric(state: GameState, ids: CardId[], target: number): CardId[][] | null {
    if (!ids.length || target <= 0) return null;
    const total = sumCards(state, ids);
    if (total == null || total % target !== 0) return null;
    const remaining = [...ids];

    function recurse(rest: CardId[]): CardId[][] | null {
      if (!rest.length) return [];
      const first = rest[0];
      const firstValue = state.cards[first].value;
      if (firstValue == null || firstValue > target) return null;
      const tail = rest.slice(1);
      const need = target - firstValue;
      if (need === 0) {
        const later = recurse(tail);
        return later ? [[first], ...later] : null;
      }
      const subsets = findNumericSubsets(state, tail, need);
      for (const subset of subsets) {
        const used = new Set(subset);
        const nextRest = tail.filter((id) => !used.has(id));
        const later = recurse(nextRest);
        if (later) return [[first, ...subset], ...later];
      }
      return null;
    }
    return recurse(remaining);
  }

  function canCaptureLoose(state: GameState, cardId: CardId): boolean {
    const card = state.cards[cardId];
    if (card.value != null) return findNumericSubsets(state, state.loose, card.value).length > 0;
    if (card.rank === 'Q' || card.rank === 'K') return state.loose.some((id) => state.cards[id].rank === card.rank);
    return false;
  }

  export function getBuildDeclarationOptions(state: GameState, seat: Seat, cardId: CardId): BuildDeclarationOption[] {
    const card = state.cards[cardId];
    const hand = getPlayer(state, seat).hand;
    const options: BuildDeclarationOption[] = [];
    if (card.value != null) {
      const values = [...new Set(hand.filter((id) => id !== cardId).map((id) => state.cards[id].value).filter((v): v is number => v != null))].sort((a, b) => a - b);
      for (const value of values) {
        if (value < card.value || value > 10) continue;
        const need = value === card.value ? value : value - card.value;
        if (findNumericSubsets(state, state.loose, need).length) options.push({ kind: 'numeric', value, label: `BUILD ${value}` });
      }
    } else if (card.rank === 'Q' || card.rank === 'K') {
      const retained = countRetainedRank(state, seat, card.rank, cardId);
      const looseMatch = state.loose.some((id) => state.cards[id].rank === card.rank);
      if (retained > 0 && looseMatch) options.push({ kind: 'rank', rank: card.rank, label: `BUILD ${card.rank}` });
    }
    return options;
  }

  function canAddToAnyBuild(state: GameState, seat: Seat, cardId: CardId): boolean {
    const card = state.cards[cardId];
    for (const build of state.builds) {
      if (build.kind === 'numeric' && card.value != null && build.declaredValue != null) {
        const b = build.declaredValue;
        if (card.value > b || countRetainedNumeric(state, seat, b, cardId) <= 0) continue;
        const need = b - card.value;
        if (need === 0 || findNumericSubsets(state, state.loose, need).length) return true;
      }
      if (build.kind === 'rank' && (card.rank === 'Q' || card.rank === 'K') && build.declaredRank === card.rank) {
        if (countRetainedRank(state, seat, card.rank, cardId) > 0) return true;
      }
    }
    return false;
  }

  function canRaiseAnyBuild(state: GameState, seat: Seat, cardId: CardId): boolean {
    const card = state.cards[cardId];
    if (card.value == null) return false;
    return state.builds.some((build) => {
      if (build.kind !== 'numeric' || build.declaredValue == null) return false;
      const next = build.declaredValue + card.value!;
      return next <= 10 && countRetainedNumeric(state, seat, next, cardId) > 0;
    });
  }

  function canCaptureAnyBuild(state: GameState, cardId: CardId): boolean {
    const card = state.cards[cardId];
    return state.builds.some((build) => {
      if (build.kind === 'numeric') return card.value != null && build.declaredValue === card.value;
      return (card.rank === 'Q' || card.rank === 'K') && build.declaredRank === card.rank;
    });
  }

  export function legalActionsForCard(state: GameState, seat: Seat, cardId: CardId): LegalAction[] {
    if (state.phase !== 'play' || state.currentSeat !== seat || !playerHasCard(state, seat, cardId)) return [];
    const card = state.cards[cardId];
    if (card.rank === 'J') {
      return state.loose.length
        ? [{ type: 'JACK_SWEEP', label: 'Sweep Loose Cards' }]
        : [{ type: 'BURN_JACK', label: 'Burn Jack −10' }];
    }
    const actions: LegalAction[] = [{ type: 'PLAY_LOOSE', label: 'Play Loose' }];
    if (canCaptureLoose(state, cardId)) actions.unshift({ type: 'CAPTURE_LOOSE', label: 'Capture Loose' });
    if (getBuildDeclarationOptions(state, seat, cardId).length) actions.push({ type: 'MAKE_BUILD', label: 'Make Build' });
    if (canAddToAnyBuild(state, seat, cardId)) actions.push({ type: 'ADD_TO_BUILD', label: 'Add to Build' });
    if (canRaiseAnyBuild(state, seat, cardId)) actions.push({ type: 'RAISE_BUILD', label: 'Raise Build' });
    if (canCaptureAnyBuild(state, cardId)) actions.push({ type: 'CAPTURE_BUILD', label: 'Capture Build' });
    return actions;
  }

  function validateTurn(state: GameState, seat: Seat, cardId: CardId): string | null {
    if (state.phase !== 'play') return 'The round is not in play.';
    if (state.currentSeat !== seat) return `It is Seat ${state.currentSeat}'s turn.`;
    if (!playerHasCard(state, seat, cardId)) return 'That card is not in the active hand.';
    return null;
  }

  function playerMoveName(state: GameState, seat: Seat): string {
    return getPlayer(state, seat).name || `Seat ${seat}`;
  }

  function cardsMoveLabel(state: GameState, ids: CardId[]): string {
    return ids.map((id) => cardLabel(state.cards[id])).join(' + ');
  }

  function appendEvent(state: GameState, announcement: string | null): void {
    if (!announcement) return;
    state.event = state.event ? `${state.event} • ${announcement}` : announcement;
  }

  function specialCaptureAnnouncement(state: GameState, team: Team, ids: CardId[]): string | null {
    const big2 = ids.some((id) => state.cards[id]?.rank === '2' && state.cards[id]?.suit === 'clubs');
    const big10 = ids.some((id) => state.cards[id]?.rank === '10' && state.cards[id]?.suit === 'diamonds');
    if (big2 && big10) return `BIG 2 + BIG 10! Team ${team}`;
    if (big2) return `BIG 2! Team ${team}`;
    if (big10) return `BIG 10! Team ${team}`;
    return null;
  }

  function maybeBrasta(state: GameState, seat: Seat, isJack: boolean): void {
    if (isJack) return;
    if (state.loose.length === 0 && state.builds.length === 0) {
      const team = teamForSeat(state.mode, seat);
      state.roundStats.brastas[team] += 1;
      state.event = `BRASTA! Team ${team} +10`;
    }
  }

  function setLastPickup(state: GameState, seat: Seat): void {
    state.lastPickupSeat = seat;
    state.lastPickupTeam = teamForSeat(state.mode, seat);
  }

  function allHandsEmpty(state: GameState): boolean {
    return state.players.every((p) => p.hand.length === 0);
  }

  function calculateTeamBase(state: GameState, team: Team): ScoreBreakdown {
    const b = blankBreakdown();
    const cards = state.captured[team].map((id) => state.cards[id]);
    b.aces = cards.filter((c) => c.rank === 'A').length;
    b.jacks = cards.filter((c) => c.rank === 'J').length;
    b.big2 = cards.some((c) => c.rank === '2' && c.suit === 'clubs') ? 10 : 0;
    b.big10 = cards.some((c) => c.rank === '10' && c.suit === 'diamonds') ? 10 : 0;
    b.brastas = state.roundStats.brastas[team] * 10;
    b.burnedJacks = state.roundStats.burnedJacks[team] * -10;
    b.lastPickup = state.lastPickupTeam === team ? 10 : 0;
    return b;
  }

  export function calculateRoundScore(state: GameState): RoundScore {
    const A = calculateTeamBase(state, 'A');
    const B = calculateTeamBase(state, 'B');
    const clubsA = state.captured.A.filter((id) => state.cards[id].suit === 'clubs').length;
    const clubsB = state.captured.B.filter((id) => state.cards[id].suit === 'clubs').length;
    if (clubsA > clubsB) A.clubsMajority = 2;
    else if (clubsB > clubsA) B.clubsMajority = 2;
    const cardsA = state.captured.A.length;
    const cardsB = state.captured.B.length;
    if (cardsA > cardsB) A.cardsMajority = 2;
    else if (cardsB > cardsA) B.cardsMajority = 2;
    A.total = A.aces + A.jacks + A.big2 + A.big10 + A.clubsMajority + A.cardsMajority + A.brastas + A.burnedJacks + A.lastPickup;
    B.total = B.aces + B.jacks + B.big2 + B.big10 + B.clubsMajority + B.cardsMajority + B.brastas + B.burnedJacks + B.lastPickup;
    return { A, B };
  }

  function finishRound(state: GameState): void {
    if (state.lastPickupTeam) {
      const remaining = [...state.loose, ...state.builds.flatMap(cardIdsInBuild)];
      teamCapture(state, state.lastPickupTeam, remaining);
    }
    state.loose = [];
    state.builds = [];
    const roundScore = calculateRoundScore(state);
    state.roundScore = roundScore;
    state.score.A += roundScore.A.total;
    state.score.B += roundScore.B.total;
    const targetReached = state.score.A >= state.targetScore || state.score.B >= state.targetScore;
    const tiedAtTarget = targetReached && state.score.A === state.score.B;
    appendEvent(state, state.lastPickupTeam ? `LAST PICKUP! Team ${state.lastPickupTeam} +10` : null);
    if (targetReached && !tiedAtTarget) {
      const winner: Team = state.score.A > state.score.B ? 'A' : 'B';
      state.phase = 'matchEnd';
      state.message = `Team ${winner} wins the first-to-${state.targetScore} match, ${state.score.A}–${state.score.B}.`;
    } else {
      state.phase = 'roundEnd';
      state.message = tiedAtTarget
        ? `Both teams are tied at ${state.score.A}, so the match continues until the tie is broken.`
        : 'Round complete.';
    }
  }

  function advanceAfterAction(state: GameState, seat: Seat): void {
    const next = nextSeat(state.mode, seat);
    if (allHandsEmpty(state)) {
      if (state.deck.length > 0) {
        dealAllActive(state, 4);
        state.currentSeat = next;
        if (state.deck.length === 0) {
          state.lastHandRound = state.round;
          appendEvent(state, 'LAST HAND!');
          state.message = `LAST HAND! Final four-card deal. Seat ${next}'s turn.`;
        } else {
          state.message = `New four-card deal. Seat ${next}'s turn.`;
        }
      } else {
        finishRound(state);
      }
    } else {
      state.currentSeat = next;
      state.message = `Seat ${next}'s turn.`;
    }
  }

  export function nextRound(state: GameState): ApplyResult {
    if (state.phase !== 'roundEnd') return { ok: false, state, error: 'The current round has not ended.' };
    const { cards, deck } = createDeck();
    const next = cloneState(state);
    next.round += 1;
    next.seed += 101;
    next.starterSeat = nextStarter(next.mode, next.starterSeat);
    next.currentSeat = next.starterSeat;
    next.cards = cards;
    next.deck = shuffle(deck, next.seed);
    const existingNames = new Map(state.players.map((player) => [player.seat, player.name]));
    next.players = activeSeats(next.mode).map((seat) => ({ seat, name: existingNames.get(seat) ?? `Seat ${seat}`, hand: [] }));
    next.loose = [];
    next.builds = [];
    next.captured = { A: [], B: [] };
    next.roundStats = { brastas: { A: 0, B: 0 }, burnedJacks: { A: 0, B: 0 } };
    next.lastPickupTeam = null;
    next.lastPickupSeat = null;
    next.roundScore = null;
    next.openingResolution = null;
    next.event = null;
    next.lastMove = null;
    next.lastHandRound = null;
    next.phase = 'openingChoice';
    dealToSeat(next, next.starterSeat, 4);
    next.message = `Seat ${next.starterSeat}: keep your opening four or put them on the board.`;
    return { ok: true, state: next };
  }

  export function endMatch(state: GameState): GameState {
    const next = cloneState(state);
    next.phase = 'matchEnd';
    next.message = `Match ended. Team A ${next.score.A} — Team B ${next.score.B}`;
    return next;
  }

  function validateNumericGroups(state: GameState, ids: CardId[], target: number): CardId[][] | null {
    return partitionNumeric(state, ids, target);
  }

  export function applyCommand(state: GameState, command: Command): ApplyResult {
    const turnError = validateTurn(state, command.seat, command.cardId);
    if (turnError) return { ok: false, state, error: turnError };
    const card = state.cards[command.cardId];
    const team = teamForSeat(state.mode, command.seat);

    if (command.type === 'PLAY_LOOSE') {
      if (card.rank === 'J') return { ok: false, state, error: 'Use the Jack action for a Jack.' };
      const next = cloneState(state);
      removeFromHand(next, command.seat, command.cardId);
      next.loose.push(command.cardId);
      next.event = null;
      next.lastMove = `${playerMoveName(next, command.seat)} played ${cardLabel(card)} loose.`;
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    if (command.type === 'JACK_ACTION') {
      if (card.rank !== 'J') return { ok: false, state, error: 'That card is not a Jack.' };
      const next = cloneState(state);
      removeFromHand(next, command.seat, command.cardId);
      if (next.loose.length > 0) {
        const looseCount = next.loose.length;
        const swept = [...next.loose, command.cardId];
        next.loose = [];
        teamCapture(next, team, swept);
        setLastPickup(next, command.seat);
        next.event = `Jack sweep — ${playerMoveName(next, command.seat)}`;
        appendEvent(next, specialCaptureAnnouncement(next, team, swept));
        next.lastMove = `${playerMoveName(next, command.seat)} swept ${looseCount} loose card${looseCount === 1 ? '' : 's'} with ${cardLabel(card)}.`;
      } else {
        next.loose.push(command.cardId);
        next.roundStats.burnedJacks[team] += 1;
        next.event = `BURNED JACK! Team ${team} −10`;
        next.lastMove = `${playerMoveName(next, command.seat)} burned ${cardLabel(card)} (−10).`;
      }
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    if (command.type === 'CAPTURE_LOOSE') {
      if (!command.looseIds.length || !uniqueLoose(state, command.looseIds)) return { ok: false, state, error: 'Choose loose cards that are currently on the board.' };
      if (card.value != null) {
        if (!validateNumericGroups(state, command.looseIds, card.value)) return { ok: false, state, error: `Selected loose cards cannot be partitioned into ${card.value}-sets.` };
      } else if (card.rank === 'Q' || card.rank === 'K') {
        if (!command.looseIds.every((id) => state.cards[id].rank === card.rank)) return { ok: false, state, error: `A ${card.rank} can only capture loose ${card.rank}s.` };
      } else {
        return { ok: false, state, error: 'That card cannot make a normal loose capture.' };
      }
      const next = cloneState(state);
      removeFromHand(next, command.seat, command.cardId);
      removeLoose(next, command.looseIds);
      const capturedIds = [...command.looseIds, command.cardId];
      teamCapture(next, team, capturedIds);
      setLastPickup(next, command.seat);
      next.event = null;
      maybeBrasta(next, command.seat, false);
      appendEvent(next, specialCaptureAnnouncement(next, team, capturedIds));
      next.lastMove = `${playerMoveName(next, command.seat)} captured ${cardsMoveLabel(next, command.looseIds)} with ${cardLabel(card)}.`;
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    if (command.type === 'MAKE_BUILD') {
      if (!uniqueLoose(state, command.looseIds)) return { ok: false, state, error: 'Build cards must be loose cards currently on the board.' };
      if (card.rank === 'J') return { ok: false, state, error: 'Jacks cannot build.' };
      if (card.value != null) {
        const b = command.declaredValue;
        if (b == null || b < 1 || b > 10) return { ok: false, state, error: 'Choose a numeric declared build value from 1–10.' };
        if (countRetainedNumeric(state, command.seat, b, command.cardId) <= 0) return { ok: false, state, error: `You must retain a ${b} in your hand.` };
        const groups = validateNumericGroups(state, [command.cardId, ...command.looseIds], b);
        if (!groups || !command.looseIds.length) return { ok: false, state, error: `Played card plus selected loose cards must form one or more complete ${b}-sets.` };
        const next = cloneState(state);
        removeFromHand(next, command.seat, command.cardId);
        removeLoose(next, command.looseIds);
        next.builds.push({ id: `b-${next.round}-${Date.now()}-${Math.random().toString(16).slice(2)}`, kind: 'numeric', declaredValue: b, groups, modifiers: [] });
        next.event = `BUILD ${b}`;
        next.lastMove = `${playerMoveName(next, command.seat)} made BUILD ${b} with ${cardsMoveLabel(next, [command.cardId, ...command.looseIds])}.`;
        advanceAfterAction(next, command.seat);
        return { ok: true, state: next };
      }
      if (card.rank === 'Q' || card.rank === 'K') {
        const rank = command.declaredRank ?? card.rank;
        if (rank !== card.rank) return { ok: false, state, error: 'Face build rank must match the played face card.' };
        if (countRetainedRank(state, command.seat, rank, command.cardId) <= 0) return { ok: false, state, error: `You must retain another ${rank}.` };
        if (!command.looseIds.length || !command.looseIds.every((id) => state.cards[id].rank === rank)) return { ok: false, state, error: `Choose one or more loose ${rank}s.` };
        const next = cloneState(state);
        removeFromHand(next, command.seat, command.cardId);
        removeLoose(next, command.looseIds);
        const groups = [[command.cardId], ...command.looseIds.map((id) => [id])];
        next.builds.push({ id: `b-${next.round}-${Date.now()}-${Math.random().toString(16).slice(2)}`, kind: 'rank', declaredRank: rank, groups, modifiers: [] });
        next.event = `BUILD ${rank}`;
        next.lastMove = `${playerMoveName(next, command.seat)} made BUILD ${rank} with ${cardsMoveLabel(next, [command.cardId, ...command.looseIds])}.`;
        advanceAfterAction(next, command.seat);
        return { ok: true, state: next };
      }
      return { ok: false, state, error: 'That card cannot build.' };
    }

    const build = state.builds.find((b) => b.id === command.buildId);
    if (!build) return { ok: false, state, error: 'That build no longer exists.' };

    if (command.type === 'ADD_TO_BUILD') {
      if (!uniqueLoose(state, command.looseIds)) return { ok: false, state, error: 'Selected add-on cards must be loose cards.' };
      if (build.kind === 'numeric') {
        const b = build.declaredValue!;
        if (card.value == null) return { ok: false, state, error: 'Only numeric cards can add a numeric set.' };
        if (countRetainedNumeric(state, command.seat, b, command.cardId) <= 0) return { ok: false, state, error: `You must retain a ${b} to add to BUILD ${b}.` };
        const groups = validateNumericGroups(state, [command.cardId, ...command.looseIds], b);
        if (!groups) return { ok: false, state, error: `Played card plus selected loose cards must form complete ${b}-set(s).` };
        const next = cloneState(state);
        const target = next.builds.find((x) => x.id === build.id)!;
        removeFromHand(next, command.seat, command.cardId);
        removeLoose(next, command.looseIds);
        target.groups.push(...groups);
        next.event = `Added to BUILD ${b}`;
        next.lastMove = `${playerMoveName(next, command.seat)} added ${cardsMoveLabel(next, [command.cardId, ...command.looseIds])} to BUILD ${b}.`;
        advanceAfterAction(next, command.seat);
        return { ok: true, state: next };
      }
      const rank = build.declaredRank!;
      if (card.rank !== rank) return { ok: false, state, error: `Only ${rank} can be added to BUILD ${rank}.` };
      if (countRetainedRank(state, command.seat, rank, command.cardId) <= 0) return { ok: false, state, error: `You must retain another ${rank}.` };
      if (!command.looseIds.every((id) => state.cards[id].rank === rank)) return { ok: false, state, error: `Optional loose add-ons must also be ${rank}.` };
      const next = cloneState(state);
      const target = next.builds.find((x) => x.id === build.id)!;
      removeFromHand(next, command.seat, command.cardId);
      removeLoose(next, command.looseIds);
      target.groups.push([command.cardId], ...command.looseIds.map((id) => [id]));
      next.event = `Added to BUILD ${rank}`;
      next.lastMove = `${playerMoveName(next, command.seat)} added ${cardsMoveLabel(next, [command.cardId, ...command.looseIds])} to BUILD ${rank}.`;
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    if (command.type === 'RAISE_BUILD') {
      if (build.kind !== 'numeric' || build.declaredValue == null) return { ok: false, state, error: 'Rank builds cannot be numerically raised.' };
      if (card.value == null) return { ok: false, state, error: 'Only a numeric card can raise a numeric build.' };
      const newValue = build.declaredValue + card.value;
      if (newValue > 10) return { ok: false, state, error: 'A build cannot be raised above 10.' };
      if (countRetainedNumeric(state, command.seat, newValue, command.cardId) <= 0) return { ok: false, state, error: `You must retain a ${newValue} to raise this build.` };
      const next = cloneState(state);
      const target = next.builds.find((x) => x.id === build.id)!;
      removeFromHand(next, command.seat, command.cardId);
      target.modifiers.push(command.cardId);
      target.declaredValue = newValue;
      const matching = next.builds.filter((x) => x.id !== target.id && x.kind === 'numeric' && x.declaredValue === newValue);
      for (const other of matching) {
        target.groups.push(...other.groups);
        target.modifiers.push(...other.modifiers);
      }
      if (matching.length) {
        const mergedIds = new Set(matching.map((x) => x.id));
        next.builds = next.builds.filter((x) => !mergedIds.has(x.id));
      }
      next.event = matching.length ? `BUILD ${newValue} • BUILDS COMBINED` : `BUILD ${newValue}`;
      const mergeText = matching.length ? ` and combined ${matching.length + 1} BUILD ${newValue} piles` : '';
      next.lastMove = `${playerMoveName(next, command.seat)} raised BUILD ${build.declaredValue} → BUILD ${newValue} with ${cardLabel(card)}${mergeText}.`;
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    if (command.type === 'CAPTURE_BUILD') {
      if (!uniqueLoose(state, command.looseIds)) return { ok: false, state, error: 'Optional capture cards must be loose cards.' };
      if (build.kind === 'numeric') {
        const b = build.declaredValue!;
        if (card.value !== b) return { ok: false, state, error: `A ${b} is required to capture BUILD ${b}.` };
        if (command.looseIds.length && !validateNumericGroups(state, command.looseIds, b)) return { ok: false, state, error: `Optional loose cards must form complete ${b}-set(s).` };
      } else {
        const rank = build.declaredRank!;
        if (card.rank !== rank) return { ok: false, state, error: `${rank} is required to capture BUILD ${rank}.` };
        if (!command.looseIds.every((id) => state.cards[id].rank === rank)) return { ok: false, state, error: `Optional loose cards must be ${rank}.` };
      }
      const next = cloneState(state);
      const targetIdx = next.builds.findIndex((x) => x.id === build.id);
      const target = next.builds[targetIdx];
      const buildCards = cardIdsInBuild(target);
      removeFromHand(next, command.seat, command.cardId);
      removeLoose(next, command.looseIds);
      next.builds.splice(targetIdx, 1);
      const capturedIds = [...buildCards, ...command.looseIds, command.cardId];
      teamCapture(next, team, capturedIds);
      setLastPickup(next, command.seat);
      next.event = null;
      maybeBrasta(next, command.seat, false);
      appendEvent(next, specialCaptureAnnouncement(next, team, capturedIds));
      const extraText = command.looseIds.length ? ` plus ${cardsMoveLabel(next, command.looseIds)}` : '';
      next.lastMove = `${playerMoveName(next, command.seat)} captured ${buildLabel(build)} with ${cardLabel(card)}${extraText}.`;
      advanceAfterAction(next, command.seat);
      return { ok: true, state: next };
    }

    return { ok: false, state, error: 'Unsupported action.' };
  }

  export function getCapturableBuilds(state: GameState, cardId: CardId): Build[] {
    const card = state.cards[cardId];
    return state.builds.filter((b) => b.kind === 'numeric'
      ? card.value != null && b.declaredValue === card.value
      : (card.rank === 'Q' || card.rank === 'K') && b.declaredRank === card.rank);
  }

  export function getAddableBuilds(state: GameState, seat: Seat, cardId: CardId): Build[] {
    const card = state.cards[cardId];
    return state.builds.filter((build) => {
      if (build.kind === 'numeric' && build.declaredValue != null && card.value != null) {
        const b = build.declaredValue;
        if (card.value > b || countRetainedNumeric(state, seat, b, cardId) <= 0) return false;
        const need = b - card.value;
        return need === 0 || findNumericSubsets(state, state.loose, need).length > 0;
      }
      if (build.kind === 'rank' && (card.rank === 'Q' || card.rank === 'K') && build.declaredRank === card.rank) {
        return countRetainedRank(state, seat, card.rank, cardId) > 0;
      }
      return false;
    });
  }

  export function getRaiseableBuilds(state: GameState, seat: Seat, cardId: CardId): Build[] {
    const card = state.cards[cardId];
    if (card.value == null) return [];
    return state.builds.filter((build) => build.kind === 'numeric' && build.declaredValue != null && build.declaredValue + card.value! <= 10 && countRetainedNumeric(state, seat, build.declaredValue + card.value!, cardId) > 0);
  }

  export function buildLabel(build: Build): string {
    return build.kind === 'numeric' ? `BUILD ${build.declaredValue}` : `BUILD ${build.declaredRank}`;
  }

  export function createLabState(mode: Mode = '1v1'): GameState {
    const state = startMatch(mode, 1234);
    state.phase = 'play';
    state.deck = [];
    state.loose = [];
    state.builds = [];
    state.captured = { A: [], B: [] };
    state.players.forEach((p) => p.hand = []);
    state.currentSeat = 1;
    state.starterSeat = 1;
    state.roundStats = { brastas: { A: 0, B: 0 }, burnedJacks: { A: 0, B: 0 } };
    state.lastPickupTeam = null;
    state.lastPickupSeat = null;
    state.roundScore = null;
    state.event = null;
    state.lastMove = null;
    state.lastHandRound = null;
    state.message = 'Rules Lab';
    return state;
  }

  export function scenario(name: string): GameState {
    const s = createLabState('1v1');
    const p1 = getPlayer(s, 1);
    function id(rank: Rank, suit: Suit): CardId { return `${rank}-${suit}`; }
    if (name === 'build7') {
      p1.hand = [id('3', 'spades'), id('7', 'hearts')];
      s.loose = [id('4', 'clubs'), id('7', 'diamonds')];
    } else if (name === 'add8') {
      p1.hand = [id('5', 'spades'), id('8', 'hearts')];
      s.loose = [id('3', 'clubs')];
      s.builds = [{ id: 'lab-b8', kind: 'numeric', declaredValue: 8, groups: [[id('8', 'diamonds')]], modifiers: [] }];
    } else if (name === 'raise8') {
      p1.hand = [id('2', 'spades'), id('8', 'hearts')];
      s.builds = [{ id: 'lab-b6', kind: 'numeric', declaredValue: 6, groups: [[id('6', 'diamonds')]], modifiers: [] }];
    } else if (name === 'capture8') {
      p1.hand = [id('8', 'hearts')];
      s.loose = [id('5', 'clubs'), id('3', 'diamonds')];
      s.builds = [{ id: 'lab-b8', kind: 'numeric', declaredValue: 8, groups: [[id('8', 'spades')]], modifiers: [] }];
    } else if (name === 'jackBuild') {
      p1.hand = [id('J', 'hearts'), id('A', 'spades')];
      s.loose = [id('4', 'clubs'), id('7', 'diamonds')];
      s.builds = [{ id: 'lab-b8', kind: 'numeric', declaredValue: 8, groups: [[id('5', 'spades'), id('3', 'hearts')]], modifiers: [] }];
    } else if (name === 'burnJack') {
      p1.hand = [id('J', 'hearts'), id('A', 'spades')];
      s.builds = [{ id: 'lab-b8', kind: 'numeric', declaredValue: 8, groups: [[id('5', 'spades'), id('3', 'hearts')]], modifiers: [] }];
    } else if (name === 'brasta') {
      p1.hand = [id('8', 'hearts')];
      s.loose = [id('5', 'clubs'), id('3', 'diamonds')];
    }
    return s;
  }
}


// Browser builds use the global Brasta namespace. The Node room server loads
// this exact same compiled engine through CommonJS.
declare const module: any;
if (typeof module !== 'undefined' && module?.exports) {
  module.exports = Brasta;
}
