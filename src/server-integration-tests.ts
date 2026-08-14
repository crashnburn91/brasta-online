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

  const hostAfter = hostSocket.latest('ROOM_STATE');
  const guestAfter = guestSocket.latest('ROOM_STATE');
  assert(hostAfter.update.state.loose.length === 4, `${choice}: opening board must contain four cards`);
  assert(hostAfter.update.state.players.find((p: any) => p.seat === 1)?.hand.length === 4, `${choice}: host must have four cards after opening`);
  assert(guestAfter.update.state.players.find((p: any) => p.seat === 2)?.hand.length === 4, `${choice}: guest must have four cards after opening`);
  assert(hostAfter.update.state.loose.every((id: string) => hostAfter.update.state.cards[id]?.rank !== 'J'), `${choice}: opening board contains a Jack`);

  const revisionAfterOpening = guestAfter.update.room.revision;
  const guestHandBeforeReconnect = [...guestAfter.update.state.players.find((p: any) => p.seat === 2).hand];

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
  assert(reconnectedRoom.update.room.revision === revisionAfterOpening, `${choice}: reconnect changed game revision unexpectedly`);
  assert(reconnectedRoom.update.state?.phase === 'play', `${choice}: reconnect did not restore play phase`);
  const guestHandAfterReconnect = [...reconnectedRoom.update.state.players.find((p: any) => p.seat === 2).hand];
  assert(JSON.stringify(guestHandAfterReconnect) === JSON.stringify(guestHandBeforeReconnect), `${choice}: reconnect did not restore the same hand`);

  await server.unregisterSocket(reconnect);
  await server.unregisterSocket(host);
}

async function main(): Promise<void> {
  delete process.env.REDIS_URL;
  const server = await import('../lib/brasta-server');
  await runOpeningScenario(server, 'keep');
  await runOpeningScenario(server, 'put');
  console.log('2 online opening sync/reconnect integration scenarios passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
