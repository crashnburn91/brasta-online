(() => {
  type AnyBuild = Brasta.Build & { ownerSeat?: Brasta.Seat };
  const engine = Brasta as any;
  const owners = new Map<string, Brasta.Seat>();
  (globalThis as any).__BRASTA_BUILD_OWNERS__ = owners;

  function sameDeclaration(build: AnyBuild, option: Brasta.BuildDeclarationOption): boolean {
    if (option.kind === 'numeric') return build.kind === 'numeric' && build.declaredValue === option.value;
    return build.kind === 'rank' && build.declaredRank === option.rank;
  }

  function sameBuildDeclaration(a: AnyBuild, b: AnyBuild): boolean {
    if (a.kind !== b.kind) return false;
    return a.kind === 'numeric' ? a.declaredValue === b.declaredValue : a.declaredRank === b.declaredRank;
  }

  function cardMatchesBuild(state: Brasta.GameState, cardId: string, build: AnyBuild): boolean {
    const card = state.cards[cardId];
    if (!card) return false;
    if (build.kind === 'numeric') return card.value != null && card.value === build.declaredValue;
    return (card.rank === 'Q' || card.rank === 'K') && card.rank === build.declaredRank;
  }

  function canSpendAwayFromOwnedBuild(state: Brasta.GameState, seat: Brasta.Seat, cardId: string): boolean {
    const ownedMatching = (state.builds as AnyBuild[]).filter((build) => build.ownerSeat === seat && cardMatchesBuild(state, cardId, build));
    if (!ownedMatching.length) return true;
    const hand = state.players.find((player) => player.seat === seat)?.hand || [];
    return ownedMatching.every((build) => hand.some((id) => id !== cardId && cardMatchesBuild(state, id, build)));
  }

  const originalDeclarations = Brasta.getBuildDeclarationOptions.bind(Brasta);
  engine.getBuildDeclarationOptions = function(state: Brasta.GameState, seat: Brasta.Seat, cardId: string): Brasta.BuildDeclarationOption[] {
    return originalDeclarations(state, seat, cardId).filter((option) => {
      const existing = (state.builds as AnyBuild[]).find((build) => sameDeclaration(build, option));
      return !existing || existing.ownerSeat == null || existing.ownerSeat === seat;
    });
  };

  const originalLegalActions = Brasta.legalActionsForCard.bind(Brasta);
  engine.legalActionsForCard = function(state: Brasta.GameState, seat: Brasta.Seat, cardId: string): Brasta.LegalAction[] {
    let actions = originalLegalActions(state, seat, cardId);
    if (!canSpendAwayFromOwnedBuild(state, seat, cardId)) {
      actions = actions.filter((action) => action.type !== 'PLAY_LOOSE' && action.type !== 'CAPTURE_LOOSE');
    }
    if (!engine.getBuildDeclarationOptions(state, seat, cardId).length) {
      actions = actions.filter((action) => action.type !== 'MAKE_BUILD');
    }
    return actions;
  };

  const originalApplyCommand = Brasta.applyCommand.bind(Brasta);
  engine.applyCommand = function(state: Brasta.GameState, command: Brasta.Command): Brasta.ApplyResult {
    if ((command.type === 'PLAY_LOOSE' || command.type === 'CAPTURE_LOOSE') && !canSpendAwayFromOwnedBuild(state, command.seat, command.cardId)) {
      return { ok: false, state, error: 'You must keep a matching card in your hand for your build.' };
    }

    let existingSame: AnyBuild | undefined;
    if (command.type === 'MAKE_BUILD') {
      const option: Brasta.BuildDeclarationOption | null = command.declaredValue != null
        ? { kind: 'numeric', value: command.declaredValue, label: `BUILD ${command.declaredValue}` }
        : command.declaredRank
          ? { kind: 'rank', rank: command.declaredRank, label: `BUILD ${command.declaredRank}` }
          : null;
      if (option) {
        existingSame = (state.builds as AnyBuild[]).find((build) => sameDeclaration(build, option));
        if (existingSame?.ownerSeat != null && existingSame.ownerSeat !== command.seat) {
          return { ok: false, state, error: `${option.label} already belongs to another player. You cannot create a separate build of the same value.` };
        }
      }
    }

    const result = originalApplyCommand(state, command);
    if (!result.ok) return result;
    const nextBuilds = result.state.builds as AnyBuild[];

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
          const label = Brasta.buildLabel(target);
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

  const originalBuildLabel = Brasta.buildLabel.bind(Brasta);
  engine.buildLabel = function(build: Brasta.Build): string {
    const owned = build as AnyBuild;
    if (owned.ownerSeat != null) owners.set(build.id, owned.ownerSeat);
    else owners.delete(build.id);
    return originalBuildLabel(build);
  };
})();
