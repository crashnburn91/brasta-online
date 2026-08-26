(() => {
  'use strict';

  if (window.__BRASTA_HARD_BOT__) return;
  window.__BRASTA_HARD_BOT__ = true;

  const DIFFICULTY_KEY = 'brasta-bot-difficulty';
  const BOT_NAME = 'Brasta Bot';
  const BOT_PENDING_KEY = 'brasta-bot-pending';
  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const LAST_NAME_KEY = 'brasta-online-last-name';
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

  function isBigCardLoose(state, command) {
    if (!state || command?.type !== 'PLAY_LOOSE') return false;
    return command.cardId === '10-diamonds' || command.cardId === '2-clubs';
  }

  function playerHandSize(state, seat) {
    return state?.players?.find((player) => player.seat === seat)?.hand?.length || 0;
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
    if (!loose.length) return false;

    // A single loose card is technically capturable by a matching card, but treating
    // every lone card as a catastrophic Brasta risk makes the bot refuse obvious
    // value captures (for example, refusing to capture a King just because a Queen
    // would remain). Reserve the hard Brasta filter for genuinely exposed multi-card tables.
    if (loose.length === 1) return false;

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

    const handSize = playerHandSize(state, seat);
    const evaluated = bot.commandCandidates(state, seat).map((command) => {
      const result = engine.applyCommand(state, command);
      if (!result?.ok) return { command, score: Number.NEGATIVE_INFINITY, brastaRisk: true, specialExposure: true, bigCardLoose: true, jackBurn: true };
      return {
        command,
        score: bot.scoreCommand(state, seat, command) + capturedSpecialBonus(state, result.state, seat),
        brastaRisk: tableCanBeClearedByOneCard(result.state),
        specialExposure: specialRankExposure(state, command),
        bigCardLoose: isBigCardLoose(state, command),
        jackBurn: burnedJackOnMove(state, result.state, seat, command),
        key: JSON.stringify(command),
      };
    }).filter((entry) => Number.isFinite(entry.score));

    if (!evaluated.length) return fallbackCommand;

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

    pool.sort((a, b) => b.score - a.score || String(a.key).localeCompare(String(b.key)));
    return pool[0]?.command || fallbackCommand;
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

  function findLearnCard() {
    const headings = Array.from(document.querySelectorAll('h1,h2,h3,strong'));
    const heading = headings.find((el) => /^learn brasta$/i.test(String(el.textContent || '').trim()));
    if (!heading) return null;
    return heading.closest('.landing-card, .home-card, .product-card, section, article, div');
  }

  function preferredBotPlayerName() {
    try {
      const signedIn = !!localStorage.getItem(AUTH_TOKEN_KEY);
      if (!signedIn) return 'Player';
      const saved = String(localStorage.getItem(LAST_NAME_KEY) || '').trim();
      return saved.slice(0, 24) || 'Player';
    } catch {
      return 'Player';
    }
  }

  function startBotMatch() {
    const createButton = document.querySelector('[data-create-room="1v1"]');
    const nameInput = document.querySelector('#create-name');
    if (!(createButton instanceof HTMLElement) || !(nameInput instanceof HTMLInputElement)) return;

    const select = document.querySelector('[data-bot-difficulty]');
    if (select instanceof HTMLSelectElement) setDifficulty(select.value);

    nameInput.value = preferredBotPlayerName();
    nameInput.dispatchEvent(new Event('input', { bubbles: true }));
    try { localStorage.setItem(BOT_PENDING_KEY, '1'); } catch {}
    createButton.click();
  }

  function ensurePracticeControls() {
    const learnCard = findLearnCard();
    if (!learnCard) return;

    document.querySelectorAll('[data-play-bot]').forEach((el) => {
      if (!learnCard.contains(el)) el.remove();
    });
    document.querySelectorAll('[data-bot-difficulty]').forEach((el) => {
      if (!learnCard.contains(el)) el.remove();
    });

    let wrap = learnCard.querySelector('[data-bot-practice-controls]');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.dataset.botPracticeControls = '1';
      wrap.className = 'button-row bot-practice-controls';
      learnCard.appendChild(wrap);
    }

    let select = wrap.querySelector('[data-bot-difficulty]');
    if (!select) {
      select = document.createElement('select');
      select.dataset.botDifficulty = '1';
      select.setAttribute('aria-label', 'Bot difficulty');
      select.title = 'Bot difficulty';
      select.innerHTML = '<option value="normal">Normal Bot</option><option value="hard">Hard Bot</option>';
      select.value = difficulty();
      select.addEventListener('change', () => setDifficulty(select.value));
      wrap.appendChild(select);
    }

    let button = wrap.querySelector('[data-play-bot]');
    if (!button) {
      button = document.createElement('button');
      button.className = 'primary';
      button.dataset.playBot = 'true';
      button.textContent = '🤖 Play vs Bot';
      button.title = 'Start a 1v1 practice match against Brasta Bot';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        startBotMatch();
      });
      wrap.appendChild(button);
    }
  }

  function boot() {
    const root = document.getElementById('app') || document.body;
    new MutationObserver(ensurePracticeControls).observe(root, { childList: true, subtree: true });
    ensurePracticeControls();
  }

  window.BrastaHardBot = { hardChoice, tableCanBeClearedByOneCard, specialRankExposure, isBigCardLoose, burnedJackOnMove };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
