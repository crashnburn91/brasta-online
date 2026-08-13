function postProcessBrastaRules(previousState: any, command: any, result: any): any {
  if (!result?.ok || !result.state) return result;
  const next = result.state;

  if (command?.type === 'RAISE_BUILD') {
    const target = next.builds?.find((build: any) => build.id === command.buildId);
    if (target?.kind === 'numeric' && target.declaredValue != null) {
      const newValue = target.declaredValue;
      const matching = next.builds.filter((build: any) =>
        build.id !== target.id && build.kind === 'numeric' && build.declaredValue === newValue
      );
      for (const build of matching) {
        target.groups.push(...build.groups);
        target.modifiers.push(...build.modifiers);
      }
      if (matching.length) {
        const mergedIds = new Set(matching.map((build: any) => build.id));
        next.builds = next.builds.filter((build: any) => !mergedIds.has(build.id));
        const suffix = ` and combined ${matching.length + 1} BUILD ${newValue} piles`;
        if (typeof next.lastMove === 'string') next.lastMove = next.lastMove.replace(/\.$/, `${suffix}.`);
        next.event = next.event ? `${next.event} • BUILDS COMBINED` : `BUILD ${newValue} • BUILDS COMBINED`;
      }
    }
  }

  const finalDealStarted = previousState.deck?.length > 0
    && next.deck?.length === 0
    && next.phase === 'play'
    && Array.isArray(next.players)
    && next.players.every((player: any) => player.hand?.length === 4);

  if (finalDealStarted) {
    if (!(next.event || '').includes('LAST HAND!')) {
      next.event = next.event ? `${next.event} • LAST HAND!` : 'LAST HAND!';
    }
    next.message = `LAST HAND! Final four-card deal. Seat ${next.currentSeat}'s turn.`;
  }

  return result;
}
