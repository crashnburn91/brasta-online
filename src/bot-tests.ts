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

  {
    const state = Brasta.createLabState('1v1');
    state.currentSeat = 2;
    const human = state.players.find((p) => p.seat === 1)!;
    const bot = state.players.find((p) => p.seat === 2)!;
    human.name = 'Donny';
    bot.name = 'Brasta Bot';

    const five = card(state, '5', 'hearts');
    const nine = card(state, '9', 'spades');
    const two = card(state, '2', 'hearts');
    const three = card(state, '3', 'diamonds');
    bot.hand = [five, nine];
    state.loose = [two, three];
    state.builds = [{
      id: 'human-build-8',
      kind: 'numeric',
      declaredValue: 8,
      groups: [[card(state, '4', 'clubs'), card(state, '4', 'diamonds')]],
      modifiers: [],
    }];
    state.lastMove = 'Donny made BUILD 8 with 4♣ + 4♦.';

    const command = BrastaBot.chooseCommand(state, 2);
    assert(command?.type === 'PLAY_LOOSE', `Bot should avoid exposing a guaranteed opponent Brasta, got ${command?.type || 'none'}`);
    const result = Brasta.applyCommand(state, command);
    assert(result.ok, result.error || 'Safer bot play was illegal');
    assert(!(result.state.loose.length === 0 && result.state.builds.length === 1), 'Bot left the opponent a build-only Brasta');
  }

  {
    const state = Brasta.createLabState('1v1');
    state.currentSeat = 2;
    const bot = state.players.find((p) => p.seat === 2)!;
    const eight = card(state, '8', 'hearts');
    const six = card(state, '6', 'spades');
    const three = card(state, '3', 'clubs');
    const five = card(state, '5', 'diamonds');
    bot.hand = [eight, six];
    state.loose = [three, five];
    state.builds = [{
      id: 'build-8-clear',
      kind: 'numeric',
      declaredValue: 8,
      groups: [[card(state, '4', 'clubs'), card(state, '4', 'diamonds')]],
      modifiers: [],
    }];

    const command = BrastaBot.chooseCommand(state, 2);
    assert(command?.type === 'CAPTURE_BUILD', `Bot should capture the build, got ${command?.type || 'none'}`);
    assert(command.cardId === eight, 'Bot should use the 8 to capture BUILD 8');
    assert(command.looseIds.includes(three) && command.looseIds.includes(five), 'Bot should include the compatible loose 3 + 5 with the build capture');
    const result = Brasta.applyCommand(state, command);
    assert(result.ok, result.error || 'Build + loose capture was illegal');
    assert(result.state.builds.length === 0 && result.state.loose.length === 0, 'Bot should clear the whole table');
    assert(result.state.roundStats.brastas.B === 1, 'Bot should earn Brasta for the full table clear');
  }

  console.log('5 bot regression tests passed');
}
