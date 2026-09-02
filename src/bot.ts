namespace BrastaBot {
  type BotSession = { code: string; token: string; name: string; seat: Brasta.Seat };
  type BotRoomUpdate = {
    room: { code: string; revision: number; started: boolean; players: Array<{ seat: Brasta.Seat; name: string; occupied: boolean; connected: boolean }> };
    you: { seat: Brasta.Seat | null; name: string; role: string };
    state: Brasta.GameState | null;
  };

  const BOT_NAME = 'Brasta Bot';
  const PENDING_KEY = 'brasta-bot-pending';
  const SESSION_PREFIX = 'brasta-bot-session:';
  const THINK_MS = 700;

  let socket: WebSocket | null = null;
  let currentCode = '';
  let session: BotSession | null = null;
  let latestUpdate: BotRoomUpdate | null = null;
  let reconnectWanted = false;
  let reconnectTimer: number | null = null;
  let pingTimer: number | null = null;
  let actionTimer: number | null = null;
  let lastActionKey = '';

  function normalizeCode(code: string): string {
    return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function sessionKey(code: string): string { return `${SESSION_PREFIX}${normalizeCode(code)}`; }

  function loadSession(code: string): BotSession | null {
    try {
      const raw = localStorage.getItem(sessionKey(code));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BotSession;
      if (!parsed?.token || !parsed?.code || !parsed?.seat) return null;
      return parsed;
    } catch { return null; }
  }

  function saveSession(value: BotSession): void {
    try { localStorage.setItem(sessionKey(value.code), JSON.stringify(value)); } catch {}
  }

  function clearSession(code: string): void {
    try { localStorage.removeItem(sessionKey(code)); } catch {}
  }

  function pendingBot(): boolean {
    try { return localStorage.getItem(PENDING_KEY) === '1'; } catch { return false; }
  }

  function setPending(value: boolean): void {
    try {
      if (value) localStorage.setItem(PENDING_KEY, '1');
      else localStorage.removeItem(PENDING_KEY);
    } catch {}
  }

  function currentRoomCode(): string {
    if (typeof location === 'undefined') return '';
    const params = new URLSearchParams(location.search);
    return normalizeCode(params.get('room') || '');
  }

  function botPlayer(state: Brasta.GameState, seat: Brasta.Seat): Brasta.PlayerState | null {
    return state.players.find((player) => player.seat === seat) || null;
  }

  function cardUtility(state: Brasta.GameState, id: string): number {
    const card = state.cards[id];
    if (!card) return 0;
    let score = 1;
    if (card.rank === '2' && card.suit === 'clubs') score += 90;
    if (card.rank === '10' && card.suit === 'diamonds') score += 90;
    if (card.rank === 'A') score += 12;
    if (card.rank === 'J') score += 10;
    if (card.suit === 'clubs') score += 4;
    return score;
  }

  function setUtility(state: Brasta.GameState, ids: string[]): number {
    return ids.reduce((sum, id) => sum + cardUtility(state, id), 0);
  }

  function dedupeSets(sets: string[][]): string[][] {
    const seen = new Set<string>();
    const out: string[][] = [];
    for (const ids of sets) {
      const normalized = [...ids].sort();
      const key = normalized.join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(ids);
    }
    return out;
  }

  function numericCaptureOptions(state: Brasta.GameState, target: number): string[][] {
    const numericLoose = state.loose.filter((id) => state.cards[id]?.value != null);
    const options: string[][] = [...Brasta.findNumericSubsets(state, numericLoose, target)];

    if (numericLoose.length <= 12) {
      const limit = 1 << numericLoose.length;
      for (let mask = 1; mask < limit; mask++) {
        const ids: string[] = [];
        let total = 0;
        for (let i = 0; i < numericLoose.length; i++) {
          if (!(mask & (1 << i))) continue;
          const id = numericLoose[i];
          ids.push(id);
          total += state.cards[id].value || 0;
        }
        if (total < target || total % target !== 0) continue;
        if (Brasta.partitionNumeric(state, ids, target)) options.push(ids);
      }
    } else {
      let remaining = [...numericLoose];
      const union: string[] = [];
      for (let guard = 0; guard < 12; guard++) {
        const subsets = Brasta.findNumericSubsets(state, remaining, target);
        if (!subsets.length) break;
        subsets.sort((a, b) => setUtility(state, b) - setUtility(state, a) || b.length - a.length);
        const chosen = subsets[0];
        union.push(...chosen);
        const used = new Set(chosen);
        remaining = remaining.filter((id) => !used.has(id));
      }
      if (union.length) options.push(union);
    }

    return dedupeSets(options)
      .sort((a, b) => setUtility(state, b) - setUtility(state, a) || b.length - a.length)
      .slice(0, 16);
  }

  function exactNumericOptions(state: Brasta.GameState, target: number): string[][] {
    if (target === 0) return [[]];
    return Brasta.findNumericSubsets(state, state.loose, target)
      .sort((a, b) => setUtility(state, b) - setUtility(state, a) || b.length - a.length)
      .slice(0, 8);
  }

  function addCandidate(list: Brasta.Command[], seen: Set<string>, command: Brasta.Command): void {
    const key = JSON.stringify(command);
    if (seen.has(key)) return;
    seen.add(key);
    list.push(command);
  }

  export function commandCandidates(state: Brasta.GameState, seat: Brasta.Seat): Brasta.Command[] {
    if (state.phase !== 'play' || state.currentSeat !== seat) return [];
    const player = botPlayer(state, seat);
    if (!player) return [];

    const candidates: Brasta.Command[] = [];
    const seen = new Set<string>();

    for (const cardId of player.hand) {
      const card = state.cards[cardId];
      if (!card) continue;
      const legal = new Set(Brasta.legalActionsForCard(state, seat, cardId).map((action) => action.type));

      if (legal.has('PLAY_LOOSE')) addCandidate(candidates, seen, { type: 'PLAY_LOOSE', seat, cardId });
      if (legal.has('JACK_SWEEP') || legal.has('BURN_JACK')) addCandidate(candidates, seen, { type: 'JACK_ACTION', seat, cardId });

      if (legal.has('CAPTURE_LOOSE')) {
        if (card.value != null) {
          for (const looseIds of numericCaptureOptions(state, card.value)) {
            addCandidate(candidates, seen, { type: 'CAPTURE_LOOSE', seat, cardId, looseIds });
          }
        } else if (card.rank === 'Q' || card.rank === 'K') {
          const looseIds = state.loose.filter((id) => state.cards[id]?.rank === card.rank);
          if (looseIds.length) addCandidate(candidates, seen, { type: 'CAPTURE_LOOSE', seat, cardId, looseIds });
        }
      }

      if (legal.has('MAKE_BUILD')) {
        for (const declaration of Brasta.getBuildDeclarationOptions(state, seat, cardId)) {
          if (declaration.kind === 'numeric' && declaration.value != null && card.value != null) {
            const need = declaration.value === card.value ? declaration.value : declaration.value - card.value;
            for (const looseIds of exactNumericOptions(state, need)) {
              if (!looseIds.length) continue;
              addCandidate(candidates, seen, { type: 'MAKE_BUILD', seat, cardId, declaredValue: declaration.value, looseIds });
            }
          } else if (declaration.kind === 'rank' && declaration.rank) {
            const looseIds = state.loose.filter((id) => state.cards[id]?.rank === declaration.rank);
            if (looseIds.length) addCandidate(candidates, seen, { type: 'MAKE_BUILD', seat, cardId, declaredRank: declaration.rank, looseIds });
          }
        }
      }

      if (legal.has('ADD_TO_BUILD')) {
        for (const build of Brasta.getAddableBuilds(state, seat, cardId)) {
          if (build.kind === 'numeric' && build.declaredValue != null && card.value != null) {
            const need = build.declaredValue - card.value;
            for (const looseIds of exactNumericOptions(state, need)) {
              addCandidate(candidates, seen, { type: 'ADD_TO_BUILD', seat, cardId, buildId: build.id, looseIds });
            }
          } else if (build.kind === 'rank' && build.declaredRank) {
            const looseIds = state.loose.filter((id) => state.cards[id]?.rank === build.declaredRank);
            addCandidate(candidates, seen, { type: 'ADD_TO_BUILD', seat, cardId, buildId: build.id, looseIds });
          }
        }
      }

      if (legal.has('RAISE_BUILD')) {
        for (const build of Brasta.getRaiseableBuilds(state, seat, cardId)) {
          addCandidate(candidates, seen, { type: 'RAISE_BUILD', seat, cardId, buildId: build.id });
        }
      }

      if (legal.has('CAPTURE_BUILD')) {
        for (const build of Brasta.getCapturableBuilds(state, cardId)) {
          addCandidate(candidates, seen, { type: 'CAPTURE_BUILD', seat, cardId, buildId: build.id, looseIds: [] });
          if (build.kind === 'numeric' && build.declaredValue != null) {
            for (const looseIds of numericCaptureOptions(state, build.declaredValue).slice(0, 8)) {
              addCandidate(candidates, seen, { type: 'CAPTURE_BUILD', seat, cardId, buildId: build.id, looseIds });
            }
          } else if (build.kind === 'rank' && build.declaredRank) {
            const looseIds = state.loose.filter((id) => state.cards[id]?.rank === build.declaredRank);
            if (looseIds.length) addCandidate(candidates, seen, { type: 'CAPTURE_BUILD', seat, cardId, buildId: build.id, looseIds });
          }
        }
      }
    }

    return candidates;
  }

  function looseCardRisk(state: Brasta.GameState, cardId: string): number {
    const card = state.cards[cardId];
    if (!card) return 0;
    let risk = 0;
    if (card.rank === '2' && card.suit === 'clubs') risk += 80;
    if (card.rank === '10' && card.suit === 'diamonds') risk += 80;
    if (card.rank === 'A') risk += 14;
    if (card.suit === 'clubs') risk += 5;
    if (card.value != null) risk += card.value * 0.15;
    return risk;
  }

  function buildToken(build: Brasta.Build): string {
    return build.kind === 'numeric' ? String(build.declaredValue ?? '') : String(build.declaredRank ?? '');
  }

  function looseCanClearWithBuild(state: Brasta.GameState, build: Brasta.Build): boolean {
    if (!state.loose.length) return true;
    if (build.kind === 'numeric' && build.declaredValue != null) {
      return !!Brasta.partitionNumeric(state, state.loose, build.declaredValue);
    }
    if (build.kind === 'rank' && build.declaredRank) {
      return state.loose.every((id) => state.cards[id]?.rank === build.declaredRank);
    }
    return false;
  }

  function opponentJustProvedBuild(state: Brasta.GameState, seat: Brasta.Seat, build: Brasta.Build): boolean {
    if (state.mode !== '1v1' || !state.lastMove) return false;
    const opponent = state.players.find((player) => player.seat !== seat);
    if (!opponent?.name || !state.lastMove.startsWith(opponent.name)) return false;
    if (!/\b(made|raised|added)\b/i.test(state.lastMove) || !/BUILD/i.test(state.lastMove)) return false;
    const matches = [...state.lastMove.matchAll(/BUILD\s+(10|[1-9]|Q|K)/gi)];
    if (!matches.length) return false;
    const lastBuild = matches[matches.length - 1][1].toUpperCase();
    return lastBuild === buildToken(build).toUpperCase();
  }

  function exposedBrastaPenalty(before: Brasta.GameState, after: Brasta.GameState, seat: Brasta.Seat, command: Brasta.Command): number {
    if (after.phase !== 'play' || after.builds.length !== 1) return 0;
    if (command.type === 'MAKE_BUILD' || command.type === 'ADD_TO_BUILD' || command.type === 'RAISE_BUILD') return 0;

    const build = after.builds[0];
    if (!looseCanClearWithBuild(after, build)) return 0;

    // A lone build plus compatible loose cards is a one-card table clear for whoever holds
    // the matching capture card. If the opponent just made/raised/added to that build, public
    // information guarantees they retained that card, so exposing it is especially dangerous.
    let penalty = 90;
    if (opponentJustProvedBuild(before, seat, build)) penalty += 130;
    if (!after.loose.length) penalty += 20;
    penalty += Math.min(40, setUtility(after, after.loose) * 0.25);
    return penalty;
  }

  export function scoreCommand(state: Brasta.GameState, seat: Brasta.Seat, command: Brasta.Command): number {
    const result = Brasta.applyCommand(state, command);
    if (!result.ok) return Number.NEGATIVE_INFINITY;

    const team = Brasta.teamForSeat(state.mode, seat);
    const beforeCaptured = new Set(state.captured[team]);
    const newCaptured = result.state.captured[team].filter((id) => !beforeCaptured.has(id));
    let score = 0;

    if (command.type === 'CAPTURE_BUILD') score += 60;
    else if (command.type === 'CAPTURE_LOOSE') score += 45;
    else if (command.type === 'JACK_ACTION') score += state.loose.length ? 38 : -180;
    else if (command.type === 'MAKE_BUILD') score += 18;
    else if (command.type === 'ADD_TO_BUILD') score += 22;
    else if (command.type === 'RAISE_BUILD') score += 20;
    else if (command.type === 'PLAY_LOOSE') score -= looseCardRisk(state, command.cardId);

    score += setUtility(state, newCaptured);
    score += newCaptured.length * 2;

    const beforeBrastas = state.roundStats.brastas[team];
    const afterBrastas = result.state.roundStats.brastas[team];
    score += (afterBrastas - beforeBrastas) * 130;

    const beforeBurns = state.roundStats.burnedJacks[team];
    const afterBurns = result.state.roundStats.burnedJacks[team];
    score -= (afterBurns - beforeBurns) * 140;

    if (result.state.lastPickupTeam === team && state.lastPickupTeam !== team) score += 10;
    if ((result.state.event || '').includes('BUILDS COMBINED')) score += 24;

    score -= exposedBrastaPenalty(state, result.state, seat, command);

    const scoreDelta = result.state.score[team] - state.score[team];
    score += scoreDelta * 30;

    if (result.state.phase === 'matchEnd') {
      const other: Brasta.Team = team === 'A' ? 'B' : 'A';
      if (result.state.score[team] > result.state.score[other]) score += 1000;
    }

    return score;
  }

  export function chooseCommand(state: Brasta.GameState, seat: Brasta.Seat): Brasta.Command | null {
    const candidates = commandCandidates(state, seat);
    if (!candidates.length) return null;
    return candidates
      .map((command) => ({ command, score: scoreCommand(state, seat, command), key: JSON.stringify(command) }))
      .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))[0].command;
  }

  export function chooseOpening(state: Brasta.GameState, seat: Brasta.Seat): 'keep' | 'put' {
    const player = botPlayer(state, seat);
    if (!player) return 'keep';
    let score = 0;
    const ranks = new Map<string, number>();
    for (const id of player.hand) {
      const card = state.cards[id];
      if (!card) continue;
      ranks.set(card.rank, (ranks.get(card.rank) || 0) + 1);
      if (card.rank === '2' && card.suit === 'clubs') score += 18;
      if (card.rank === '10' && card.suit === 'diamonds') score += 18;
      if (card.rank === 'J') score += 12;
      if (card.rank === 'A') score += 5;
      if (card.suit === 'clubs') score += 2;
    }
    for (const count of ranks.values()) if (count > 1) score += (count - 1) * 5;
    return score >= 10 ? 'keep' : 'put';
  }

  function send(payload: object): boolean {
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(payload));
    return true;
  }

  function stopPing(): void {
    if (pingTimer != null) {
      clearInterval(pingTimer);
      pingTimer = null;
    }
  }

  function startPing(): void {
    stopPing();
    pingTimer = window.setInterval(() => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'PING' }));
    }, 20000);
  }

  function clearActionTimer(): void {
    if (actionTimer != null) {
      clearTimeout(actionTimer);
      actionTimer = null;
    }
  }

  function actionKey(update: BotRoomUpdate): string {
    const state = update.state;
    if (!state) return `${update.room.revision}:none`;
    return `${update.room.revision}:${state.phase}:${state.currentSeat}:${state.starterSeat}`;
  }

  function scheduleBotTurn(update: BotRoomUpdate): void {
    const state = update.state;
    const botSeat = session?.seat;
    if (!state || !botSeat || !update.room.started) return;

    const shouldOpen = state.phase === 'openingChoice' && state.starterSeat === botSeat;
    const shouldPlay = state.phase === 'play' && state.currentSeat === botSeat;
    if (!shouldOpen && !shouldPlay) return;

    const key = actionKey(update);
    if (key === lastActionKey || actionTimer != null) return;

    actionTimer = window.setTimeout(() => {
      actionTimer = null;
      if (!latestUpdate?.state || actionKey(latestUpdate) !== key || !session) return;
      lastActionKey = key;

      if (shouldOpen) {
        const choice = chooseOpening(latestUpdate.state, session.seat);
        if (!send({ type: 'OPENING_CHOICE', choice })) lastActionKey = '';
        return;
      }

      const command = chooseCommand(latestUpdate.state, session.seat);
      if (!command || !send({ type: 'COMMAND', command })) lastActionKey = '';
    }, THINK_MS);
  }

  function markBotMatchUi(): void {
    const botPresent = !!latestUpdate?.room.players.some((player) => player.name === BOT_NAME) || !!session;
    if (!botPresent) return;

    const eyebrow = document.querySelector<HTMLElement>('.lobby-hero .eyebrow');
    if (eyebrow && eyebrow.textContent !== 'BOT MATCH') eyebrow.textContent = 'BOT MATCH';
    document.querySelectorAll<HTMLElement>('.lobby-hero [data-copy-invite]').forEach((el) => el.remove());

    document.querySelectorAll<HTMLElement>('.lobby-seat .seat-name, .player-chip b').forEach((el) => {
      if (el.textContent?.trim() === BOT_NAME) el.textContent = `${BOT_NAME} 🤖`;
    });
  }

  function handleMessage(message: any): void {
    if (!message || typeof message.type !== 'string') return;

    if (message.type === 'SESSION') {
      const incoming = message.session;
      if (incoming?.role !== 'player' || !incoming?.token || !incoming?.seat || !incoming?.code) return;
      session = { code: normalizeCode(incoming.code), token: String(incoming.token), name: BOT_NAME, seat: incoming.seat as Brasta.Seat };
      currentCode = session.code;
      saveSession(session);
      setPending(false);
      markBotMatchUi();
      return;
    }

    if (message.type === 'ROOM_STATE') {
      latestUpdate = message.update as BotRoomUpdate;
      if (!latestUpdate?.state || latestUpdate.state.currentSeat !== session?.seat) clearActionTimer();
      markBotMatchUi();
      scheduleBotTurn(latestUpdate);
      return;
    }

    if (message.type === 'ROOM_CLOSED') {
      disconnectBot(true);
      return;
    }

    if (message.type === 'ERROR') {
      console.warn('[Brasta bot]', String(message.message || 'Bot request rejected.'));
      lastActionKey = '';
      if (!session && /full|already started|not found/i.test(String(message.message || ''))) setPending(false);
      if (latestUpdate) scheduleBotTurn(latestUpdate);
    }
  }

  function scheduleReconnect(): void {
    if (!reconnectWanted || reconnectTimer != null || !currentCode) return;
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      if (!reconnectWanted || currentRoomCode() !== currentCode) return;
      openSocket(currentCode, loadSession(currentCode));
    }, 1200);
  }

  function openSocket(code: string, saved: BotSession | null): void {
    if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) return;
    if (location.protocol === 'file:') return;

    currentCode = code;
    session = saved;
    reconnectWanted = true;
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
    socket = ws;

    ws.onopen = () => {
      if (socket !== ws) return;
      startPing();
      send({ type: 'JOIN_ROOM', code, name: BOT_NAME, token: saved?.token || undefined });
    };
    ws.onmessage = (event) => {
      try { handleMessage(JSON.parse(String(event.data))); }
      catch (error) { console.warn('[Brasta bot] unreadable message', error); }
    };
    ws.onclose = () => {
      if (socket === ws) socket = null;
      stopPing();
      clearActionTimer();
      lastActionKey = '';
      scheduleReconnect();
    };
    ws.onerror = () => {};
  }

  function disconnectBot(clearStoredSession: boolean): void {
    reconnectWanted = false;
    if (reconnectTimer != null) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    clearActionTimer();
    stopPing();

    const code = currentCode;
    if (clearStoredSession && socket?.readyState === WebSocket.OPEN) {
      try { socket.send(JSON.stringify({ type: 'LEAVE_ROOM' })); } catch {}
    }
    try { socket?.close(); } catch {}
    socket = null;
    latestUpdate = null;
    lastActionKey = '';
    if (clearStoredSession && code) clearSession(code);
    if (clearStoredSession) setPending(false);
    session = null;
    currentCode = '';
  }

  function ensurePlayBotButton(): void {
    if (document.querySelector('[data-play-bot]')) return;
    const createButton = document.querySelector<HTMLButtonElement>('[data-create-room="1v1"]');
    const createName = document.querySelector<HTMLInputElement>('#create-name');
    if (!createButton || !createName) return;

    const row = createButton.closest('.button-row');
    if (!row) return;
    const button = document.createElement('button');
    button.className = 'primary';
    button.dataset.playBot = 'true';
    button.textContent = '🤖 Play vs Bot';
    button.title = 'Play a 1v1 match against the Normal Brasta bot';
    button.addEventListener('click', () => {
      if (!createName.value.trim()) {
        createName.focus();
        return;
      }
      setPending(true);
      createButton.click();
    });
    row.appendChild(button);
  }

  function syncLifecycle(): void {
    ensurePlayBotButton();
    markBotMatchUi();

    const code = currentRoomCode();
    if (!code) {
      if (currentCode) disconnectBot(latestUpdate?.room.started === false);
      return;
    }

    if (currentCode && currentCode !== code) disconnectBot(false);
    const saved = loadSession(code);
    if (saved || pendingBot()) openSocket(code, saved);
  }

  function startBrowserBot(): void {
    const observer = new MutationObserver(syncLifecycle);
    const begin = () => {
      const app = document.getElementById('app');
      if (!app) {
        window.setTimeout(begin, 50);
        return;
      }
      observer.observe(app, { childList: true, subtree: true });
      syncLifecycle();
    };

    window.addEventListener('popstate', syncLifecycle);
    window.addEventListener('pageshow', syncLifecycle);
    window.addEventListener('online', syncLifecycle);
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
  }

  if (typeof window !== 'undefined') startBrowserBot();
}
