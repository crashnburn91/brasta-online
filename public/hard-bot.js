(() => {
  'use strict';

  if (window.__BRASTA_HARD_BOT__) return;
  window.__BRASTA_HARD_BOT__ = true;

  const DIFFICULTY_KEY = 'brasta-bot-difficulty';
  const BOT_NAME = 'Brasta Bot';
  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  function difficulty() {
    try { return localStorage.getItem(DIFFICULTY_KEY) === 'hard' ? 'hard' : 'normal'; }
    catch { return 'normal'; }
  }

  function setDifficulty(value) {
    try { localStorage.setItem(DIFFICULTY_KEY, value === 'hard' ? 'hard' : 'normal'); }
    catch {}
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
    if (!loose.length) return false;

    const ranks = loose.map((id) => state.cards?.[id]?.rank).filter(Boolean);
    if (ranks.length === loose.length && (ranks.every((rank) => rank === 'Q') || ranks.every((rank) => rank === 'K'))) {
      return true;
    }

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

  function hardChoice(state, seat, fallbackCommand) {
    const bot = window.BrastaBot;
    const engine = window.Brasta;
    if (!state || !seat || !bot?.commandCandidates || !bot?.scoreCommand || !engine?.applyCommand) return fallbackCommand;

    const evaluated = bot.commandCandidates(state, seat).map((command) => {
      const result = engine.applyCommand(state, command);
      if (!result?.ok) return { command, score: Number.NEGATIVE_INFINITY, brastaRisk: true, specialExposure: true };
      return {
        command,
        score: bot.scoreCommand(state, seat, command) + capturedSpecialBonus(state, result.state, seat),
        brastaRisk: tableCanBeClearedByOneCard(result.state),
        specialExposure: specialRankExposure(state, command),
        key: JSON.stringify(command),
      };
    }).filter((entry) => Number.isFinite(entry.score));

    if (!evaluated.length) return fallbackCommand;

    // Hard mode is intentionally preventative: if any legal move avoids handing the
    // opponent an immediate Brasta opportunity, unsafe moves are effectively removed.
    const hasBrastaSafeMove = evaluated.some((entry) => !entry.brastaRisk);
    const hasSpecialSafeMove = evaluated.some((entry) => !entry.specialExposure);

    for (const entry of evaluated) {
      if (entry.brastaRisk) entry.score -= hasBrastaSafeMove ? 10000 : 325;
      if (entry.specialExposure) entry.score -= hasSpecialSafeMove ? 7000 : 220;
    }

    evaluated.sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
    return evaluated[0]?.command || fallbackCommand;
  }

  function TrackingWebSocket(url, protocols) {
    const socket = protocols === undefined ? new NativeWebSocket(url) : new NativeWebSocket(url, protocols);
    const meta = { isBot: false, seat: null, state: null };
    const nativeSend = socket.send.bind(socket);

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data || ''));
        if (!meta.isBot) return;
        if (message?.type === 'SESSION' && message.session?.seat) meta.seat = message.session.seat;
        if (message?.type === 'ROOM_STATE') meta.state = message.update?.state || null;
      } catch {}
    });

    socket.send = (data) => {
      try {
        const message = JSON.parse(String(data || ''));
        if (message?.type === 'JOIN_ROOM' && String(message.name || '') === BOT_NAME) meta.isBot = true;
        if (message?.type === 'COMMAND' && meta.isBot && difficulty() === 'hard' && meta.state && meta.seat) {
          message.command = hardChoice(meta.state, meta.seat, message.command);
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

  function ensureDifficultyControl() {
    const button = document.querySelector('[data-play-bot]');
    if (!button || document.querySelector('[data-bot-difficulty]')) return;

    const select = document.createElement('select');
    select.dataset.botDifficulty = '1';
    select.setAttribute('aria-label', 'Bot difficulty');
    select.title = 'Bot difficulty';
    select.innerHTML = '<option value="normal">Normal Bot</option><option value="hard">Hard Bot</option>';
    select.value = difficulty();
    select.addEventListener('change', () => setDifficulty(select.value));
    button.parentElement?.insertBefore(select, button);
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target.closest('[data-play-bot]') : null;
    if (!target) return;
    const select = document.querySelector('[data-bot-difficulty]');
    if (select) setDifficulty(select.value);
  }, true);

  function boot() {
    const root = document.getElementById('app') || document.body;
    new MutationObserver(ensureDifficultyControl).observe(root, { childList: true, subtree: true });
    ensureDifficultyControl();
  }

  window.BrastaHardBot = { hardChoice, tableCanBeClearedByOneCard, specialRankExposure };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
