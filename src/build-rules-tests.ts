namespace BrastaBuildRulesTests {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function id(state: Brasta.GameState, rank: Brasta.Rank, suit: Brasta.Suit): string {
    const value = `${rank}-${suit}`;
    assert(!!state.cards[value], `Missing card ${value}`);
    return value;
  }

  {
    const s = Brasta.createLabState('1v1');
    const played3 = id(s, '3', 'spades');
    const retained7 = id(s, '7', 'hearts');
    const loose4 = id(s, '4', 'clubs');
    const existing7 = id(s, '7', 'diamonds');
    s.players[0].hand = [played3, retained7];
    s.loose = [loose4];
    s.builds = [{ id: 'owned-b7', kind: 'numeric', declaredValue: 7, groups: [[existing7]], modifiers: [], ownerSeat: 1 } as any];

    const made = Brasta.applyCommand(s, { type: 'MAKE_BUILD', seat: 1, cardId: played3, declaredValue: 7, looseIds: [loose4] });
    assert(made.ok, made.error || 'same-owner build extension failed');
    assert(made.state.builds.length === 1, `same-owner BUILD 7 should remain one pile, got ${made.state.builds.length}`);
    const build = made.state.builds[0] as any;
    assert(build.id === 'owned-b7', 'existing BUILD 7 should be retained as the target pile');
    assert(build.ownerSeat === 1, 'same-owner extension should remain owned by Seat 1');
    assert(build.groups.length === 2, `expected two BUILD 7 groups after extension, got ${build.groups.length}`);
  }

  {
    const s = Brasta.createLabState('1v1');
    const played3 = id(s, '3', 'spades');
    const retained7 = id(s, '7', 'hearts');
    const loose4 = id(s, '4', 'clubs');
    const existing7 = id(s, '7', 'diamonds');
    s.players[0].hand = [played3, retained7];
    s.loose = [loose4];
    s.builds = [{ id: 'opponent-b7', kind: 'numeric', declaredValue: 7, groups: [[existing7]], modifiers: [], ownerSeat: 2 } as any];

    const legal = Brasta.legalActionsForCard(s, 1, played3).map((action) => action.type);
    assert(!legal.includes('MAKE_BUILD'), 'Seat 1 must not be offered a separate BUILD 7 when Seat 2 owns BUILD 7');
    const rejected = Brasta.applyCommand(s, { type: 'MAKE_BUILD', seat: 1, cardId: played3, declaredValue: 7, looseIds: [loose4] });
    assert(!rejected.ok, 'opponent-owned duplicate BUILD 7 should be rejected by the engine');
  }

  {
    const s = Brasta.createLabState('1v1');
    const only7 = id(s, '7', 'hearts');
    const loose7 = id(s, '7', 'clubs');
    const buildCard = id(s, '4', 'diamonds');
    const buildCard2 = id(s, '3', 'spades');
    s.players[0].hand = [only7];
    s.loose = [loose7];
    s.builds = [{ id: 'owned-b7', kind: 'numeric', declaredValue: 7, groups: [[buildCard, buildCard2]], modifiers: [], ownerSeat: 1 } as any];

    const legal = Brasta.legalActionsForCard(s, 1, only7).map((action) => action.type);
    assert(!legal.includes('PLAY_LOOSE'), 'last retained BUILD 7 capture card must not be playable loose');
    assert(!legal.includes('CAPTURE_LOOSE'), 'last retained BUILD 7 capture card must not be spendable on a loose capture');
    assert(legal.includes('CAPTURE_BUILD'), 'the retained 7 must still be allowed to capture its BUILD 7');

    const loosePlay = Brasta.applyCommand(s, { type: 'PLAY_LOOSE', seat: 1, cardId: only7 });
    assert(!loosePlay.ok, 'engine must reject playing the last required build card loose');
    const looseCapture = Brasta.applyCommand(s, { type: 'CAPTURE_LOOSE', seat: 1, cardId: only7, looseIds: [loose7] });
    assert(!looseCapture.ok, 'engine must reject spending the last required build card on a loose capture');
  }

  {
    const s = Brasta.createLabState('1v1');
    const played7 = id(s, '7', 'hearts');
    const retained7 = id(s, '7', 'spades');
    const buildCard = id(s, '7', 'diamonds');
    s.players[0].hand = [played7, retained7];
    s.builds = [{ id: 'owned-b7', kind: 'numeric', declaredValue: 7, groups: [[buildCard]], modifiers: [], ownerSeat: 1 } as any];

    const legal = Brasta.legalActionsForCard(s, 1, played7).map((action) => action.type);
    assert(legal.includes('PLAY_LOOSE'), 'one 7 may be played away when another 7 is retained for BUILD 7');
  }

  console.log('4 build ownership regression tests passed');
}
