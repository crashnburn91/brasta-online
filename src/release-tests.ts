namespace BrastaReleaseTests {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function card(state: Brasta.GameState, rank: Brasta.Rank, suit: Brasta.Suit): string {
    const id = `${rank}-${suit}`;
    assert(!!state.cards[id], `Missing card ${id}`);
    return id;
  }

  {
    const s = Brasta.createLabState('1v1');
    const raiseCard = card(s, '2', 'spades');
    const captureCard = card(s, '8', 'hearts');
    const build6Cards = [card(s, '3', 'clubs'), card(s, '3', 'diamonds')];
    const build8Cards = [card(s, '4', 'clubs'), card(s, '4', 'diamonds')];
    s.players[0].hand = [raiseCard, captureCard];
    s.builds = [
      { id: 'other-b6', kind: 'numeric', declaredValue: 6, groups: [build6Cards], modifiers: [] },
      { id: 'mine-b8', kind: 'numeric', declaredValue: 8, groups: [build8Cards], modifiers: [] },
    ];

    const raised = Brasta.applyCommand(s, { type: 'RAISE_BUILD', seat: 1, cardId: raiseCard, buildId: 'other-b6' });
    assert(raised.ok, raised.error || 'raise failed');
    assert(raised.state.builds.length === 1, `expected one combined build, got ${raised.state.builds.length}`);
    assert(raised.state.builds[0].declaredValue === 8, 'combined build should be BUILD 8');
    assert((raised.state.event || '').includes('BUILDS COMBINED'), 'merge announcement missing');

    raised.state.currentSeat = 1;
    const captured = Brasta.applyCommand(raised.state, { type: 'CAPTURE_BUILD', seat: 1, cardId: captureCard, buildId: raised.state.builds[0].id, looseIds: [] });
    assert(captured.ok, captured.error || 'capture failed');
    assert(captured.state.builds.length === 0, 'combined build was not fully captured');
    for (const id of [...build6Cards, ...build8Cards, raiseCard, captureCard]) {
      assert(captured.state.captured.A.includes(id), `capture missing ${id}`);
    }
  }

  {
    const s = Brasta.createLabState('1v1');
    const played = card(s, '2', 'spades');
    s.players[0].hand = [played];
    s.players[1].hand = [];
    s.deck = [
      card(s, '3', 'clubs'), card(s, '4', 'clubs'), card(s, '5', 'clubs'), card(s, '6', 'clubs'),
      card(s, '3', 'hearts'), card(s, '4', 'hearts'), card(s, '5', 'hearts'), card(s, '6', 'hearts'),
    ];

    const finalDeal = Brasta.applyCommand(s, { type: 'PLAY_LOOSE', seat: 1, cardId: played });
    assert(finalDeal.ok, finalDeal.error || 'final deal failed');
    assert(finalDeal.state.deck.length === 0, 'final deal should empty the deck');
    assert(finalDeal.state.lastHandRound === finalDeal.state.round, 'last-hand round flag missing');
    assert((finalDeal.state.event || '').includes('LAST HAND!'), 'LAST HAND event missing');

    const seat2Card = finalDeal.state.players.find((p) => p.seat === 2)?.hand[0];
    assert(!!seat2Card, 'seat 2 did not receive final hand');
    const nextMove = Brasta.applyCommand(finalDeal.state, { type: 'PLAY_LOOSE', seat: 2, cardId: seat2Card });
    assert(nextMove.ok, nextMove.error || 'last-hand follow-up move failed');
    assert((nextMove.state.event || '').includes('LAST HAND!'), 'LAST HAND banner did not persist');
  }

  {
    const s = Brasta.createLabState('1v1');
    const played7 = card(s, '7', 'hearts');
    const retained7 = card(s, '7', 'spades');
    const build7Card = card(s, '7', 'diamonds');
    s.players[0].hand = [played7, retained7];
    s.loose = [];
    s.builds = [{ id: 'same-value-b7', kind: 'numeric', declaredValue: 7, groups: [[build7Card]], modifiers: [] }];

    const legal = Brasta.legalActionsForCard(s, 1, played7).map((action) => action.type);
    assert(legal.includes('ADD_TO_BUILD'), 'A played 7 should be allowed to add to BUILD 7 when another 7 is retained');
    assert(legal.includes('CAPTURE_BUILD'), 'The same played 7 should still be allowed to capture BUILD 7');

    const added = Brasta.applyCommand(s, { type: 'ADD_TO_BUILD', seat: 1, cardId: played7, buildId: 'same-value-b7', looseIds: [] });
    assert(added.ok, added.error || 'same-value add failed');
    assert(added.state.builds.length === 1, 'BUILD 7 should remain after adding another 7');
    assert(added.state.builds[0].declaredValue === 7, 'Build value should remain 7');
    assert(added.state.builds[0].groups.some((group) => group.length === 1 && group[0] === played7), 'Played 7 should become its own BUILD 7 group');
    assert(added.state.players[0].hand.includes(retained7), 'The retained 7 should remain in hand');
  }

  {
    const s = Brasta.createLabState('1v1');
    const clubs = Object.keys(s.cards).filter((id) => s.cards[id].suit === 'clubs');
    const nonClubs = Object.keys(s.cards).filter((id) => s.cards[id].suit !== 'clubs');
    s.captured.A = [...clubs.slice(0, 6), ...nonClubs.slice(0, 20)];
    s.captured.B = [...clubs.slice(6), ...nonClubs.slice(20)];
    s.lastPickupTeam = 'A';
    s.roundStats.brastas = { A: 0, B: 0 };
    s.roundStats.burnedJacks = { A: 0, B: 0 };

    const score = Brasta.calculateRoundScore(s);
    const awarded = score.A.total + score.B.total;
    assert(s.captured.A.length === 26 && s.captured.B.length === 26, 'Regression setup must split all 52 cards 26–26');
    assert(score.A.cardsMajority === 0 && score.B.cardsMajority === 0, 'A 26–26 captured-card tie should award no majority bonus');
    assert(score.A.clubsMajority === 0 && score.B.clubsMajority === 2, 'With 13 clubs, one side must always win the clubs majority 2–0');
    assert(awarded === 40, `Expected the no-Brasta/no-burn baseline to award 40 total points, got ${awarded}`);
  }

  console.log('4 release regression tests passed');
}
