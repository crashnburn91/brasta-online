namespace BrastaRuleExtensionTests {
  function assert(condition: any, message: string): void {
    if (!condition) throw new Error(message);
  }
  function card(state: Brasta.GameState, rank: Brasta.Rank, suit: Brasta.Suit): string {
    const id = `${rank}-${suit}`;
    assert(!!state.cards[id], `Missing card ${id}`);
    return id;
  }
  function apply(state: Brasta.GameState, command: Brasta.Command): Brasta.ApplyResult {
    return postProcessBrastaRules(state, command, Brasta.applyCommand(state, command));
  }

  {
    const s = Brasta.createLabState('1v1');
    const raiseCard = card(s, '2', 'spades');
    const captureCard = card(s, '8', 'hearts');
    const build6Cards = [card(s, '3', 'clubs'), card(s, '3', 'diamonds')];
    const build8Cards = [card(s, '4', 'clubs'), card(s, '4', 'diamonds')];
    s.players[0].hand = [raiseCard, captureCard];
    s.loose = [];
    s.builds = [
      { id: 'other-b6', kind: 'numeric', declaredValue: 6, groups: [build6Cards], modifiers: [] },
      { id: 'mine-b8', kind: 'numeric', declaredValue: 8, groups: [build8Cards], modifiers: [] }
    ];
    const raised = apply(s, { type: 'RAISE_BUILD', seat: 1, cardId: raiseCard, buildId: 'other-b6' });
    assert(raised.ok, raised.error || 'raise failed');
    assert(raised.state.builds.length === 1, `expected one combined build, got ${raised.state.builds.length}`);
    assert(raised.state.builds[0].declaredValue === 8, 'combined build should be BUILD 8');
    raised.state.currentSeat = 1;
    const captured = apply(raised.state, { type: 'CAPTURE_BUILD', seat: 1, cardId: captureCard, buildId: raised.state.builds[0].id, looseIds: [] });
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
    s.loose = [];
    s.builds = [];
    s.deck = [
      card(s, '3', 'clubs'), card(s, '4', 'clubs'), card(s, '5', 'clubs'), card(s, '6', 'clubs'),
      card(s, '3', 'hearts'), card(s, '4', 'hearts'), card(s, '5', 'hearts'), card(s, '6', 'hearts')
    ];
    const result = apply(s, { type: 'PLAY_LOOSE', seat: 1, cardId: played });
    assert(result.ok, result.error || 'last-hand trigger failed');
    assert(result.state.deck.length === 0, 'final deal should empty the deck');
    assert((result.state.event || '').includes('LAST HAND!'), `missing LAST HAND event: ${result.state.event}`);
    assert(result.state.message.includes('LAST HAND!'), `missing LAST HAND message: ${result.state.message}`);
  }

  console.log('2 rule-extension tests passed');
}
