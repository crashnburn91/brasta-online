import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'lib/brasta-server.ts');
let source = fs.readFileSync(file, 'utf8');

const oldBlock = `function burnPickupOptions(state: Brasta.GameState, offenderSeat: Brasta.Seat, cardId: Brasta.CardId): BurnPickupOption[] {
  const legal = Brasta.legalActionsForCard(state, offenderSeat, cardId);
  const canLoose = legal.some((action) => action.type === 'CAPTURE_LOOSE');
  const canBuild = legal.some((action) => action.type === 'CAPTURE_BUILD');
  if (!canLoose && !canBuild) return [];

  const raw: Omit<BurnPickupOption, 'id'>[] = [];
  if (canLoose) {
    for (const looseIds of maximalLooseSetsForCard(state, cardId)) {
      if (!looseIds.length) continue;
      raw.push({
        label: \`Loose: \${cardListLabel(state, looseIds)}\`,
        kind: 'loose',
        looseIds,
        captureCount: looseIds.length + 1,
      });
    }
  }

  if (canBuild) {
    for (const build of Brasta.getCapturableBuilds(state, cardId)) {
      for (const looseIds of looseSetsForBuild(state, build)) {
        const extra = looseIds.length ? \` + \${cardListLabel(state, looseIds)}\` : '';
        raw.push({
          label: \`\${Brasta.buildLabel(build)}\${extra}\`,
          kind: 'build',
          buildId: build.id,
          looseIds,
          captureCount: cardIdsInBuild(build).length + looseIds.length + 1,
        });
      }
    }
  }

  const deduped = new Map<string, Omit<BurnPickupOption, 'id'>>();
  for (const option of raw) {
    const key = \`\${option.kind}:\${option.buildId || ''}:\${[...option.looseIds].sort().join(',')}\`;
    deduped.set(key, option);
  }
  return [...deduped.values()]
    .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((option, index) => ({ ...option, id: \`burn-option-\${index + 1}\` }));
}`;

const newBlock = `function burnPickupOptions(state: Brasta.GameState, offenderSeat: Brasta.Seat, cardId: Brasta.CardId): BurnPickupOption[] {
  // Burn detection must be derived from the authoritative board BEFORE the
  // offender played the card loose. Do not gate this through legalActionsForCard:
  // that UI-oriented summary can omit a capture even when a concrete capture
  // command is valid (notably matching Q/K pickups).
  const raw: Omit<BurnPickupOption, 'id'>[] = [];

  for (const looseIds of maximalLooseSetsForCard(state, cardId)) {
    if (!looseIds.length) continue;
    const command: Brasta.Command = { type: 'CAPTURE_LOOSE', seat: offenderSeat, cardId, looseIds };
    if (!Brasta.applyCommand(state, command).ok) continue;
    raw.push({
      label: \`Loose: \${cardListLabel(state, looseIds)}\`,
      kind: 'loose',
      looseIds,
      captureCount: looseIds.length + 1,
    });
  }

  for (const build of Brasta.getCapturableBuilds(state, cardId)) {
    for (const looseIds of looseSetsForBuild(state, build)) {
      const command: Brasta.Command = { type: 'CAPTURE_BUILD', seat: offenderSeat, cardId, buildId: build.id, looseIds };
      if (!Brasta.applyCommand(state, command).ok) continue;
      const extra = looseIds.length ? \` + \${cardListLabel(state, looseIds)}\` : '';
      raw.push({
        label: \`\${Brasta.buildLabel(build)}\${extra}\`,
        kind: 'build',
        buildId: build.id,
        looseIds,
        captureCount: cardIdsInBuild(build).length + looseIds.length + 1,
      });
    }
  }

  const deduped = new Map<string, Omit<BurnPickupOption, 'id'>>();
  for (const option of raw) {
    const key = \`\${option.kind}:\${option.buildId || ''}:\${[...option.looseIds].sort().join(',')}\`;
    deduped.set(key, option);
  }
  return [...deduped.values()]
    .sort((a, b) => b.captureCount - a.captureCount || a.label.localeCompare(b.label))
    .slice(0, 12)
    .map((option, index) => ({ ...option, id: \`burn-option-\${index + 1}\` }));
}`;

if (
  source.includes("const command: Brasta.Command = { type: 'CAPTURE_LOOSE'") &&
  source.includes("const command: Brasta.Command = { type: 'CAPTURE_BUILD'")
) {
  console.log('Burn detection patch already applied');
  process.exit(0);
}
if (source.includes(newBlock)) {
  console.log('Burn detection patch already applied');
  process.exit(0);
}
if (!source.includes(oldBlock)) {
  throw new Error('Could not locate burnPickupOptions block to patch');
}
source = source.replace(oldBlock, newBlock);
fs.writeFileSync(file, source);
console.log('Patched burn detection to validate concrete pre-move capture commands');
