(() => {
  'use strict';

  if (window.__BRASTA_HARD_BOT__) return;
  window.__BRASTA_HARD_BOT__ = true;

  const DIFFICULTY_KEY = 'brasta-bot-difficulty';
  const BOT_NAME = 'Brasta Bot';
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  function difficulty() {
    try {
      const value = localStorage.getItem(DIFFICULTY_KEY);
      return value === 'expert' ? 'expert' : value === 'hard' ? 'hard' : 'normal';
    } catch { return 'normal'; }
  }

  function capturedByEither(state, cardId) {
    return !!state && (state.captured?.A?.includes(cardId) || state.captured?.B?.includes(cardId));
  }

  function specialRankExposure(state, command) {
    if (!state || command?.type !== 'PLAY_LOOSE') return false;
    const card = state.cards?.[command.cardId];
    if (!card) return false;
    if (card.rank === '10') return !capturedByEither(state, '10-diamonds');
    if (card.rank === '2') return !capturedByEither(state, '2-clubs');
    return false;
  }

  function isBigCardLoose(state, command) {
    return !!state && command?.type === 'PLAY_LOOSE' && (command.cardId === '10-diamonds' || command.cardId === '2-clubs');
  }

  function playerHand(state, seat) {
    return state?.players?.find((player) => player.seat === seat)?.hand || [];
  }

  function burnedJackOnMove(before, after, seat, command) {
    if (!before || !after || command?.type !== 'JACK_ACTION' || !window.Brasta?.teamForSeat) return false;
    const team = window.Brasta.teamForSeat(before.mode, seat);
    return (after.roundStats?.burnedJacks?.[team] || 0) > (before.roundStats?.burnedJacks?.[team] || 0);
  }

  function tableCanBeClearedByOneCard(state) {
    if (!state || state.phase !== 'play') return false;
    if (!state.loose?.length && !state.builds?.length) return false;
    if ((state.builds?.length || 0) > 1) return false;

    if (state.builds?.length === 1) {
      const build = state.builds[0];
      if (!state.loose?.length) return true;
      if (build.kind === 'numeric' && build.declaredValue != null) {
        return !!window.Brasta?.partitionNumeric?.(state, state.loose, build.declaredValue);
      }
      if (build.kind === 'rank' && build.declaredRank) {
        return state.loose.every((id) => state.cards?.[id]?.rank === build.declaredRank);
      }
      return false;
    }

    const loose = state.loose || [];
    if (loose.length <= 1) return false;
    const ranks = loose.map((id) => state.cards?.[id]?.rank).filter(Boolean);
    if (ranks.length === loose.length && (ranks.every((rank) => rank === 'Q') || ranks.every((rank) => rank === 'K'))) return true;

    const allNumeric = loose.every((id) => state.cards?.[id]?.value != null);
    if (!allNumeric || !window.Brasta?.partitionNumeric) return false;
    for (let target = 1; target <= 10; target++) {
      if (window.Brasta.partitionNumeric(state, loose, target)) return true;
    }
    return false;
  }

  function capturedSpecialBonus(before, after, seat) {
    if (!before || !after || !window.Brasta?.teamForSeat) return 0;
    const team = window.Brasta.teamForSeat(before.mode, seat);
    const beforeIds = new Set(before.captured?.[team] || []);
    let bonus = 0;
    for (const id of after.captured?.[team] || []) {
      if (beforeIds.has(id)) continue;
      if (id === '10-diamonds' || id === '2-clubs') bonus += 120;
    }
    return bonus;
  }

  function cardIdsInBuild(build) {
    return [...(build?.groups || []).flat(), ...(build?.modifiers || [])];
  }

  // Expert only counts information a real player could know: its own hand, the
  // table/builds, and captured cards. Hidden opponent hands and the deck are never inspected.
  function publicKnownIds(state, seat) {
    const ids = new Set();
    for (const id of playerHand(state, seat)) if (state.cards?.[id]) ids.add(id);
    for (const id of state.loose || []) if (state.cards?.[id]) ids.add(id);
    for (const build of state.builds || []) for (const id of cardIdsInBuild(build)) if (state.cards?.[id]) ids.add(id);
    for (const team of ['A', 'B']) for (const id of state.captured?.[team] || []) if (state.cards?.[id]) ids.add(id);
    return ids;
  }

  function rankCounts(state, seat) {
    const counts = {};
    for (const id of publicKnownIds(state, seat)) {
      const rank = state.cards?.[id]?.rank;
      if (rank) counts[rank] = (counts[rank] || 0) + 1;
    }
    return counts;
  }

  function unseenOfRank(state, seat, rank) {
    return Math.max(0, 4 - (rankCounts(state, seat)[rank] || 0));
  }

  function unseenCardsWithValue(state, seat, value) {
    const counts = rankCounts(state, seat);
    let unseen = 0;
    for (const rank of ['A','2','3','4','5','6','7','8','9','10']) {
      const sample = Object.values(state.cards || {}).find((card) => card.rank === rank);
      if (sample?.value === value) unseen += Math.max(0, 4 - (counts[rank] || 0));
    }
    return unseen;
  }

  function expertExposurePenalty(after, seat) {
    let penalty = 0;
    const seenLoose = new Set();
    for (const id of after.loose || []) {
      const card = after.cards?.[id];
      if (!card) continue;
      if ((card.rank === 'Q' || card.rank === 'K') && !seenLoose.has(card.rank)) {
        seenLoose.add(card.rank);
        penalty += unseenOfRank(after, seat, card.rank) * 24;
      }
    }

    // Count how many unseen numeric capture cards can plausibly take an exposed
    // numeric set. This lets Expert become bolder as those values are exhausted.
    if (window.Brasta?.findNumericSubsets) {
      for (let target = 1; target <= 10; target++) {
        const subsets = window.Brasta.findNumericSubsets(after, after.loose || [], target);
        if (subsets?.length) penalty += unseenCardsWithValue(after, seat, target) * 7;
      }
    }
    return penalty;
  }

  function commandCapturesOwnBuild(state, seat, command) {
    if (command?.type !== 'CAPTURE_BUILD') return null;
    const build = (state.builds || []).find((candidate) => candidate.id === command.buildId);
    return build?.ownerSeat === seat ? build : null;
  }

  function expertBuildPatiencePenalty(state, after, seat, command, memory) {
    const build = commandCapturesOwnBuild(state, seat, command);
    if (!build) return 0;
    const team = window.Brasta?.teamForSeat?.(state.mode, seat);
    if (!team) return 0;

    // Never delay an actual Brasta. The whole point of waiting is to improve the
    // chance that this eventual pickup clears the table.
    const beforeBrastas = state.roundStats?.brastas?.[team] || 0;
    const afterBrastas = after.roundStats?.brastas?.[team] || 0;
    if (afterBrastas > beforeBrastas) return 0;

    const born = memory?.buildBorn?.get(build.id);
    const age = born == null || memory?.revision == null ? 99 : Math.max(0, memory.revision - born);
    const handSize = playerHand(state, seat).length;

    // A build that was just created/extended should generally be left down for at
    // least another trip around the table if a safe alternative exists.
    if (handSize > 1 && age <= 3) return 320;
    if (handSize > 1) return 90;
    return 0;
  }

  function evaluateChoices(state, seat) {
    const bot = window.BrastaBot;
    const engine = window.Brasta;
    if (!state || !seat || !bot?.commandCandidates || !bot?.scoreCommand || !engine?.applyCommand) return [];
    return bot.commandCandidates(state, seat).map((command) => {
      const result = engine.applyCommand(state, command);
      if (!result?.ok) return null;
      return {
        command,
        after: result.state,
        score: bot.scoreCommand(state, seat, command) + capturedSpecialBonus(state, result.state, seat),
        brastaRisk: tableCanBeClearedByOneCard(result.state),
        specialExposure: specialRankExposure(state, command),
        bigCardLoose: isBigCardLoose(state, command),
        jackBurn: burnedJackOnMove(state, result.state, seat, command),
        key: JSON.stringify(command),
      };
    }).filter(Boolean);
  }

  function hardPool(state, seat, evaluated) {
    const handSize = playerHand(state, seat).length;
    let pool = evaluated;
    if (handSize > 1) {
      const preservesBigCards = pool.filter((entry) => !entry.bigCardLoose);
      if (preservesBigCards.length) pool = preservesBigCards;
      const avoidsBurningJack = pool.filter((entry) => !entry.jackBurn);
      if (avoidsBurningJack.length) pool = avoidsBurningJack;
    }

    const hasBrastaSafeMove = pool.some((entry) => !entry.brastaRisk);
    const hasSpecialSafeMove = pool.some((entry) => !entry.specialExposure);
    for (const entry of pool) {
      if (entry.brastaRisk) entry.score -= hasBrastaSafeMove ? 10000 : 325;
      if (entry.specialExposure) entry.score -= hasSpecialSafeMove ? 7000 : 220;
      if (entry.bigCardLoose && handSize > 1) entry.score -= 20000;
      if (entry.jackBurn && handSize > 1) entry.score -= 20000;
    }
    return pool;
  }

  function hardChoice(state, seat, fallbackCommand) {
    const evaluated = evaluateChoices(state, seat);
    if (!evaluated.length) return fallbackCommand;
    const pool = hardPool(state, seat, evaluated);
    pool.sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
    return pool[0]?.command || fallbackCommand;
  }

  function expertChoice(state, seat, fallbackCommand, memory) {
    const evaluated = evaluateChoices(state, seat);
    if (!evaluated.length) return fallbackCommand;
    let pool = hardPool(state, seat, evaluated);

    for (const entry of pool) {
      entry.score -= expertExposurePenalty(entry.after, seat);
      entry.score -= expertBuildPatiencePenalty(state, entry.after, seat, entry.command, memory);

      // When throwing a card loose, card counting directly changes the risk: a
      // rank with three publicly-known copies gone is far safer than one with none.
      if (entry.command.type === 'PLAY_LOOSE') {
        const card = state.cards?.[entry.command.cardId];
        if (card) entry.score -= unseenOfRank(state, seat, card.rank) * 18;
      }
    }

    // If at least one alternative avoids immediately collecting a fresh owned
    // build, make that a strong preference. This is intentionally not absolute:
    // Brasta, end-of-hand necessities, or no legal alternative can override it.
    const alternatives = pool.filter((entry) => expertBuildPatiencePenalty(state, entry.after, seat, entry.command, memory) < 300);
    if (alternatives.length) pool = alternatives;

    pool.sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
    return pool[0]?.command || fallbackCommand;
  }

  function TrackingWebSocket(url, protocols) {
    const socket = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    const meta = { isBot: false, seat: null, state: null, revision: null, buildBorn: new Map() };
    const nativeSend = socket.send.bind(socket);

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data || ''));
        if (!meta.isBot) return;
        if (message?.type === 'SESSION' && message.session?.seat) meta.seat = message.session.seat;
        if (message?.type === 'ROOM_STATE') {
          meta.state = message.update?.state || null;
          meta.revision = Number.isFinite(message.update?.room?.revision) ? message.update.room.revision : meta.revision;
          if (meta.state && meta.seat && meta.revision != null) {
            const live = new Set();
            for (const build of meta.state.builds || []) {
              if (build.ownerSeat !== meta.seat) continue;
              live.add(build.id);
              if (!meta.buildBorn.has(build.id)) meta.buildBorn.set(build.id, meta.revision);
            }
            for (const id of [...meta.buildBorn.keys()]) if (!live.has(id)) meta.buildBorn.delete(id);
          }
        }
      } catch {}
    });

    socket.send = (data) => {
      try {
        const message = JSON.parse(String(data || ''));
        if (message?.type === 'JOIN_ROOM' && String(message.name || '') === BOT_NAME) meta.isBot = true;
        if (message?.type === 'COMMAND' && meta.isBot && meta.state && meta.seat) {
          const level = difficulty();
          if (level === 'expert') message.command = expertChoice(meta.state, meta.seat, message.command, meta);
          else if (level === 'hard') message.command = hardChoice(meta.state, meta.seat, message.command);
          else return nativeSend(data);
          return nativeSend(JSON.stringify(message));
        }
      } catch {}
      return nativeSend(data);
    };

    return socket;
  }

  TrackingWebSocket.prototype = NativeWebSocket.prototype;
  try { Object.setPrototypeOf(TrackingWebSocket, NativeWebSocket); } catch {}
  window.WebSocket = TrackingWebSocket;

  window.BrastaHardBot = {
    hardChoice,
    expertChoice,
    tableCanBeClearedByOneCard,
    specialRankExposure,
    isBigCardLoose,
    burnedJackOnMove,
    rankCounts,
    unseenOfRank,
  };
})();
