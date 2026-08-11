namespace BrastaTests {
  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  function assert(condition: any, message: string): void {
    if (!condition) throw new Error(message);
  }

  function test(name: string, fn: () => void): void {
    try {
      fn();
      passed++;
      results.push(`PASS ${name}`);
    } catch (e: any) {
      failed++;
      results.push(`FAIL ${name}: ${e.message || e}`);
    }
  }

  function card(state: Brasta.GameState, rank: Brasta.Rank, suit: Brasta.Suit): string {
    const id = `${rank}-${suit}`;
    assert(!!state.cards[id], `Missing card ${id}`);
    return id;
  }

  test('3 + 4 plus loose 7 creates BUILD 7 while retaining 7', () => {
    const s = Brasta.scenario('build7');
    const r = Brasta.applyCommand(s, {
      type: 'MAKE_BUILD', seat: 1, cardId: card(s, '3', 'spades'), declaredValue: 7,
      looseIds: [card(s, '4', 'clubs'), card(s, '7', 'diamonds')]
    });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.builds.length === 1, 'build not created');
    assert(r.state.builds[0].declaredValue === 7, 'wrong declared value');
    assert(r.state.builds[0].groups.length === 2, 'expected two complete 7-groups');
    assert(r.state.players[0].hand.includes(card(s, '7', 'hearts')), 'retained 7 missing');
  });

  test('BUILD 8 accepts played 5 + loose 3 while retaining 8', () => {
    const s = Brasta.scenario('add8');
    const r = Brasta.applyCommand(s, {
      type: 'ADD_TO_BUILD', seat: 1, cardId: card(s, '5', 'spades'), buildId: 'lab-b8',
      looseIds: [card(s, '3', 'clubs')]
    });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.builds[0].groups.length === 2, 'new 8-set not added');
    assert(r.state.players[0].hand.includes(card(s, '8', 'hearts')), '8 was not retained');
  });

  test('BUILD 6 + played 2 raises to 8 when 8 is retained', () => {
    const s = Brasta.scenario('raise8');
    const r = Brasta.applyCommand(s, { type: 'RAISE_BUILD', seat: 1, cardId: card(s, '2', 'spades'), buildId: 'lab-b6' });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.builds[0].declaredValue === 8, 'build did not raise to 8');
    assert(r.state.builds[0].modifiers.includes(card(s, '2', 'spades')), 'modifier not stored');
  });

  test('Capture BUILD 8 plus loose 5+3 in same play', () => {
    const s = Brasta.scenario('capture8');
    const r = Brasta.applyCommand(s, {
      type: 'CAPTURE_BUILD', seat: 1, cardId: card(s, '8', 'hearts'), buildId: 'lab-b8',
      looseIds: [card(s, '5', 'clubs'), card(s, '3', 'diamonds')]
    });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.builds.length === 0 && r.state.loose.length === 0, 'board not cleared');
    assert(r.state.roundStats.brastas.A === 1, 'Brasta not awarded');
  });

  test('Jack sweep takes loose cards but leaves build', () => {
    const s = Brasta.scenario('jackBuild');
    const r = Brasta.applyCommand(s, { type: 'JACK_ACTION', seat: 1, cardId: card(s, 'J', 'hearts') });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.loose.length === 0, 'loose cards not swept');
    assert(r.state.builds.length === 1, 'build was incorrectly swept');
  });

  test('Jack on build-only board burns for -10 and leaves build', () => {
    const s = Brasta.scenario('burnJack');
    const r = Brasta.applyCommand(s, { type: 'JACK_ACTION', seat: 1, cardId: card(s, 'J', 'hearts') });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.roundStats.burnedJacks.A === 1, 'burn penalty not recorded');
    assert(r.state.builds.length === 1, 'build changed');
    assert(r.state.loose.includes(card(s, 'J', 'hearts')), 'burned Jack not placed loose');
  });

  test('Non-Jack clear triggers Brasta', () => {
    const s = Brasta.scenario('brasta');
    const r = Brasta.applyCommand(s, {
      type: 'CAPTURE_LOOSE', seat: 1, cardId: card(s, '8', 'hearts'),
      looseIds: [card(s, '5', 'clubs'), card(s, '3', 'diamonds')]
    });
    assert(r.ok, r.error || 'command failed');
    assert(r.state.roundStats.brastas.A === 1, 'Brasta not awarded');
  });

  test('Opening Jack replacement leaves exactly four non-Jacks', () => {
    const s = Brasta.startMatch('1v1', 99);
    const starter = s.players.find(p => p.seat === 1)!;
    starter.hand = [];
    s.loose = [card(s, 'J', 'clubs'), card(s, 'J', 'diamonds'), card(s, '4', 'hearts'), card(s, '7', 'spades')];
    const used = new Set(s.loose);
    s.deck = Object.keys(s.cards).filter(id => !used.has(id));
    Brasta.sanitizeOpeningBoard(s);
    assert(s.loose.length === 4, 'opening board not four cards');
    assert(!s.loose.some(id => s.cards[id].rank === 'J'), 'Jack remains on opening board');
  });

  test('Round starter rotates 1v1', () => {
    let s = Brasta.startMatch('1v1', 1);
    s.phase = 'roundEnd';
    let r = Brasta.nextRound(s); assert(r.ok, 'next round failed');
    assert(r.state.starterSeat === 2, 'round 2 should start Seat 2');
    r.state.phase = 'roundEnd';
    r = Brasta.nextRound(r.state); assert(r.ok, 'next round failed');
    assert(r.state.starterSeat === 1, 'round 3 should start Seat 1');
  });

  test('Round starter rotates 2v2 clockwise', () => {
    let s = Brasta.startMatch('2v2', 1);
    const expected: Brasta.Seat[] = [2,3,4,1];
    for (const seat of expected) {
      s.phase = 'roundEnd';
      const r = Brasta.nextRound(s); assert(r.ok, 'next round failed');
      s = r.state;
      assert(s.starterSeat === seat, `expected Seat ${seat}, got Seat ${s.starterSeat}`);
    }
  });

  test('Majority ties award no two-point bonus', () => {
    const s = Brasta.createLabState('1v1');
    s.captured.A = [card(s, 'A', 'clubs'), card(s, '2', 'hearts')];
    s.captured.B = [card(s, '3', 'clubs'), card(s, '4', 'hearts')];
    const score = Brasta.calculateRoundScore(s);
    assert(score.A.clubsMajority === 0 && score.B.clubsMajority === 0, 'club tie wrongly awarded');
    assert(score.A.cardsMajority === 0 && score.B.cardsMajority === 0, 'card tie wrongly awarded');
  });

  test('110 is the default match target', () => {
    const s = Brasta.startMatch('1v1', 10);
    assert(s.targetScore === 110, `expected 110, got ${s.targetScore}`);
  });

  test('220 target ends the match when a team reaches 220', () => {
    const s = Brasta.createLabState('1v1');
    s.targetScore = 220;
    s.score.A = 219;
    s.captured.A = [card(s, 'A', 'clubs')];
    s.players[0].hand = [card(s, '2', 'spades')];
    s.deck = [];
    const r = Brasta.applyCommand(s, { type: 'PLAY_LOOSE', seat: 1, cardId: card(s, '2', 'spades') });
    assert(r.ok, r.error || 'last move failed');
    assert(r.state.score.A >= 220, `expected Team A to reach at least 220, got ${r.state.score.A}`);
    assert(r.state.phase === 'matchEnd', `expected matchEnd, got ${r.state.phase}`);
  });

  test('a tie at the target continues to another round', () => {
    const s = Brasta.createLabState('1v1');
    s.targetScore = 110;
    s.score.A = 110;
    s.score.B = 110;
    s.captured.A = [card(s, '3', 'clubs')];
    s.captured.B = [card(s, '4', 'clubs')];
    s.players[0].hand = [card(s, '2', 'spades')];
    s.deck = [];
    const r = Brasta.applyCommand(s, { type: 'PLAY_LOOSE', seat: 1, cardId: card(s, '2', 'spades') });
    assert(r.ok, r.error || 'last move failed');
    assert(r.state.score.A === 110 && r.state.score.B === 110, 'scores did not tie at 110');
    assert(r.state.phase === 'roundEnd', `tie should continue, got ${r.state.phase}`);
  });

  (globalThis as any).__BRASTA_TEST_RESULTS__ = { passed, failed, results };
  console.log(results.join('\n'));
  console.log(`${passed} passed, ${failed} failed`);
}
