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

  console.log('2 release regression tests passed');
}
