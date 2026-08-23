// Appended to the generated server engine by scripts/sync-server-engine.mjs.
type OwnedBuild = Build & { ownerSeat?: Seat };

function brastaSameDeclaration(build: OwnedBuild, option: BuildDeclarationOption): boolean {
  if (option.kind === 'numeric') return build.kind === 'numeric' && build.declaredValue === option.value;
  return build.kind === 'rank' && build.declaredRank === option.rank;
}

function brastaCardMatchesBuild(state: GameState, cardId: string, build: OwnedBuild): boolean {
  const card = state.cards[cardId];
  if (!card) return false;
  if (build.kind === 'numeric') return card.value != null && card.value === build.declaredValue;
  return (card.rank === 'Q' || card.rank === 'K') && card.rank === build.declaredRank;
}

function brastaCanSpendAwayFromOwnedBuild(state: GameState, seat: Seat, cardId: string): boolean {
  const ownedMatching = (state.builds as OwnedBuild[]).filter((build) => build.ownerSeat === seat && brastaCardMatchesBuild(state, cardId, build));
  if (!ownedMatching.length) return true;
  const hand = state.players.find((player) => player.seat === seat)?.hand || [];
  return ownedMatching.every((build) => hand.some((id) => id !== cardId && brastaCardMatchesBuild(state, id, build)));
}

const brastaOriginalDeclarations = getBuildDeclarationOptions;
getBuildDeclarationOptions = function(state: GameState, seat: Seat, cardId: CardId): BuildDeclarationOption[] {
  return brastaOriginalDeclarations(state, seat, cardId).filter((option) => {
    const existing = (state.builds as OwnedBuild[]).find((build) => brastaSameDeclaration(build, option));
    return !existing || existing.ownerSeat == null || existing.ownerSeat === seat;
  });
};

const brastaOriginalLegalActions = legalActionsForCard;
legalActionsForCard = function(state: GameState, seat: Seat, cardId: CardId): LegalAction[] {
  let actions = brastaOriginalLegalActions(state, seat, cardId);
  if (!brastaCanSpendAwayFromOwnedBuild(state, seat, cardId)) {
    actions = actions.filter((action) => action.type !== 'PLAY_LOOSE' && action.type !== 'CAPTURE_LOOSE');
  }
  if (!getBuildDeclarationOptions(state, seat, cardId).length) {
    actions = actions.filter((action) => action.type !== 'MAKE_BUILD');
  }
  return actions;
};

const brastaOriginalApplyCommand = applyCommand;
applyCommand = function(state: GameState, command: Command): ApplyResult {
  if ((command.type === 'PLAY_LOOSE' || command.type === 'CAPTURE_LOOSE') && !brastaCanSpendAwayFromOwnedBuild(state, command.seat, command.cardId)) {
    return { ok: false, state, error: 'You must keep a matching card in your hand for your build.' };
  }

  let existingSame: OwnedBuild | undefined;
  if (command.type === 'MAKE_BUILD') {
    const option: BuildDeclarationOption | null = command.declaredValue != null
      ? { kind: 'numeric', value: command.declaredValue, label: `BUILD ${command.declaredValue}` }
      : command.declaredRank
        ? { kind: 'rank', rank: command.declaredRank, label: `BUILD ${command.declaredRank}` }
        : null;
    if (option) {
      existingSame = (state.builds as OwnedBuild[]).find((build) => brastaSameDeclaration(build, option));
      if (existingSame?.ownerSeat != null && existingSame.ownerSeat !== command.seat) {
        return { ok: false, state, error: `${option.label} already belongs to another player. You cannot create a separate build of the same value.` };
      }
    }
  }

  const result = brastaOriginalApplyCommand(state, command);
  if (!result.ok) return result;
  const nextBuilds = result.state.builds as OwnedBuild[];

  if (command.type === 'MAKE_BUILD') {
    const made = nextBuilds.filter((build) => {
      if (command.declaredValue != null) return build.kind === 'numeric' && build.declaredValue === command.declaredValue;
      return build.kind === 'rank' && build.declaredRank === command.declaredRank;
    });

    if (existingSame) {
      const target = nextBuilds.find((build) => build.id === existingSame!.id);
      const created = made.find((build) => build.id !== existingSame!.id);
      if (target && created) {
        target.groups.push(...created.groups);
        target.modifiers.push(...created.modifiers);
        target.ownerSeat = command.seat;
        result.state.builds = nextBuilds.filter((build) => build.id !== created.id);
        const label = buildLabel(target);
        result.state.event = `Added to ${label}`;
        result.state.lastMove = `${result.state.players.find((p) => p.seat === command.seat)?.name || `Seat ${command.seat}`} added another set to ${label}.`;
      }
    } else {
      const created = made[made.length - 1];
      if (created) created.ownerSeat = command.seat;
    }
  }

  if (command.type === 'ADD_TO_BUILD') {
    const target = nextBuilds.find((build) => build.id === command.buildId);
    if (target) target.ownerSeat = command.seat;
  }

  if (command.type === 'RAISE_BUILD') {
    const target = nextBuilds.find((build) => build.id === command.buildId);
    if (target) target.ownerSeat = command.seat;
  }

  return result;
};
