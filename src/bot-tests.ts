namespace BrastaBotTests {
  function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
  }

  function card(state: Brasta.GameState, rank: Brasta.Rank, suit: Brasta.Suit): string {
    const id = `${rank}-${suit}`;
    assert(!!state.cards[id], `Missing card ${id}`);
    return id;
  }

  {
    const state = Brasta.createLabState('1v1');
    state.currentSeat = 2;
    const five = card(state, '5', 'hearts');
    const nine = card(state, '9', 'spades');
    const big2 = card(state, '2', 'clubs');
    const three = card(state, '3', 'diamonds');
    state.players.find((p) => p.seat === 2)!.hand = [five, nine];
    state.loose = [big2, three];

    const command = BrastaBot.chooseCommand(state, 2);
    assert(command?.type === 'CAPTURE_LOOSE', `Expected capture, got ${command?.type || 'none'}`);
    assert(command.cardId === five, 'Bot should use the 5 to capture 2♣ + 3♦');
    assert(command.looseIds.includes(big2) && command.looseIds.includes(three), 'Bot capture should include Big 2 and 3♦');
    const result = Brasta.applyCommand(state, command);
    assert(result.ok, result.error || 'Bot chose an illegal capture');
  }

  {
    const state = Brasta.createLabState('1v1');
    state.currentSeat = 2;
    const jack = card(state, 'J', 'hearts');
    const four = card(state, '4', 'hearts');
    state.players.find((p) => p.seat === 2)!.hand = [jack, four];
    state.loose = [];
    state.builds = [{ id: 'build-8', kind: 'numeric', declaredValue: 8, groups: [[card(state, '8', 'clubs')]], modifiers: [] }];

    const command = BrastaBot.chooseCommand(state, 2);
    assert(command?.type === 'PLAY_LOOSE' && command.cardId === four, 'Bot should avoid burning a Jack when a normal play is available');
    const result = Brasta.applyCommand(state, command);
    assert(result.ok, result.error || 'Bot chose an illegal fallback play');
  }

  {
    const state = Brasta.startMatch('1v1', 2222, 110);
    const bot = state.players.find((p) => p.seat === 2)!;
    bot.hand = [card(state, '2', 'clubs'), card(state, 'J', 'spades'), card(state, '7', 'hearts'), card(state, '8', 'diamonds')];
    assert(BrastaBot.chooseOpening(state, 2) === 'keep', 'Bot should keep a strong opening hand');

    bot.hand = [card(state, '3', 'hearts'), card(state, '4', 'diamonds'), card(state, '6', 'spades'), card(state, '9', 'hearts')];
    assert(BrastaBot.chooseOpening(state, 2) === 'put', 'Bot should put down a weak opening hand');
  }

  console.log('3 bot regression tests passed');
}
