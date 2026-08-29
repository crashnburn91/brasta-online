class FakeSocket {
  messages: any[] = [];
  closed = false;

  send(data: string): void {
    this.messages.push(JSON.parse(data));
  }

  close(): void {
    this.closed = true;
  }

  latest(type: string): any {
    return [...this.messages].reverse().find((message) => message?.type === type);
  }
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type ServerApi = typeof import('../lib/brasta-server');

async function send(server: ServerApi, conn: any, message: object): Promise<void> {
  await server.handleMessage(conn, JSON.stringify(message));
}

function publicState(update: any) {
  const state = update?.state;
  assert(state, 'ROOM_STATE did not include game state');
  return {
    phase: state.phase,
    round: state.round,
    starterSeat: state.starterSeat,
    currentSeat: state.currentSeat,
    loose: [...state.loose],
    builds: JSON.parse(JSON.stringify(state.builds)),
    score: JSON.parse(JSON.stringify(state.score)),
    event: state.event,
    lastMove: state.lastMove,
  };
}

function assertSynced(hostSocket: FakeSocket, guestSocket: FakeSocket, expectedPhase: string): void {
  const host = hostSocket.latest('ROOM_STATE');
  const guest = guestSocket.latest('ROOM_STATE');
  assert(host && guest, 'Both players must receive ROOM_STATE');
  assert(host.update.room.revision === guest.update.room.revision, `Revision mismatch: ${host.update.room.revision} vs ${guest.update.room.revision}`);
  assert(host.update.state?.phase === expectedPhase, `Host expected phase ${expectedPhase}, got ${host.update.state?.phase}`);
  assert(guest.update.state?.phase === expectedPhase, `Guest expected phase ${expectedPhase}, got ${guest.update.state?.phase}`);
  assert(JSON.stringify(publicState(host.update)) === JSON.stringify(publicState(guest.update)), 'Players disagree on public game state');
}

async function runOpeningScenario(server: ServerApi, choice: 'keep' | 'put'): Promise<void> {
  const hostSocket = new FakeSocket();
  const guestSocket = new FakeSocket();
  const host = await server.registerSocket(hostSocket);
  const guest = await server.registerSocket(guestSocket);

  await send(server, host, { type: 'CREATE_ROOM', name: `Host-${choice}`, mode: '1v1', targetScore: 110 });
  const hostSession = hostSocket.latest('SESSION')?.session;
  assert(hostSession?.code && hostSession?.token, 'Host session was not created');

  await send(server, guest, { type: 'JOIN_ROOM', code: hostSession.code, name: `Guest-${choice}` });
  const guestSession = guestSocket.latest('SESSION')?.session;
  assert(guestSession?.token, 'Guest session was not created');

  await send(server, host, { type: 'START_GAME' });
  assertSynced(hostSocket, guestSocket, 'openingChoice');

  const beforeOpening = hostSocket.latest('ROOM_STATE');
  assert(beforeOpening.update.state.starterSeat === 1, 'Seat 1 should start round one');
  assert(beforeOpening.update.state.players[0].hand.length === 4, 'Starter should have four cards before opening choice');

  await send(server, host, { type: 'OPENING_CHOICE', choice });
  assertSynced(hostSocket, guestSocket, 'play');

  const hostAfterOpening = hostSocket.latest('ROOM_STATE');
  const guestAfterOpening = guestSocket.latest('ROOM_STATE');
  assert(hostAfterOpening.update.state.loose.length === 4, `${choice}: opening board must contain four cards`);
  assert(hostAfterOpening.update.state.players.find((p: any) => p.seat === 1)?.hand.length === 4, `${choice}: host must have four cards after opening`);
  assert(guestAfterOpening.update.state.players.find((p: any) => p.seat === 2)?.hand.length === 4, `${choice}: guest must have four cards after opening`);
  assert(hostAfterOpening.update.state.loose.every((id: string) => hostAfterOpening.update.state.cards[id]?.rank !== 'J'), `${choice}: opening board contains a Jack`);

  // Progress the live hand before disconnecting. This makes the reconnect test
  // prove that we restore the current authoritative hand, not just the initial
  // post-opening snapshot.
  const hostPlayer = hostAfterOpening.update.state.players.find((p: any) => p.seat === 1);
  assert(hostPlayer?.hand?.length, `${choice}: host hand missing before progress test`);
  const nonJack = hostPlayer.hand.find((id: string) => hostAfterOpening.update.state.cards[id]?.rank !== 'J');
  const playCard = nonJack || hostPlayer.hand[0];
  const playRank = hostAfterOpening.update.state.cards[playCard]?.rank;
  const revisionBeforePlay = hostAfterOpening.update.room.revision;
  await send(server, host, {
    type: 'COMMAND',
    command: playRank === 'J'
      ? { type: 'JACK_ACTION', seat: 1, cardId: playCard }
      : { type: 'PLAY_LOOSE', seat: 1, cardId: playCard },
  });
  assertSynced(hostSocket, guestSocket, 'play');

  const hostAfterPlay = hostSocket.latest('ROOM_STATE');
  const guestAfterPlay = guestSocket.latest('ROOM_STATE');
  assert(hostAfterPlay.update.room.revision === revisionBeforePlay + 1, `${choice}: gameplay did not advance room revision`);
  assert(hostAfterPlay.update.state.currentSeat === 2, `${choice}: turn did not advance to guest after host move`);
  const authoritativeAfterPlay = JSON.stringify(publicState(hostAfterPlay.update));
  const revisionAfterPlay = hostAfterPlay.update.room.revision;
  const guestHandBeforeReconnect = [...guestAfterPlay.update.state.players.find((p: any) => p.seat === 2).hand];

  await server.unregisterSocket(guest);

  const reconnectSocket = new FakeSocket();
  const reconnect = await server.registerSocket(reconnectSocket);
  await send(server, reconnect, {
    type: 'JOIN_ROOM',
    code: hostSession.code,
    name: `Guest-${choice}`,
    token: guestSession.token,
  });

  const reconnectedSession = reconnectSocket.latest('SESSION')?.session;
  const reconnectedRoom = reconnectSocket.latest('ROOM_STATE');
  assert(reconnectedSession?.token === guestSession.token, `${choice}: reconnect token changed`);
  assert(reconnectedRoom, `${choice}: reconnect did not receive ROOM_STATE`);
  assert(reconnectedRoom.update.room.revision === revisionAfterPlay, `${choice}: reconnect changed or rewound game revision`);
  assert(reconnectedRoom.update.state?.phase === 'play', `${choice}: reconnect did not restore play phase`);
  assert(JSON.stringify(publicState(reconnectedRoom.update)) === authoritativeAfterPlay, `${choice}: reconnect did not restore the latest progressed hand`);
  const guestHandAfterReconnect = [...reconnectedRoom.update.state.players.find((p: any) => p.seat === 2).hand];
  assert(JSON.stringify(guestHandAfterReconnect) === JSON.stringify(guestHandBeforeReconnect), `${choice}: reconnect did not restore the same private hand`);

  // The still-connected opponent must remain on the exact same revision/state;
  // reconnecting one player must never require the other player to refresh.
  const hostAfterReconnect = hostSocket.latest('ROOM_STATE');
  assert(hostAfterReconnect.update.room.revision === revisionAfterPlay, `${choice}: opponent revision changed during reconnect`);
  assert(JSON.stringify(publicState(hostAfterReconnect.update)) === authoritativeAfterPlay, `${choice}: opponent state changed during reconnect`);

  await server.unregisterSocket(reconnect);
  await server.unregisterSocket(host);
}

async function runSignedHostBotStartScenario(server: ServerApi): Promise<void> {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('/auth/v1/user')) {
      return new Response(JSON.stringify({ id: 'signed-host-user', email: 'host@example.test' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url.includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{ username: 'SignedHost', display_name: 'Signed Host', avatar_url: null }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    const hostSocket = new FakeSocket();
    const botSocket = new FakeSocket();
    const host = await server.registerSocket(hostSocket);
    const bot = await server.registerSocket(botSocket);

    await send(server, host, {
      type: 'CREATE_ROOM',
      name: 'SignedHost',
      mode: '1v1',
      targetScore: 110,
      accessToken: 'test-access-token-signed-host-1234567890',
    });
    const hostSession = hostSocket.latest('SESSION')?.session;
    assert(hostSession?.code, 'Signed host room was not created');

    await send(server, bot, { type: 'JOIN_ROOM', code: hostSession.code, name: 'Brasta Bot' });
    assert(botSocket.latest('SESSION')?.session?.seat === 2, 'Bot did not join seat 2');

    await send(server, host, { type: 'START_GAME' });
    assertSynced(hostSocket, botSocket, 'openingChoice');

    await server.unregisterSocket(bot);
    await server.unregisterSocket(host);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function main(): Promise<void> {
  delete process.env.REDIS_URL;
  const server = await import('../lib/brasta-server');
  await runOpeningScenario(server, 'keep');
  await runOpeningScenario(server, 'put');
  await runSignedHostBotStartScenario(server);
  console.log('3 online reconnect/start integration scenarios passed');
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
