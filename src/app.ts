namespace BrastaApp {
  type Context = 'local' | 'online' | 'lab' | null;
  type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';
  type DirectAction = { label: string; command: Brasta.Command };

  let context: Context = null;
  let state: Brasta.GameState | null = null;
  let selectedCard: string | null = null;
  let pendingAction: Brasta.LegalActionType | null = null;
  let selectedLoose = new Set<string>();
  let selectedBuildId: string | null = null;
  let selectedDeclaration: Brasta.BuildDeclarationOption | null = null;
  let covered = false;
  let lastError: string | null = null;
  let notice: string | null = null;
  let commandPending = false;
  let directActions: DirectAction[] = [];

  let onlineClient: BrastaNet.Client | null = null;
  let onlineSession: BrastaNet.SessionInfo | null = null;
  let onlineRoom: BrastaNet.RoomSnapshot | null = null;
  let connectionStatus: ConnectionStatus = 'disconnected';
  let lastOnlineRevision = -1;
  let lastEventIdentity = '';
  let eventRenderSequence = 0;
  let inviteRoomCode = '';
  let pendingFriendRoomMode: Brasta.Mode | null = null;
  let pendingAccountResume = false;
  let abandonPending = false;

  const $ = <T extends HTMLElement = HTMLElement>(selector: string): T => document.querySelector(selector)! as T;

  function escapeHtml(s: string): string {
    return s.replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[c]!));
  }
  function escapeAttr(s: string): string { return escapeHtml(s); }

  function resetInteraction(): void {
    selectedCard = null;
    pendingAction = null;
    selectedLoose.clear();
    selectedBuildId = null;
    selectedDeclaration = null;
    lastError = null;
    commandPending = false;
    directActions = [];
  }

  function suitClass(card: Brasta.Card): string { return card.suit === 'diamonds' || card.suit === 'hearts' ? 'red' : 'black'; }

  function cardHtml(id: string, opts: { clickable?: boolean; selected?: boolean; tiny?: boolean } = {}): string {
    if (!state) return '';
    const c = state.cards[id];
    if (!c) return `<span class="card-back-placeholder" aria-hidden="true"></span>`;
    const classes = ['card', suitClass(c)];
    if (opts.clickable) classes.push('clickable');
    if (opts.selected) classes.push('selected');
    if (opts.tiny) classes.push('tiny');
    return `<button class="${classes.join(' ')}" ${opts.clickable ? `data-card="${escapeAttr(id)}"` : 'disabled'} aria-label="${escapeAttr(Brasta.cardLabel(c))}">
      <span class="corner">${c.rank}</span><span class="suit">${Brasta.cardLabel(c).slice(-1)}</span>
    </button>`;
  }

  function teamName(team: Brasta.Team): string { return `Team ${team}`; }
  function isSpectator(): boolean { return context === 'online' && onlineSession?.role === 'spectator'; }
  function actionSeat(): Brasta.Seat {
    if (context === 'online' && onlineSession?.role === 'player' && onlineSession.seat) return onlineSession.seat;
    if (context === 'lab') return 1;
    return state?.currentSeat ?? 1;
  }
  function canLocalPlayerAct(): boolean {
    if (!state) return false;
    if (context === 'online') return !!onlineSession && onlineSession.role === 'player' && !!onlineSession.seat && connectionStatus === 'connected' && state.currentSeat === onlineSession.seat && !commandPending;
    if (context === 'lab') return true;
    return !covered;
  }
  function currentPlayerName(seat: Brasta.Seat): string { return state?.players.find((p) => p.seat === seat)?.name || `Seat ${seat}`; }

  function playerRankBadge(rankName: string | null | undefined, _seat: Brasta.Seat): string {
    if (!rankName) return '';
    const renderer = (window as any).BrastaRankBadge?.render;
    if (typeof renderer === 'function') {
      return `<span class="player-rank-badge" aria-label="${escapeAttr(rankName)} rank">${renderer(rankName, { size: 'small', className: 'player-card-rank' })}</span>`;
    }
    return `<span class="player-rank-badge player-rank-fallback" aria-label="${escapeAttr(rankName)} rank">${escapeHtml(rankName)}</span>`;
  }

  function showPlayerRankDetails(player: BrastaNet.RoomPlayer): void {
    document.querySelector('.player-rank-detail-backdrop')?.remove();
    const renderer = (window as any).BrastaRankBadge?.render;
    const rankName = player.rankName || 'Unranked';
    const rankVisual = typeof renderer === 'function'
      ? renderer(rankName, { size: 'large', className: 'player-rank-detail-visual' })
      : `<span class="player-rank-fallback">${escapeHtml(rankName)}</span>`;
    const experience = player.experience;
    const progress = Math.max(0, Math.min(100, Number(experience?.progressPercent || 0)));
    const backdrop = document.createElement('div');
    backdrop.className = 'player-rank-detail-backdrop';
    backdrop.innerHTML = `<section class="player-rank-detail" role="dialog" aria-modal="true" aria-labelledby="player-rank-detail-title">
      <button type="button" class="player-rank-detail-close" data-rank-detail-close aria-label="Close player details">×</button>
      <div class="player-rank-detail-badge">${rankVisual}</div>
      <div class="player-rank-detail-eyebrow">PLAYER RANK</div>
      <h2 id="player-rank-detail-title">${escapeHtml(player.name)}</h2>
      <strong class="player-rank-detail-name">${escapeHtml(rankName)}</strong>
      ${experience ? `<div class="player-experience-detail">
        <div><span>Experience</span><b>${escapeHtml(experience.title)} · Level ${experience.level}</b></div>
        <div class="player-experience-detail-track" aria-hidden="true"><i style="width:${progress}%"></i></div>
        <small>${escapeHtml(experience.progressLabel)}</small>
      </div>` : '<p class="player-experience-unavailable">Experience details will appear in newly created ranked matches.</p>'}
    </section>`;
    const close = () => {
      document.removeEventListener('keydown', onKeyDown);
      backdrop.remove();
    };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    backdrop.onclick = (event) => {
      const target = event.target as HTMLElement;
      if (target === backdrop || target.closest('[data-rank-detail-close]')) close();
    };
    document.addEventListener('keydown', onKeyDown);
    document.body.appendChild(backdrop);
    backdrop.querySelector<HTMLElement>('[data-rank-detail-close]')?.focus();
  }

  function hasBoardSelection(): boolean {
    return selectedLoose.size > 0 || !!selectedBuildId;
  }

  function commandIsValid(command: Brasta.Command): boolean {
    if (!state) return false;
    return Brasta.applyCommand(state, command).ok;
  }

  function directActionsForCard(cardId: string): DirectAction[] {
    if (!state) return [];
    const seat = actionSeat();
    const card = state.cards[cardId];
    if (!card) return [];

    const looseIds = [...selectedLoose];
    const actions: DirectAction[] = [];

    if (!hasBoardSelection()) {
      if (card.rank === 'J') {
        actions.push({
          label: state.loose.length ? 'Sweep' : 'Burn Jack −10',
          command: { type: 'JACK_ACTION', seat, cardId },
        });
      } else {
        actions.push({
          label: `Play ${Brasta.cardLabel(card)} Loose`,
          command: { type: 'PLAY_LOOSE', seat, cardId },
        });
      }
      return actions.filter((action) => commandIsValid(action.command));
    }

    if (selectedBuildId) {
      const captureBuild: Brasta.Command = {
        type: 'CAPTURE_BUILD',
        seat,
        cardId,
        buildId: selectedBuildId,
        looseIds,
      };
      if (commandIsValid(captureBuild)) actions.push({ label: 'Capture', command: captureBuild });

      const addToBuild: Brasta.Command = {
        type: 'ADD_TO_BUILD',
        seat,
        cardId,
        buildId: selectedBuildId,
        looseIds,
      };
      if (commandIsValid(addToBuild)) actions.push({ label: 'Add to Build', command: addToBuild });

      if (!looseIds.length) {
        const raiseBuild: Brasta.Command = {
          type: 'RAISE_BUILD',
          seat,
          cardId,
          buildId: selectedBuildId,
        };
        if (commandIsValid(raiseBuild)) {
          const build = state.builds.find((candidate) => candidate.id === selectedBuildId);
          const nextValue = build?.declaredValue != null && card.value != null ? build.declaredValue + card.value : null;
          actions.push({ label: nextValue != null ? `Raise to ${nextValue}` : 'Raise Build', command: raiseBuild });
        }
      }
      return actions;
    }

    if (looseIds.length) {
      const captureLoose: Brasta.Command = { type: 'CAPTURE_LOOSE', seat, cardId, looseIds };
      if (commandIsValid(captureLoose)) actions.push({ label: 'Capture', command: captureLoose });

      for (const declaration of Brasta.getBuildDeclarationOptions(state, seat, cardId)) {
        const makeBuild: Brasta.Command = {
          type: 'MAKE_BUILD',
          seat,
          cardId,
          declaredValue: declaration.value,
          declaredRank: declaration.rank,
          looseIds,
        };
        if (commandIsValid(makeBuild)) actions.push({ label: declaration.label, command: makeBuild });
      }
    }

    return actions;
  }

  function selectionActions(): DirectAction[] {
    if (!state) return [];
    if (selectedCard) return directActionsForCard(selectedCard);

    if (!hasBoardSelection()) return [];
    const hand = state.players.find((player) => player.seat === actionSeat())?.hand || [];
    const actions: DirectAction[] = [];
    for (const cardId of hand) {
      const card = state.cards[cardId];
      if (!card) continue;
      for (const action of directActionsForCard(cardId)) {
        actions.push({ ...action, label: `${Brasta.cardLabel(card)} · ${action.label}` });
      }
    }
    return actions;
  }

  function directActionColorClass(action: DirectAction): string {
    if (action.command.type === 'PLAY_LOOSE') return 'action-play';
    if (action.command.type === 'CAPTURE_LOOSE' || action.command.type === 'CAPTURE_BUILD') return 'action-capture';
    if (action.command.type === 'MAKE_BUILD' || action.command.type === 'ADD_TO_BUILD' || action.command.type === 'RAISE_BUILD') return 'action-build';
    if (action.command.type === 'JACK_ACTION') return /burn/i.test(action.label) ? 'action-burn' : 'action-capture';
    return 'action-neutral';
  }

  function renderDirectButtons(actions: DirectAction[]): string {
    directActions = actions;
    return actions.map((action, index) =>
      `<button class="primary selection-v2-action ${directActionColorClass(action)}" data-direct-action="${index}">${escapeHtml(action.label)}</button>`
    ).join('');
  }

  function renderHeader(): string {
    if (!state && context !== 'online') return '';
    const round = state?.round ?? 0;
    const roomPill = context === 'online' && onlineRoom
      ? `<span class="pill room-pill">Room ${onlineRoom.code}</span>${isSpectator() ? '<span class="pill spectator-pill">Spectating</span>' : ''}${onlineRoom.spectatorCount ? `<span class="pill watcher-pill">👁 ${onlineRoom.spectatorCount}</span>` : ''}<span class="connection ${connectionStatus}">${connectionStatus}</span>`
      : '';
    const nav = context === 'online'
      ? `${!isSpectator() ? '<button data-copy-invite>Copy Invite</button>' : ''}<button data-copy-spectate>Copy Spectate Link</button><button data-online-home>${isSpectator() ? 'Stop Spectating' : 'Home'}</button>`
      : `<button data-nav="game">Game</button><button data-nav="lab">Rules Lab</button><button data-action="new">New Match</button>`;
    const rankedServerNow = Number(onlineRoom?.ranked?.serverNow || 0);
    const turnDeadline = Number(onlineRoom?.ranked?.turnDeadlineAt || 0);
    const rankedTurnTimer = state?.phase === 'play' && turnDeadline
      ? `<span class="pill ranked-turn-timer" data-ranked-turn-timer data-deadline="${turnDeadline}" data-server-now="${rankedServerNow}" data-turn-seat="${onlineRoom?.ranked?.turnSeat || state.currentSeat}">TURN <b>30</b>s</span>`
      : '';
    return `<header class="topbar"><div><strong>Brasta</strong>${round ? `<span class="pill">Round ${round}</span>` : ''}${roomPill}</div><div class="scoreline">${rankedTurnTimer}${state ? `<span class="target-score">First to ${state.targetScore}</span>` : ''}</div><nav>${nav}</nav></header>`;
  }

  function renderPlayerCardBacks(count: number): string {
    const shown = Math.min(Math.max(count, 0), 4);
    if (!shown) return '<div class="player-card-hand-empty" aria-label="No cards in hand"></div>';
    return `<div class="player-card-back-fan" aria-label="${count} card${count === 1 ? '' : 's'} in hand">${Array.from({ length: shown }, (_, index) =>
      `<span class="player-card-back" style="--card-index:${index}" aria-hidden="true"><span>B</span></span>`
    ).join('')}</div>`;
  }

  function renderPlayers(): string {
    if (!state) return '';
    const s = state;
    const lobbyBySeat = new Map((onlineRoom?.players || []).map((p) => [p.seat, p]));
    return `<div class="players players-${s.mode}">${s.players.map((p) => {
      const active = s.phase === 'play' && p.seat === s.currentSeat;
      const starter = p.seat === s.starterSeat;
      const team = Brasta.teamForSeat(s.mode, p.seat);
      const lobby = lobbyBySeat.get(p.seat);
      const disconnected = Boolean(context === 'online' && lobby && !lobby.connected);
      const rank = lobby?.rankName || null;
      const you = Boolean(context === 'online' && onlineSession?.role === 'player' && onlineSession.seat === p.seat);
      const connection = context === 'online'
        ? `<span class="player-status ${disconnected ? 'offline' : 'online'}" aria-label="${disconnected ? 'Offline' : 'Online'}"><i></i><span class="player-status-label">${disconnected ? 'OFFLINE' : 'ONLINE'}</span></span>`
        : '';
      const profileAttrs = context === 'online'
        ? `data-player-profile="${escapeAttr(p.name || `Seat ${p.seat}`)}" role="button" tabindex="0" aria-haspopup="dialog" aria-label="View ${escapeAttr(p.name || `Seat ${p.seat}`)} player profile"`
        : '';
      return `<div class="player-chip player-card team-${team}-player ${active ? 'active' : ''} ${disconnected ? 'offline' : ''}" data-seat="${p.seat}" ${profileAttrs} ${starter ? 'data-starter="1"' : ''} ${you ? 'data-you="1"' : ''}>
        <span class="player-seat-corner" aria-label="Seat ${p.seat}">${p.seat}</span>
        ${connection ? `<div class="player-connection-corner" style="position:absolute;right:8px;bottom:8px;top:auto;left:auto;z-index:4;display:flex;align-items:center;justify-content:flex-end;">${connection}</div>` : ''}
        <div class="player-card-top">
          <div class="player-card-identity">
            <div class="player-name-line"><b class="player-name">${escapeHtml(p.name || `Seat ${p.seat}`)}</b>${connection ? `<span class="player-connection-inline">${connection}</span>` : ''}</div>
            ${rank ? `<div class="player-rank-row">${playerRankBadge(rank, p.seat)}</div>` : ''}
            <span class="team-${team}" aria-hidden="true">${teamName(team)}</span>
          </div>
        </div>
        <div class="player-card-divider"></div>
        <div class="player-card-hand">${renderPlayerCardBacks(p.hand.length)}</div>
      </div>`;
    }).join('')}</div>`;
  }

  function renderBuild(build: Brasta.Build): string {
    if (!state) return '';
    const cards = [...build.groups.flat(), ...build.modifiers];
    const selected = selectedBuildId === build.id;
    const canSelect = state.phase === 'play' && canLocalPlayerAct();
    return `<div class="build ${selected ? 'selected' : ''} ${canSelect ? 'clickable' : ''}" data-build="${escapeAttr(build.id)}" role="button" aria-disabled="${canSelect ? 'false' : 'true'}" tabindex="${canSelect ? '0' : '-1'}"><div class="build-label">${Brasta.buildLabel(build)}</div><div class="build-cards">${cards.map((id) => cardHtml(id, { tiny: true })).join('')}</div>${build.modifiers.length ? `<div class="modifier-note">raised +${build.modifiers.map((id) => state!.cards[id]?.value ?? '?').join('+')}</div>` : ''}</div>`;
  }

  function renderDeckStack(): string {
    if (!state) return '';
    const remaining = Math.max(0, state.deck.length);
    const shown = remaining > 0 ? Math.min(10, Math.max(1, Math.ceil(remaining / 4))) : 0;
    const cards = Array.from({ length: shown }, (_, index) =>
      `<span class="table-deck-card" style="--deck-index:${index}" aria-hidden="true"><span>B</span></span>`
    ).join('');
    return `<div class="table-deck ${remaining === 0 ? 'empty' : ''}" aria-label="Remaining deck">
      <span class="table-deck-label">DECK</span>
      <div class="table-deck-stack">${cards}</div>
    </div>`;
  }

  function renderLastMove(className: string): string {
    if (!state?.lastMove) return '';
    return `<div class="last-move-banner ${className}"><span>LAST MOVE</span><b>${escapeHtml(state.lastMove)}</b></div>`;
  }

  function renderBoard(): string {
    if (!state) return '';
    const looseSelectable = state.phase === 'play' && canLocalPlayerAct();
    const lastMove = renderLastMove('board-last-move');
    const eventOverlay = state.phase === 'play' ? renderEventBanner(state.event, 'board') : '';
    return `<section class="table">${lastMove}${eventOverlay}${renderDeckStack()}<div class="table-title">TABLE</div><div class="build-row">${state.builds.length ? state.builds.map(renderBuild).join('') : '<div class="empty-note">No builds</div>'}</div><div class="loose-row">${state.loose.length ? state.loose.map((id) => cardHtml(id, { clickable: looseSelectable, selected: selectedLoose.has(id) })).join('') : '<div class="empty-note">No loose cards</div>'}</div></section>`;
  }

  function renderOpening(): string {
    if (!state || state.phase !== 'openingChoice') return '';
    const starterName = currentPlayerName(state.starterSeat);
    if (context === 'online' && (isSpectator() || onlineSession?.seat !== state.starterSeat)) return `<div class="action-panel opening-panel ${isSpectator() ? 'spectator-panel' : ''}"><h3>${escapeHtml(starterName)} is choosing the opening</h3><p>${isSpectator() ? 'You are spectating. ' : ''}Waiting for Seat ${state.starterSeat} to keep the first four or put them on the board.</p></div>`;
    return `<div class="action-panel opening-panel"><h3>${escapeHtml(starterName)} — Opening choice</h3><p>Keep your first four cards, or place all four on the board and receive a replacement hand.</p><div class="button-row opening-choice-actions"><button class="opening-choice-button opening-keep" data-open="keep">Keep Hand</button><button class="opening-choice-button opening-place" data-open="put">Place on Board</button></div></div>`;
  }

  function buildPicker(kind: 'capture' | 'add' | 'raise'): string {
    if (!state || !selectedCard) return '';
    const seat = actionSeat();
    const builds = kind === 'capture' ? Brasta.getCapturableBuilds(state, selectedCard) : kind === 'add' ? Brasta.getAddableBuilds(state, seat, selectedCard) : Brasta.getRaiseableBuilds(state, seat, selectedCard);
    return `<div class="target-list">${builds.map((b) => `<button data-buildchoice="${escapeAttr(b.id)}" class="${selectedBuildId === b.id ? 'selected' : ''}">${Brasta.buildLabel(b)}</button>`).join('') || '<span>No matching builds</span>'}</div>`;
  }
  function loosePicker(help: string): string { return `<p>${help}</p><div class="selection-summary">Selected: ${selectedLoose.size}</div>`; }

  function renderPendingAction(): string {
    if (!state || !selectedCard || !pendingAction) return '';
    let body = '';
    const seat = actionSeat();
    if (pendingAction === 'CAPTURE_LOOSE') body = loosePicker('Select loose cards that form one or more complete capture sets, then confirm.');
    else if (pendingAction === 'MAKE_BUILD') {
      const opts = Brasta.getBuildDeclarationOptions(state, seat, selectedCard);
      body = `<p>Choose the declared build you will retain a matching capture card for:</p><div class="target-list">${opts.map((o, i) => `<button data-decl="${i}" class="${selectedDeclaration?.label === o.label ? 'selected' : ''}">${o.label}</button>`).join('')}</div>${loosePicker('Then select all loose cards to include in the new build. The engine validates the complete build before committing it.')}`;
    } else if (pendingAction === 'ADD_TO_BUILD') body = `<p>Choose the build:</p>${buildPicker('add')}${loosePicker('Optionally select loose cards that join your played card to form complete sets equal to the build value.')}`;
    else if (pendingAction === 'RAISE_BUILD') body = `<p>Choose the numeric build to raise. No loose cards are used.</p>${buildPicker('raise')}`;
    else if (pendingAction === 'CAPTURE_BUILD') body = `<p>Choose the build:</p>${buildPicker('capture')}${loosePicker('Optionally select loose cards to capture in complete sets equal to the build value (or matching face rank).')}`;
    return `<div class="action-panel"><h3>${pendingAction.replace(/_/g, ' ')}</h3>${body}<div class="button-row"><button class="primary" data-submit>Confirm</button><button data-cancel>Cancel</button></div></div>`;
  }

  function renderActions(): string {
    if (!state || state.phase !== 'play') return '';
    if (isSpectator()) return `<div class="action-panel waiting spectator-panel"><p><b>Spectating</b> · ${escapeHtml(currentPlayerName(state.currentSeat))} (Seat ${state.currentSeat}) is playing.</p></div>`;
    if (context === 'online' && onlineSession?.seat !== state.currentSeat) return `<div class="action-panel waiting"><p>Waiting for <b>${escapeHtml(currentPlayerName(state.currentSeat))}</b> (Seat ${state.currentSeat}).</p></div>`;
    if (commandPending) return `<div class="action-panel"><p>Sending move to server…</p></div>`;

    const boardSelected = hasBoardSelection();
    if (!selectedCard && !boardSelected) {
      directActions = [];
      return `<div class="action-panel action-idle-prompt"><p>Select a card in your hand or select cards on the table.</p></div>`;
    }

    const actions = selectionActions();
    const title = selectedCard ? Brasta.cardLabel(state.cards[selectedCard]) : 'Table selection';
    if (!actions.length) {
      directActions = [];
      return `<div class="action-panel ${boardSelected ? 'selection-v2-has-target' : ''}"><h3>${escapeHtml(title)}</h3><div class="selection-v2-note">No valid action for this selection.</div></div>`;
    }

    return `<div class="action-panel ${boardSelected ? 'selection-v2-has-target' : ''}"><h3>${escapeHtml(title)}</h3><div class="button-row actions">${renderDirectButtons(actions)}</div></div>`;
  }

  function renderHand(): string {
    if (!state || state.phase === 'roundEnd' || state.phase === 'matchEnd') return '';
    if (isSpectator()) return `<section class="spectator-hand-note"><span>👁</span><div><b>Spectator view</b><small>Player hands are hidden.</small></div></section>`;
    let seat: Brasta.Seat;
    if (context === 'online' && onlineSession?.role === 'player' && onlineSession.seat) seat = onlineSession.seat;
    else if (context === 'lab') seat = 1;
    else seat = state.phase === 'openingChoice' ? state.starterSeat : state.currentSeat;
    const player = state.players.find((p) => p.seat === seat); if (!player) return '';
    const clickable = state.phase === 'play' && canLocalPlayerAct();
    const title = context === 'online' ? `Your hand · ${escapeHtml(player.name)} · Seat ${seat}` : `Seat ${seat}'s hand`;
    return `<section class="hand-area"><div class="hand-title">${title}</div><div class="hand">${player.hand.length ? player.hand.map((id) => cardHtml(id, { clickable, selected: selectedCard === id })).join('') : '<span class="empty-note">Waiting for cards…</span>'}</div></section>`;
  }

  function teamForEvent(event: string): Brasta.Team | null {
    if (!state) return null;

    const explicit = event.match(/\bTeam\s+([AB])\b/i);
    if (explicit) return explicit[1].toUpperCase() as Brasta.Team;

    const normalized = event.toLowerCase();
    const actors = [...state.players]
      .filter((player) => player.name && !/^Seat\s+\d+$/i.test(player.name))
      .sort((a, b) => b.name.length - a.name.length);

    for (const player of actors) {
      if (normalized.includes(player.name.toLowerCase())) {
        return Brasta.teamForSeat(state.mode, player.seat);
      }
    }

    return null;
  }

  function renderEventBanner(event: string | null, placement: 'board' | 'round' = 'board'): string {
    if (!event) return '';
    const text = event.trim();
    if (/^(?:BUILD\b|Added to BUILD\b)/i.test(text)) return '';

    const isTeamEvent = /BRASTA!|Jack sweep|BIG 2|BIG 10|LAST PICKUP!/i.test(text);
    const team = isTeamEvent ? teamForEvent(text) : null;
    const teamClass = team === 'A' ? ' team-event-blue' : team === 'B' ? ' team-event-red' : '';
    const placementClass = placement === 'round' ? ' round-event-overlay' : ' board-event-overlay';

    return `<div class="event transient-event-overlay${placementClass}${teamClass}" data-event-seq="${eventRenderSequence}"${team ? ` data-event-team="${team}"` : ''}>${escapeHtml(event)}</div>`;
  }

  function currentRoomIsRanked(): boolean {
    if (context !== 'online' || !onlineRoom?.code) return false;
    try {
      const code = onlineRoom.code;
      return Boolean(
        localStorage.getItem(`brasta-ranked-room:${code}`)
        || localStorage.getItem(`brasta-ranked-2v2-room:${code}`)
      );
    } catch {
      return false;
    }
  }

  function renderRoundEnd(): string {
    if (!state || state.phase !== 'roundEnd' || !state.roundScore) return '';
    const a = state.roundScore.A, b = state.roundScore.B;
    const row = (label: string, av: number, bv: number) => `<tr><td>${label}</td><td>${av}</td><td>${bv}</td></tr>`;
    const rankedRound = currentRoomIsRanked();
    const rankedServerNow = Number(onlineRoom?.ranked?.serverNow || 0);
    const roundAdvanceAt = Number(onlineRoom?.ranked?.roundAdvanceAt || 0);
    let controls = rankedRound
      ? `<span class="empty-note ranked-round-countdown-copy">Next ranked round in <b data-ranked-round-countdown data-deadline="${roundAdvanceAt}" data-server-now="${rankedServerNow}">10</b>s…</span>`
      : `<button class="primary" data-next-round>Next Round</button><button data-end-match>End Match</button>`;
    if (!rankedRound && context === 'online' && !onlineSession?.isHost) controls = '<span class="empty-note">Waiting for the host to start the next round.</span>';
    return `<section class="round-end"><h2>Round ${state.round} complete</h2><p>First to <b>${state.targetScore}</b>${state.message.includes('tied') ? ` · ${escapeHtml(state.message)}` : ''}</p>${renderLastMove('round-last-move')}${renderEventBanner(state.event, 'round')}<table><thead><tr><th></th><th>Team A</th><th>Team B</th></tr></thead><tbody>${row('Aces', a.aces, b.aces)}${row('Jacks', a.jacks, b.jacks)}${row('Big 2', a.big2, b.big2)}${row('Big 10', a.big10, b.big10)}${row('Clubs majority', a.clubsMajority, b.clubsMajority)}${row('Cards majority', a.cardsMajority, b.cardsMajority)}${row('Brastas', a.brastas, b.brastas)}${row('Burned Jacks', a.burnedJacks, b.burnedJacks)}${row('Last pickup', a.lastPickup, b.lastPickup)}${row('ROUND TOTAL', a.total, b.total)}</tbody></table><div class="button-row">${controls}</div></section>`;
  }
  function renderMatchEnd(): string {
    if (!state || state.phase !== 'matchEnd') return '';
    const winner = state.score.A === state.score.B ? 'Tie match' : state.score.A > state.score.B ? 'Team A wins' : 'Team B wins';
    return `<section class="round-end"><h2>${winner}</h2><p>First to ${state.targetScore}</p>${renderLastMove('round-last-move')}<p class="match-score">Team A ${state.score.A} — Team B ${state.score.B}</p>${context === 'online' ? '<p>Return home or reconnect to the room from the same browser.</p>' : '<div class="button-row"><button data-action="new">New Match</button></div>'}</section>`;
  }
  function renderCover(): string {
    if (context !== 'local' || !state || !covered || state.phase === 'roundEnd' || state.phase === 'matchEnd') return '';
    const seat = state.phase === 'openingChoice' ? state.starterSeat : state.currentSeat;
    return `<div class="privacy-cover"><div><h2>Pass to Seat ${seat}</h2><p>Other players: look away.</p><button class="primary" data-reveal>Reveal Hand</button></div></div>`;
  }

  function renderGame(): void {
    const app = $('#app'); if (!state) { renderLanding(); return; }
    // Online ROOM_STATE updates replace the GameState object even when the
    // underlying move/event has not changed. Using object identity here made
    // transient event banners look "new" on every render, so a dismissed Jack
    // Sweep/Brasta/Big-card banner would immediately come back until the next
    // turn. Track the actual event + move instead.
    const eventIdentity = state.event
      ? `${state.round}|${state.event}|${state.lastMove || ''}`
      : '';
    if (eventIdentity !== lastEventIdentity) {
      lastEventIdentity = eventIdentity;
      if (eventIdentity) eventRenderSequence += 1;
    }
    app.innerHTML = `${renderHeader()}<main>${renderPlayers()}${lastError ? `<div class="error">${escapeHtml(lastError)}</div>` : ''}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}${state.phase === 'roundEnd' ? renderRoundEnd() : state.phase === 'matchEnd' ? renderMatchEnd() : `${renderBoard()}${renderHand()}${renderOpening()}${renderActions()}`}</main>${renderCover()}`;
    bindGame();
  }

  function renderLanding(): void {
    const app = $('#app');
    const params = new URLSearchParams(location.search);
    const spectateHint = BrastaNet.normalizeCode(params.get('spectate') || '');
    const roomHint = inviteRoomCode || BrastaNet.normalizeCode(params.get('room') || '');
    const name = BrastaNet.lastName();
    if (spectateHint) {
      const saved = BrastaNet.loadSession(spectateHint, 'spectator');
      app.innerHTML = `<div class="landing invite-landing spectator-invite"><div class="logo-mark">B</div><div class="invite-join-card"><div class="eyebrow">WATCH BRASTA</div><h1>${escapeHtml(spectateHint)}</h1><p>Enter your name to spectate this room. Player hands stay hidden.</p>${lastError ? `<div class="error">${escapeHtml(lastError)}</div>` : ''}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<input id="join-code" type="hidden" value="${escapeAttr(spectateHint)}"><label>Your name<input id="join-name" maxlength="24" value="${escapeAttr(saved?.name || name)}" placeholder="Your name" autofocus></label><button class="primary big-button invite-join-button" data-spectate-room>Spectate Room</button></div></div>`;
      bindLanding();
      return;
    }
    if (roomHint) {
      const saved = BrastaNet.loadSession(roomHint, 'player');
      app.innerHTML = `<div class="landing invite-landing"><div class="logo-mark">B</div><div class="invite-join-card"><div class="eyebrow">BRASTA ROOM INVITE</div><h1>${escapeHtml(roomHint)}</h1><p>Enter your name to join this room.</p>${lastError ? `<div class="error">${escapeHtml(lastError)}</div>` : ''}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<input id="join-code" type="hidden" value="${escapeAttr(roomHint)}"><label>Your name<input id="join-name" maxlength="24" value="${escapeAttr(saved?.name || name)}" placeholder="Your name" autofocus></label><button class="primary big-button invite-join-button" data-join-room>Join Room</button></div></div>`;
      bindLanding();
      return;
    }
    app.innerHTML = `<div class="landing landing-wide"><div class="logo-mark">B</div><h1>Brasta</h1><p>Standalone Brasta · local hot-seat or private online rooms</p>${lastError ? `<div class="error">${escapeHtml(lastError)}</div>` : ''}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<div class="landing-grid"><section class="landing-card online-card"><h2>Play Online</h2><p>Create a private room and send the code or invite link to the other players.</p><label>Display name<input id="create-name" maxlength="24" value="${escapeAttr(name)}" placeholder="Your name"></label><label>Game to<select id="create-target"><option value="110" selected>110 points</option><option value="220">220 points</option></select></label><div class="button-row"><button class="primary" data-create-room="1v1">Create 1v1 Room</button><button class="primary" data-create-room="2v2">Create 2v2 Room</button></div><div class="divider"><span>or join / watch</span></div><label>Room code<input id="join-code" maxlength="6" placeholder="ABCDE" autocapitalize="characters"></label><label>Display name<input id="join-name" maxlength="24" value="${escapeAttr(name)}" placeholder="Your name"></label><div class="button-row"><button data-join-room>Join Room</button><button data-spectate-room>👁 Spectate</button></div><div class="server-note">Spectators can join before or during a game. They see the table, deck, and scores, but never player hands.</div></section><section class="landing-card"><h2>Local Hot-Seat</h2><p>One screen, pass the device between players. No server required.</p><label>Game to<select id="local-target"><option value="110" selected>110 points</option><option value="220">220 points</option></select></label><div class="button-row"><button data-newmode="1v1">Local 1v1</button><button data-newmode="2v2">Local 2v2</button></div><button data-nav="lab">Rules Lab</button></section></div></div>`;
    bindLanding();
  }

  function renderLobby(): void {
    const app = $('#app'); if (!onlineRoom || !onlineSession) { renderLanding(); return; }
    const capacity = onlineRoom.mode === '1v1' ? 2 : 4;
    const occupied = onlineRoom.players.filter((p) => p.occupied).length;
    const invite = inviteUrl(onlineRoom.code);
    const watch = spectateUrl(onlineRoom.code);
    const spectatorNames = onlineRoom.spectators.map((s) => escapeHtml(s.name)).join(', ');
    const watcherCopy = onlineRoom.spectatorCount ? `${onlineRoom.spectatorCount} watching${spectatorNames ? ` · ${spectatorNames}` : ''}` : 'No spectators yet';
    const startControls = onlineSession.role === 'spectator'
      ? '<p class="waiting-copy">You are spectating. Waiting for the host to start the game.</p>'
      : onlineSession.isHost
        ? `<button class="primary big-button" data-start-online ${onlineRoom.full ? '' : 'disabled'}>${onlineRoom.full ? 'Start Game' : 'Waiting for all seats'}</button>`
        : '<p class="waiting-copy">Waiting for the host to start the game.</p>';
    app.innerHTML = `${renderHeader()}<main class="lobby"><section class="lobby-hero"><div><div class="eyebrow">PRIVATE ROOM</div><h1>${onlineRoom.code}</h1><p>${onlineRoom.mode} · First to ${onlineRoom.targetScore} · ${occupied}/${capacity} seats filled</p><div class="spectator-count">👁 ${escapeHtml(watcherCopy)}</div></div><div class="button-row">${onlineSession.role === 'player' ? '<button class="primary" data-copy-invite>Copy Player Invite</button>' : ''}<button data-copy-spectate>Copy Spectate Link</button><button data-copy-code>Copy Code</button></div></section>${lastError ? `<div class="error">${escapeHtml(lastError)}</div>` : ''}${notice ? `<div class="notice">${escapeHtml(notice)}</div>` : ''}<section class="lobby-seats">${onlineRoom.players.map((p) => { const team = Brasta.teamForSeat(onlineRoom!.mode, p.seat); const you = onlineSession!.role === 'player' && p.seat === onlineSession!.seat; return `<div class="lobby-seat ${p.occupied ? 'occupied' : 'empty'} ${!p.connected && p.occupied ? 'offline' : ''}"><div class="seat-number">Seat ${p.seat}</div><div class="seat-name">${p.occupied ? escapeHtml(p.name) : 'Open seat'}</div><div class="team-${team}">Team ${team}</div>${you ? '<span class="you-badge">you</span>' : ''}${p.occupied && !p.connected ? '<div class="offline-note">reconnecting…</div>' : ''}</div>`; }).join('')}</section><section class="lobby-controls"><div class="room-links"><p>Players: <code>${escapeHtml(invite)}</code></p><p>Spectators: <code>${escapeHtml(watch)}</code></p></div>${startControls}<button data-online-home>${onlineSession.role === 'spectator' ? 'Stop Spectating' : onlineRoom.started ? 'Disconnect' : 'Leave Room'}</button></section></main>`;
    bindLobby();
  }

  function renderOnline(): void { if (!onlineRoom || !onlineSession) { renderLanding(); return; } if (!onlineRoom.started || !state) renderLobby(); else renderGame(); }
  function render(): void { if (location.hash === '#lab' || context === 'lab') { renderLab(); return; } if (context === 'online') { renderOnline(); return; } if (context === 'local' && state) { renderGame(); return; } renderLanding(); }

  function execute(command: Brasta.Command): void {
    if (!state) return;
    if (context === 'online') { if (!onlineClient || !onlineSession || onlineSession.role !== 'player' || !onlineSession.seat) return; commandPending = true; lastError = null; onlineClient.command({ ...command, seat: onlineSession.seat } as Brasta.Command); render(); return; }
    const result = Brasta.applyCommand(state, command);
    if (!result.ok) { lastError = result.error || 'Move rejected.'; render(); return; }
    state = result.state; resetInteraction(); if (context === 'local' && (state.phase === 'play' || state.phase === 'openingChoice')) covered = true; render();
  }

  function submitPending(): void {
    if (!state || !selectedCard || !pendingAction) return; const seat = actionSeat();
    if (pendingAction === 'CAPTURE_LOOSE') execute({ type: 'CAPTURE_LOOSE', seat, cardId: selectedCard, looseIds: [...selectedLoose] });
    else if (pendingAction === 'MAKE_BUILD') { if (!selectedDeclaration) { lastError = 'Choose a declared build first.'; render(); return; } execute({ type: 'MAKE_BUILD', seat, cardId: selectedCard, declaredValue: selectedDeclaration.value, declaredRank: selectedDeclaration.rank, looseIds: [...selectedLoose] }); }
    else if (pendingAction === 'ADD_TO_BUILD') { if (!selectedBuildId) { lastError = 'Choose a build.'; render(); return; } execute({ type: 'ADD_TO_BUILD', seat, cardId: selectedCard, buildId: selectedBuildId, looseIds: [...selectedLoose] }); }
    else if (pendingAction === 'RAISE_BUILD') { if (!selectedBuildId) { lastError = 'Choose a build.'; render(); return; } execute({ type: 'RAISE_BUILD', seat, cardId: selectedCard, buildId: selectedBuildId }); }
    else if (pendingAction === 'CAPTURE_BUILD') { if (!selectedBuildId) { lastError = 'Choose a build.'; render(); return; } execute({ type: 'CAPTURE_BUILD', seat, cardId: selectedCard, buildId: selectedBuildId, looseIds: [...selectedLoose] }); }
  }

  function bindCommonGameControls(): void {
    document.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => el.onclick = () => {
      if (!state || !canLocalPlayerAct()) return;
      const id = el.dataset.card!;

      if (state.loose.includes(id)) {
        selectedLoose.has(id) ? selectedLoose.delete(id) : selectedLoose.add(id);
        pendingAction = null;
        selectedDeclaration = null;
        lastError = null;
        render();
        return;
      }

      const ownHand = state.players.find((player) => player.seat === actionSeat())?.hand || [];
      if (!ownHand.includes(id)) return;
      selectedCard = id;
      pendingAction = null;
      selectedDeclaration = null;
      lastError = null;
      render();
    });

    document.querySelectorAll<HTMLElement>('[data-build]').forEach((el) => el.onclick = () => {
      if (!state || !canLocalPlayerAct()) return;
      const id = el.dataset.build || '';
      if (!id) return;
      selectedBuildId = selectedBuildId === id ? null : id;
      pendingAction = null;
      selectedDeclaration = null;
      lastError = null;
      render();
    });

    document.querySelectorAll<HTMLElement>('[data-direct-action]').forEach((el) => el.onclick = () => {
      if (!state || !canLocalPlayerAct()) return;
      const index = Number(el.dataset.directAction);
      const action = directActions[index];
      if (!action) return;
      execute(action.command);
    });
  }

  function bindGame(): void {
    bindCommonGameControls();
    document.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => el.onclick = () => { covered = false; render(); });
    document.querySelectorAll<HTMLElement>('[data-open]').forEach((el) => el.onclick = () => {
      if (!state) return; const choice = el.dataset.open as 'keep' | 'put';
      if (context === 'online') { if (onlineSession?.seat !== state.starterSeat) return; commandPending = true; onlineClient?.openingChoice(choice); render(); }
      else { const result = Brasta.resolveOpening(state, choice); if (result.ok) { state = result.state; covered = true; lastError = null; } else lastError = result.error || 'Opening failed.'; render(); }
    });
    document.querySelectorAll<HTMLElement>('[data-next-round]').forEach((el) => el.onclick = () => { if (!state) return; if (context === 'online') { if (onlineSession?.isHost) onlineClient?.nextRound(); } else { const result = Brasta.nextRound(state); if (result.ok) { state = result.state; resetInteraction(); covered = true; } else lastError = result.error || 'Unable to start next round.'; render(); } });
    document.querySelectorAll<HTMLElement>('[data-end-match]').forEach((el) => el.onclick = () => { if (!state) return; if (context === 'online') { if (onlineSession?.isHost) onlineClient?.endMatch(); } else { state = Brasta.endMatch(state); render(); } });
    document.querySelectorAll<HTMLElement>('[data-copy-invite]').forEach((el) => el.onclick = () => copyInvite(el));
    document.querySelectorAll<HTMLElement>('[data-copy-spectate]').forEach((el) => el.onclick = () => copySpectate(el));
    document.querySelectorAll<HTMLElement>('[data-online-home]').forEach((el) => el.onclick = goHomeFromOnline);
    document.querySelectorAll<HTMLElement>('[data-nav="lab"]').forEach((el) => el.onclick = () => { context = 'lab'; location.hash = 'lab'; resetInteraction(); render(); });
    document.querySelectorAll<HTMLElement>('[data-nav="game"]').forEach((el) => el.onclick = () => { location.hash = ''; context = state ? 'local' : null; render(); });
    document.querySelectorAll<HTMLElement>('[data-action="new"]').forEach((el) => el.onclick = () => { context = null; state = null; covered = false; resetInteraction(); render(); });
  }

  function bindLanding(): void {
    document.querySelectorAll<HTMLElement>('[data-newmode]').forEach((el) => el.onclick = () => { const target = Number((($('#local-target') as HTMLSelectElement).value)) as Brasta.TargetScore; context = 'local'; state = Brasta.startMatch(el.dataset.newmode as Brasta.Mode, Date.now(), target); resetInteraction(); covered = true; history.replaceState({}, '', location.pathname); render(); });
    document.querySelectorAll<HTMLElement>('[data-nav="lab"]').forEach((el) => el.onclick = () => { context = 'lab'; location.hash = 'lab'; resetInteraction(); renderLab(); });
    document.querySelectorAll<HTMLElement>('[data-create-room]').forEach((el) => el.onclick = async () => { const name = ($('#create-name') as HTMLInputElement).value.trim(); if (!name) { lastError = 'Enter your display name.'; renderLanding(); return; } context = 'online'; lastError = null; notice = null; try { const target = Number((($('#create-target') as HTMLSelectElement).value)) as Brasta.TargetScore; await client().createRoom(name, el.dataset.createRoom as Brasta.Mode, target); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); } });
    document.querySelectorAll<HTMLElement>('[data-join-room]').forEach((el) => el.onclick = async () => { const code = BrastaNet.normalizeCode((($('#join-code') as HTMLInputElement).value)); const name = ($('#join-name') as HTMLInputElement).value.trim(); if (!code || !name) { lastError = 'Enter both a room code and your display name.'; renderLanding(); return; } context = 'online'; inviteRoomCode = code; lastError = null; try { const saved = BrastaNet.loadSession(code, 'player'); await client().joinRoom(code, name, saved?.token); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); } });
    document.querySelectorAll<HTMLElement>('[data-spectate-room]').forEach((el) => el.onclick = async () => { const code = BrastaNet.normalizeCode((($('#join-code') as HTMLInputElement).value)); const name = ($('#join-name') as HTMLInputElement).value.trim(); if (!code || !name) { lastError = 'Enter both a room code and your display name.'; renderLanding(); return; } context = 'online'; inviteRoomCode = ''; lastError = null; try { const saved = BrastaNet.loadSession(code, 'spectator'); await client().spectateRoom(code, name, saved?.token); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); } });
    document.querySelectorAll<HTMLElement>('[data-reconnect-room]').forEach((el) => el.onclick = async () => { const code = BrastaNet.normalizeCode((($('#join-code') as HTMLInputElement).value)); const saved = BrastaNet.loadSession(code, 'player'); if (!saved) { lastError = 'No reconnect token is stored for this room.'; renderLanding(); return; } context = 'online'; inviteRoomCode = code; lastError = null; try { await client().joinRoom(code, saved.name, saved.token); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); } });
  }

  function bindLobby(): void {
    document.querySelectorAll<HTMLElement>('[data-start-online]').forEach((el) => el.onclick = () => onlineClient?.startGame());
    document.querySelectorAll<HTMLElement>('[data-copy-invite]').forEach((el) => el.onclick = () => copyInvite(el));
    document.querySelectorAll<HTMLElement>('[data-copy-spectate]').forEach((el) => el.onclick = () => copySpectate(el));
    document.querySelectorAll<HTMLElement>('[data-copy-code]').forEach((el) => el.onclick = () => onlineRoom && void copyText(onlineRoom.code, el));
    document.querySelectorAll<HTMLElement>('[data-online-home]').forEach((el) => el.onclick = goHomeFromOnline);
  }

  function client(): BrastaNet.Client {
    if (onlineClient) return onlineClient;
    onlineClient = new BrastaNet.Client((event) => {
      if (event.type === 'status') { connectionStatus = event.status; emitChatContext(); if (context === 'online') render(); }
      else if (event.type === 'session') {
        onlineSession = event.session;
        inviteRoomCode = event.session.role === 'player' ? event.session.code : '';
        context = 'online';
        if (event.session.role === 'player') {
          client().claimAccount();
          window.dispatchEvent(new CustomEvent('brasta-player-session', {
            detail: { code: event.session.code, seat: event.session.seat },
          }));
        }
        const key = event.session.role === 'spectator' ? 'spectate' : 'room';
        history.replaceState({}, '', `${location.pathname}?${key}=${encodeURIComponent(event.session.code)}`);
        if (pendingFriendRoomMode && event.session.role === 'player') {
          const mode = pendingFriendRoomMode;
          pendingFriendRoomMode = null;
          window.dispatchEvent(new CustomEvent('brasta-friend-room-created', {
            detail: { code: event.session.code, mode },
          }));
        }
        if (pendingAccountResume && event.session.role === 'player') {
          pendingAccountResume = false;
          window.dispatchEvent(new CustomEvent('brasta-account-resume-success', {
            detail: { code: event.session.code, seat: event.session.seat },
          }));
        }
        emitChatContext();
        render();
      }
      else if (event.type === 'room') { onlineRoom = event.update.room; state = event.update.state; context = 'online'; if (!onlineSession) { const role = event.update.you.role; const stored = BrastaNet.loadSession(event.update.room.code, role); if (stored) onlineSession = stored; } if (onlineSession && onlineSession.role === event.update.you.role && (onlineSession.role === 'spectator' || onlineSession.seat === event.update.you.seat)) { onlineSession = { ...onlineSession, name: event.update.you.name, isHost: event.update.you.isHost, role: event.update.you.role, seat: event.update.you.seat }; BrastaNet.saveSession(onlineSession); } if (event.update.room.revision !== lastOnlineRevision) { lastOnlineRevision = event.update.room.revision; resetInteraction(); } commandPending = false; lastError = null; emitChatContext(); render(); }
      else if (event.type === 'roomClosed') {
        const code = onlineRoom?.code || onlineSession?.code || '';
        const role = onlineSession?.role || 'player';
        abandonPending = false;
        onlineClient?.close(); onlineClient = null; onlineRoom = null; onlineSession = null; state = null; inviteRoomCode = ''; connectionStatus = 'disconnected'; lastOnlineRevision = -1; context = null; resetInteraction(); notice = event.message; emitChatContext(); if (code) BrastaNet.clearSession(code, role); history.replaceState({}, '', location.pathname); render();
        window.dispatchEvent(new CustomEvent('brasta-match-abandoned', { detail: { message: event.message } }));
      }
      else if (event.type === 'error') {
        commandPending = false;
        lastError = event.message;
        if (abandonPending) {
          abandonPending = false;
          window.dispatchEvent(new CustomEvent('brasta-abandon-match-error', { detail: { message: event.message } }));
        }
        if (pendingFriendRoomMode) {
          pendingFriendRoomMode = null;
          window.dispatchEvent(new CustomEvent('brasta-friend-room-create-error', { detail: { message: event.message } }));
        }
        if (pendingAccountResume) {
          pendingAccountResume = false;
          window.dispatchEvent(new CustomEvent('brasta-account-resume-error', { detail: { message: event.message } }));
        }
        render();
      }
      else if (event.type === 'notice') { if (event.message && event.message !== 'Connected to Brasta.') notice = event.message; render(); }
    });
    return onlineClient;
  }

  function emitChatContext(): void {
    const detail = {
      active: Boolean(context === 'online' && onlineRoom?.started && state && onlineSession),
      roomCode: onlineRoom?.code || onlineSession?.code || '',
      mode: onlineRoom?.mode || null,
      role: onlineSession?.role || null,
      seat: onlineSession?.seat || null,
      name: onlineSession?.name || '',
      ranked: Boolean(onlineRoom?.ranked),
      status: connectionStatus,
    };
    (window as any).__BRASTA_CHAT_CONTEXT__ = detail;
    window.dispatchEvent(new CustomEvent('brasta-chat-context', { detail }));
  }

  function inviteUrl(code: string): string { if (location.protocol === 'file:') return `Room ${code}`; return `${location.origin}${location.pathname}?room=${encodeURIComponent(code)}`; }
  function spectateUrl(code: string): string { if (location.protocol === 'file:') return `Spectate ${code}`; return `${location.origin}${location.pathname}?spectate=${encodeURIComponent(code)}`; }
  function showCopiedState(button: HTMLElement | null): void {
    if (!(button instanceof HTMLButtonElement)) return;
    const original = button.innerHTML;
    button.classList.add('copy-confirmed');
    button.innerHTML = `<svg class="copy-confirm-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 7.25A2.25 2.25 0 0 1 10.25 5h7.5A2.25 2.25 0 0 1 20 7.25v7.5A2.25 2.25 0 0 1 17.75 17h-7.5A2.25 2.25 0 0 1 8 14.75v-7.5Zm-4 2A2.25 2.25 0 0 1 6.25 7H7v7.75A3.25 3.25 0 0 0 10.25 18H18v.75A2.25 2.25 0 0 1 15.75 21h-9.5A2.25 2.25 0 0 1 4 18.75v-9.5Z"/></svg><span>Copied</span>`;
    window.setTimeout(() => {
      if (!button.isConnected) return;
      button.innerHTML = original;
      button.classList.remove('copy-confirmed');
    }, 1600);
  }

  async function copyText(text: string, button: HTMLElement | null = null): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      notice = null;
      showCopiedState(button);
    } catch {
      notice = `Copy this: ${text}`;
      render();
    }
  }
  function copyInvite(button: HTMLElement | null = null): void { if (!onlineRoom) return; void copyText(inviteUrl(onlineRoom.code), button); }
  function copySpectate(button: HTMLElement | null = null): void { if (!onlineRoom) return; void copyText(spectateUrl(onlineRoom.code), button); }
  function goHomeFromOnline(): void {
    const code = onlineRoom?.code || onlineSession?.code || '';
    const role = onlineSession?.role || 'player';
    const wasPregame = !!onlineRoom && !onlineRoom.started;
    const shouldLeave = role === 'spectator' || wasPregame;
    if (shouldLeave) onlineClient?.leaveRoom();
    onlineClient?.close(); onlineClient = null; onlineRoom = null; onlineSession = null; state = null; inviteRoomCode = ''; connectionStatus = 'disconnected'; lastOnlineRevision = -1; context = null; resetInteraction(); emitChatContext(); if (code && shouldLeave) BrastaNet.clearSession(code, role); history.replaceState({}, '', location.pathname); render();
  }

  function renderLab(): void {
    context = 'lab'; const app = $('#app'); if (!state || state.message !== 'Rules Lab') state = Brasta.scenario('build7');
    const hand = state.players[0].hand; const legal = selectedCard ? Brasta.legalActionsForCard(state, 1, selectedCard) : [];
    app.innerHTML = `${renderHeader()}<main class="lab"><h1>Rules Lab</h1><p>Load a canned regression scenario, select a hand card, and inspect the same engine used by the authoritative online server.</p><div class="button-row lab-scenarios">${['build7', 'add8', 'raise8', 'capture8', 'jackBuild', 'burnJack', 'brasta'].map((n) => `<button data-scenario="${n}">${n}</button>`).join('')}</div><div class="lab-grid"><div>${renderBoard()}<section class="hand-area"><div class="hand-title">Seat 1 test hand</div><div class="hand">${hand.map((id) => cardHtml(id, { clickable: true, selected: selectedCard === id })).join('')}</div></section>${renderActions()}</div><div class="inspector"><h3>Legal Actions</h3><pre>${escapeHtml(JSON.stringify(legal, null, 2))}</pre><h3>State</h3><pre>${escapeHtml(JSON.stringify(state, null, 2))}</pre></div></div></main>`;
    bindLab();
  }
  function bindLab(): void {
    document.querySelectorAll<HTMLElement>('[data-scenario]').forEach((el) => el.onclick = () => {
      state = Brasta.scenario(el.dataset.scenario!);
      resetInteraction();
      covered = false;
      renderLab();
    });

    document.querySelectorAll<HTMLElement>('[data-card]').forEach((el) => el.onclick = () => {
      if (!state) return;
      const id = el.dataset.card!;
      if (state.loose.includes(id)) {
        selectedLoose.has(id) ? selectedLoose.delete(id) : selectedLoose.add(id);
        pendingAction = null;
        selectedDeclaration = null;
        renderLab();
        return;
      }
      const ownHand = state.players[0]?.hand || [];
      if (!ownHand.includes(id)) return;
      selectedCard = id;
      pendingAction = null;
      selectedDeclaration = null;
      renderLab();
    });

    document.querySelectorAll<HTMLElement>('[data-build]').forEach((el) => el.onclick = () => {
      const id = el.dataset.build || '';
      if (!id) return;
      selectedBuildId = selectedBuildId === id ? null : id;
      pendingAction = null;
      selectedDeclaration = null;
      renderLab();
    });

    document.querySelectorAll<HTMLElement>('[data-direct-action]').forEach((el) => el.onclick = () => {
      const index = Number(el.dataset.directAction);
      const action = directActions[index];
      if (action) labExecute(action.command);
    });

    document.querySelectorAll<HTMLElement>('[data-nav="game"],[data-action="new"]').forEach((el) => el.onclick = () => {
      location.hash = '';
      context = null;
      state = null;
      resetInteraction();
      renderLanding();
    });
  }
  function labExecute(command: Brasta.Command): void { if (!state) return; const result = Brasta.applyCommand(state, command); if (result.ok) { state = result.state; resetInteraction(); state.message = 'Rules Lab'; state.phase = 'play'; state.currentSeat = 1; } else lastError = result.error || 'Rejected'; renderLab(); }
  function labSubmitPending(): void {
    if (!state || !selectedCard || !pendingAction) return;
    if (pendingAction === 'CAPTURE_LOOSE') labExecute({ type: 'CAPTURE_LOOSE', seat: 1, cardId: selectedCard, looseIds: [...selectedLoose] });
    else if (pendingAction === 'MAKE_BUILD') { if (!selectedDeclaration) { lastError = 'Choose declaration'; renderLab(); return; } labExecute({ type: 'MAKE_BUILD', seat: 1, cardId: selectedCard, declaredValue: selectedDeclaration.value, declaredRank: selectedDeclaration.rank, looseIds: [...selectedLoose] }); }
    else if (pendingAction === 'ADD_TO_BUILD') { if (!selectedBuildId) { lastError = 'Choose build'; renderLab(); return; } labExecute({ type: 'ADD_TO_BUILD', seat: 1, cardId: selectedCard, buildId: selectedBuildId, looseIds: [...selectedLoose] }); }
    else if (pendingAction === 'RAISE_BUILD') { if (!selectedBuildId) { lastError = 'Choose build'; renderLab(); return; } labExecute({ type: 'RAISE_BUILD', seat: 1, cardId: selectedCard, buildId: selectedBuildId }); }
    else if (pendingAction === 'CAPTURE_BUILD') { if (!selectedBuildId) { lastError = 'Choose build'; renderLab(); return; } labExecute({ type: 'CAPTURE_BUILD', seat: 1, cardId: selectedCard, buildId: selectedBuildId, looseIds: [...selectedLoose] }); }
  }

  async function autoReconnectFromUrl(): Promise<void> {
    if (location.hash === '#lab') return;
    const params = new URLSearchParams(location.search);
    const spectateCode = BrastaNet.normalizeCode(params.get('spectate') || '');
    if (spectateCode) {
      const saved = BrastaNet.loadSession(spectateCode, 'spectator');
      if (!saved) { renderLanding(); return; }
      context = 'online'; try { await client().spectateRoom(spectateCode, saved.name, saved.token); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); }
      return;
    }
    const code = BrastaNet.normalizeCode(params.get('room') || ''); if (!code) return;
    inviteRoomCode = code; const saved = BrastaNet.loadSession(code, 'player'); if (!saved) { renderLanding(); return; }
    context = 'online'; try { await client().joinRoom(code, saved.name, saved.token); } catch (e) { context = null; lastError = (e as Error).message; renderLanding(); }
  }

  window.addEventListener('hashchange', () => { if (location.hash === '#lab') { context = 'lab'; state = null; resetInteraction(); renderLab(); } else if (context === 'lab') { context = null; state = null; resetInteraction(); renderLanding(); } });
  window.addEventListener('brasta-send-emote', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ emote?: string }>;
    const emote = String(event.detail?.emote || '').trim();
    if (!emote || context !== 'online' || !onlineRoom?.started || onlineSession?.role !== 'player') return;
    client().emote(emote);
  });
  window.addEventListener('brasta-send-chat', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ text?: string }>;
    const text = String(event.detail?.text || '').trim();
    if (!text) return;
    if (context !== 'online' || !onlineRoom?.started || !state || !onlineSession) {
      window.dispatchEvent(new CustomEvent('brasta-chat-error', { detail: { message: 'Match chat is not available here.' } }));
      return;
    }
    if (onlineSession.role !== 'player') {
      window.dispatchEvent(new CustomEvent('brasta-chat-error', { detail: { message: 'Spectators can read match chat but cannot send messages.' } }));
      return;
    }
    client().chat(text);
  });
  window.addEventListener('brasta-accept-chat-policy', () => {
    if (context !== 'online' || !onlineSession) return;
    client().acceptChatPolicy();
  });
  window.addEventListener('brasta-report-chat', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ messageId?: string; reason?: string; details?: string }>;
    const messageId = String(event.detail?.messageId || '').trim();
    const reason = String(event.detail?.reason || '').trim();
    if (!messageId || !reason || context !== 'online' || !onlineSession) return;
    client().reportChat(messageId, reason, String(event.detail?.details || ''));
  });
  window.addEventListener('brasta-block-chat-user', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ messageId?: string }>;
    const messageId = String(event.detail?.messageId || '').trim();
    if (!messageId || context !== 'online' || !onlineSession) return;
    client().blockChatUser(messageId);
  });
  window.addEventListener('brasta-ranked-turn-timeout', () => {
    if (
      context !== 'online'
      || state?.phase !== 'play'
      || !currentRoomIsRanked()
      || onlineSession?.role !== 'player'
    ) return;
    client().rankedTurnTimeout();
  });

  window.addEventListener('brasta-abandon-match', () => {
    if (abandonPending) return;
    if (context !== 'online' || !onlineRoom?.started || !state || onlineSession?.role !== 'player') {
      window.dispatchEvent(new CustomEvent('brasta-abandon-match-error', { detail: { message: 'There is no active private match to abandon.' } }));
      return;
    }
    if (currentRoomIsRanked()) {
      window.dispatchEvent(new CustomEvent('brasta-abandon-match-error', { detail: { message: 'Ranked matches must use Forfeit Match.' } }));
      return;
    }
    abandonPending = true;
    client().abandonMatch();
  });

  window.addEventListener('brasta-auth-changed', () => {
    if (context === 'online' && onlineSession?.role === 'player') client().claimAccount();
  });

  window.addEventListener('brasta-account-resume', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ accessToken?: string }>;
    const accessToken = String(event.detail?.accessToken || '').trim();
    if (!accessToken) {
      window.dispatchEvent(new CustomEvent('brasta-account-resume-error', { detail: { message: 'Sign in again to resume your match.' } }));
      return;
    }
    if (context === 'online' || onlineRoom || onlineSession) {
      window.dispatchEvent(new CustomEvent('brasta-account-resume-error', { detail: { message: 'Leave your current room before resuming another match.' } }));
      return;
    }
    pendingAccountResume = true;
    context = 'online';
    lastError = null;
    notice = null;
    void client().resumeAccount(accessToken).catch((error) => {
      pendingAccountResume = false;
      context = null;
      lastError = (error as Error).message;
      window.dispatchEvent(new CustomEvent('brasta-account-resume-error', { detail: { message: lastError } }));
      renderLanding();
    });
  });

  window.addEventListener('brasta-create-friend-room', (rawEvent) => {
    const event = rawEvent as CustomEvent<{ mode?: Brasta.Mode; targetScore?: Brasta.TargetScore }>;
    if (context === 'online' || onlineRoom || onlineSession) {
      window.dispatchEvent(new CustomEvent('brasta-friend-room-create-error', { detail: { message: 'Leave your current room before creating another private invite.' } }));
      return;
    }
    const mode: Brasta.Mode = event.detail?.mode === '2v2' ? '2v2' : '1v1';
    const targetScore: Brasta.TargetScore = Number(event.detail?.targetScore) === 220 ? 220 : 110;
    const name = BrastaNet.lastName().trim() || 'Player';
    pendingFriendRoomMode = mode;
    context = 'online';
    lastError = null;
    notice = null;
    void client().createRoom(name, mode, targetScore).catch((error) => {
      pendingFriendRoomMode = null;
      context = null;
      lastError = (error as Error).message;
      window.dispatchEvent(new CustomEvent('brasta-friend-room-create-error', { detail: { message: lastError } }));
      renderLanding();
    });
  });

  window.addEventListener('DOMContentLoaded', () => { if (location.hash === '#lab') { context = 'lab'; renderLab(); return; } renderLanding(); void autoReconnectFromUrl(); });
}
