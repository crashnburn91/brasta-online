namespace BrastaCompact {
  const SUIT_NAMES: Record<string, string> = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' };
  let busy = false;
  let stagedHandId = '';
  const stagedLoose = new Set<string>();
  let stagedBuildId = '';

  type ParsedCard = { rank: string; suit: string; value: number | null; label: string };
  type ContextAction = { type: string; label: string };

  function parseCardLabel(label: string): ParsedCard | null {
    const text = label.trim();
    const suitSymbol = text.slice(-1);
    const suit = SUIT_NAMES[suitSymbol];
    if (!suit) return null;
    const rank = text.slice(0, -1).trim().toUpperCase();
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? Number(rank) : null;
    return { rank, suit, value, label: text };
  }

  function selectedHandButton(): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>('.hand .card.selected[aria-label]');
  }

  function selectedHandCard(): ParsedCard | null {
    const button = selectedHandButton();
    return button ? parseCardLabel(button.getAttribute('aria-label') || '') : null;
  }

  function selectedHandId(): string {
    return selectedHandButton()?.dataset.card || '';
  }

  function handCards(excludeSelected = false): ParsedCard[] {
    const selected = selectedHandButton();
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.hand .card[aria-label]'))
      .filter((button) => !excludeSelected || button !== selected)
      .map((button) => parseCardLabel(button.getAttribute('aria-label') || ''))
      .filter((card): card is ParsedCard => !!card);
  }

  function selectedLooseCards(): ParsedCard[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.loose-row .card.selected[aria-label]'))
      .map((button) => parseCardLabel(button.getAttribute('aria-label') || ''))
      .filter((card): card is ParsedCard => !!card);
  }

  function stagedLooseCards(): ParsedCard[] {
    return Array.from(stagedLoose)
      .map((label) => parseCardLabel(label))
      .filter((card): card is ParsedCard => !!card);
  }

  function actionButton(type: string): HTMLButtonElement | null {
    return document.querySelector<HTMLButtonElement>(`[data-legal="${type}"]`);
  }

  function pendingAction(panel: HTMLElement): string | null {
    if (!panel.querySelector('[data-submit]')) return null;
    return (panel.querySelector('h3')?.textContent || '').trim().toUpperCase().replace(/\s+/g, '_');
  }

  function selectedBuildLabel(panel: HTMLElement): string {
    const selectedChoice = panel.querySelector<HTMLElement>('[data-buildchoice].selected');
    if (selectedChoice?.textContent) return selectedChoice.textContent.trim();
    const selectedBoard = document.querySelector<HTMLElement>('.build.selected .build-label');
    return selectedBoard?.textContent?.trim() || '';
  }

  function stagedBuildLabel(): string {
    if (!stagedBuildId) return '';
    const build = Array.from(document.querySelectorAll<HTMLElement>('.build[data-build]'))
      .find((candidate) => candidate.dataset.build === stagedBuildId);
    return build?.querySelector<HTMLElement>('.build-label')?.textContent?.trim() || '';
  }

  function buildValue(label: string): number | string | null {
    const match = label.toUpperCase().match(/BUILD\s+(10|[1-9]|Q|K)/);
    if (!match) return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
  }

  function canPartition(values: number[], target: number): boolean {
    if (!values.length || target <= 0) return false;
    const sum = values.reduce((total, value) => total + value, 0);
    if (sum % target !== 0) return false;

    const sorted = [...values].sort((a, b) => b - a);
    const groups = sum / target;
    const buckets = Array.from({ length: groups }, () => 0);

    function place(index: number): boolean {
      if (index >= sorted.length) return buckets.every((value) => value === target);
      const value = sorted[index];
      const seen = new Set<number>();
      for (let i = 0; i < buckets.length; i++) {
        if (seen.has(buckets[i])) continue;
        seen.add(buckets[i]);
        if (buckets[i] + value > target) continue;
        buckets[i] += value;
        if (place(index + 1)) return true;
        buckets[i] -= value;
        if (buckets[i] === 0) break;
      }
      return false;
    }

    return place(0);
  }

  function numericLooseValid(target: number): boolean {
    const loose = selectedLooseCards();
    if (!loose.length || loose.some((card) => card.value == null)) return false;
    return canPartition(loose.map((card) => card.value!), target);
  }

  function setText(element: Element | null, text: string): void {
    if (element && element.textContent !== text) element.textContent = text;
  }

  function clickSoon(element: HTMLElement | null, delay = 0): void {
    if (!element || busy) return;
    busy = true;
    window.setTimeout(() => {
      try { element.click(); }
      finally { busy = false; }
    }, delay);
  }

  function findLooseByLabel(label: string): HTMLButtonElement | null {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.loose-row .card[data-card][aria-label]'))
      .find((button) => button.getAttribute('aria-label') === label) || null;
  }

  function buildChoiceById(id: string): HTMLButtonElement | null {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('[data-buildchoice]'))
      .find((button) => button.dataset.buildchoice === id) || null;
  }

  function cancelPending(): void {
    const cancel = document.querySelector<HTMLButtonElement>('[data-cancel]');
    if (cancel) cancel.click();
  }

  function clearStaged(): void {
    stagedLoose.clear();
    stagedBuildId = '';
  }

  function syncStagedHand(): void {
    const handId = selectedHandId();
    if (handId === stagedHandId) return;
    stagedHandId = handId;
    clearStaged();
  }

  function retainedCardMatches(token: number | string): boolean {
    return handCards(true).some((card) => typeof token === 'number' ? card.value === token : card.rank === token);
  }

  function stagedCaptureLooseValid(): boolean {
    const played = selectedHandCard();
    const loose = stagedLooseCards();
    if (!played || !loose.length || !actionButton('CAPTURE_LOOSE')) return false;
    if (played.value != null) {
      return loose.every((card) => card.value != null) && canPartition(loose.map((card) => card.value!), played.value);
    }
    if (played.rank === 'Q' || played.rank === 'K') return loose.every((card) => card.rank === played.rank);
    return false;
  }

  function stagedBuildTargets(): Array<number | string> {
    const played = selectedHandCard();
    const loose = stagedLooseCards();
    if (!played || !loose.length || !actionButton('MAKE_BUILD')) return [];
    const candidates = new Set<number | string>();
    for (const card of handCards(true)) {
      if (card.value != null) candidates.add(card.value);
      else if (card.rank === 'Q' || card.rank === 'K') candidates.add(card.rank);
    }
    return Array.from(candidates).filter((token) => {
      if (typeof token === 'number') {
        if (played.value == null || loose.some((card) => card.value == null)) return false;
        return canPartition([played.value, ...loose.map((card) => card.value!)], token);
      }
      return (token === 'Q' || token === 'K') && played.rank === token && loose.every((card) => card.rank === token);
    });
  }

  function stagedCaptureBuildValid(token: number | string | null): boolean {
    const played = selectedHandCard();
    const loose = stagedLooseCards();
    if (!played || token == null || !stagedBuildId || !actionButton('CAPTURE_BUILD')) return false;
    const matches = typeof token === 'number' ? played.value === token : played.rank === token;
    if (!matches) return false;
    if (!loose.length) return true;
    if (typeof token === 'number') return loose.every((card) => card.value != null) && canPartition(loose.map((card) => card.value!), token);
    return loose.every((card) => card.rank === token);
  }

  function stagedAddBuildValid(token: number | string | null): boolean {
    const played = selectedHandCard();
    const loose = stagedLooseCards();
    if (!played || token == null || !stagedBuildId || !actionButton('ADD_TO_BUILD') || !retainedCardMatches(token)) return false;
    if (typeof token === 'number') {
      if (played.value == null || loose.some((card) => card.value == null)) return false;
      return canPartition([played.value, ...loose.map((card) => card.value!)], token);
    }
    return played.rank === token && loose.every((card) => card.rank === token);
  }

  function stagedRaiseBuildValid(token: number | string | null): boolean {
    const played = selectedHandCard();
    if (!played || typeof token !== 'number' || played.value == null || !stagedBuildId || stagedLoose.size || !actionButton('RAISE_BUILD')) return false;
    const next = token + played.value;
    return next <= 10 && retainedCardMatches(next);
  }

  function contextualActions(): ContextAction[] {
    const played = selectedHandCard();
    if (!played || played.rank === 'J' || (!stagedLoose.size && !stagedBuildId)) return [];
    const actions: ContextAction[] = [];
    if (!stagedBuildId) {
      if (stagedCaptureLooseValid()) actions.push({ type: 'CAPTURE_LOOSE', label: 'Capture' });
      const targets = stagedBuildTargets();
      if (targets.length) actions.push({ type: 'MAKE_BUILD', label: targets.length === 1 ? `Build ${targets[0]}` : 'Build' });
      return actions;
    }

    const token = buildValue(stagedBuildLabel());
    if (stagedCaptureBuildValid(token)) actions.push({ type: 'CAPTURE_BUILD', label: 'Capture' });
    if (stagedAddBuildValid(token)) actions.push({ type: 'ADD_TO_BUILD', label: 'Add to Build' });
    if (stagedRaiseBuildValid(token)) {
      const next = typeof token === 'number' && played.value != null ? token + played.value : null;
      actions.push({ type: 'RAISE_BUILD', label: next ? `Raise to ${next}` : 'Raise Build' });
    }
    return actions;
  }

  function replayLoose(labels: string[], index = 0): void {
    if (index >= labels.length) {
      busy = false;
      return;
    }
    window.setTimeout(() => {
      const target = findLooseByLabel(labels[index]);
      if (target) target.click();
      replayLoose(labels, index + 1);
    }, 0);
  }

  function beginContextAction(type: string): void {
    if (busy) return;
    const button = actionButton(type);
    if (!button) return;
    const looseLabels = Array.from(stagedLoose);
    const buildId = stagedBuildId;
    busy = true;
    button.click();

    window.setTimeout(() => {
      if (buildId) {
        const choice = buildChoiceById(buildId);
        if (choice) choice.click();
      }
      replayLoose(looseLabels);
    }, 0);
  }

  function declarationToken(button: HTMLButtonElement): number | string | null {
    return buildValue(button.textContent || '');
  }

  function validBuildDeclarations(panel: HTMLElement): HTMLButtonElement[] {
    const played = selectedHandCard();
    const loose = selectedLooseCards();
    if (!played || !loose.length) return [];

    return Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-decl]')).filter((button) => {
      const token = declarationToken(button);
      if (typeof token === 'number') {
        if (played.value == null || loose.some((card) => card.value == null)) return false;
        return canPartition([played.value, ...loose.map((card) => card.value!)], token);
      }
      if (token === 'Q' || token === 'K') {
        return played.rank === token && loose.every((card) => card.rank === token);
      }
      return false;
    });
  }

  function resolveDeclaration(panel: HTMLElement): boolean {
    const declarationButtons = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-decl]'));
    if (!declarationButtons.length) return false;

    const valid = validBuildDeclarations(panel);
    for (const button of declarationButtons) button.classList.toggle('compact-invalid-declaration', !valid.includes(button));

    if (valid.length === 1 && !valid[0].classList.contains('selected')) {
      clickSoon(valid[0]);
      return true;
    }
    return false;
  }

  function enableSelectionProbes(): void {
    document.querySelectorAll<HTMLButtonElement>('.loose-row .card[aria-label]').forEach((card) => {
      const label = card.getAttribute('aria-label') || '';
      card.disabled = false;
      card.classList.add('compact-probe');
      card.classList.toggle('compact-staged', stagedLoose.has(label));
      card.dataset.compactLooseProbe = label;
    });

    document.querySelectorAll<HTMLElement>('.build[data-build]').forEach((build) => {
      const id = build.dataset.build || '';
      build.classList.add('compact-probe');
      build.classList.toggle('compact-staged', !!id && stagedBuildId === id);
      build.dataset.compactBuildProbe = id;
      build.setAttribute('aria-disabled', 'false');
      build.tabIndex = 0;
    });
  }

  function renderContextActions(panel: HTMLElement): void {
    let host = panel.querySelector<HTMLElement>('[data-compact-context-actions]');
    const actions = contextualActions();
    const signature = `${stagedBuildId}|${Array.from(stagedLoose).sort().join(',')}|${actions.map((action) => `${action.type}:${action.label}`).join(',')}`;

    if (!stagedLoose.size && !stagedBuildId) {
      host?.remove();
      panel.classList.remove('compact-has-targets');
      return;
    }

    panel.classList.add('compact-has-targets');
    if (!host) {
      host = document.createElement('div');
      host.className = 'compact-context-actions';
      host.dataset.compactContextActions = '1';
      panel.appendChild(host);
    }
    if (host.dataset.signature === signature) return;
    host.dataset.signature = signature;
    host.replaceChildren();

    if (!actions.length) {
      const note = document.createElement('span');
      note.className = 'compact-context-note';
      note.textContent = 'That selection has no capture or build.';
      host.appendChild(note);
      return;
    }

    for (const action of actions) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'primary compact-context-action';
      button.dataset.compactAction = action.type;
      button.textContent = action.label;
      button.onclick = () => beginContextAction(action.type);
      host.appendChild(button);
    }
  }

  function renameInitialActions(panel: HTMLElement): void {
    syncStagedHand();
    panel.classList.add('compact-action-dock', 'compact-initial-action', 'compact-selection-first');
    const played = selectedHandCard();
    if (!played) return;

    const nativeActions = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-legal]'));
    const isJack = played.rank === 'J';
    for (const button of nativeActions) {
      const type = button.dataset.legal || '';
      const keepVisible = type === 'PLAY_LOOSE' || type === 'JACK_SWEEP' || type === 'BURN_JACK';
      button.classList.toggle('compact-hidden-native', !keepVisible);
    }

    const play = panel.querySelector<HTMLButtonElement>('[data-legal="PLAY_LOOSE"]');
    if (play) setText(play, `Play ${played.label} Loose`);

    const jackSweep = panel.querySelector<HTMLButtonElement>('[data-legal="JACK_SWEEP"]');
    if (jackSweep) setText(jackSweep, 'Sweep');
    const burnJack = panel.querySelector<HTMLButtonElement>('[data-legal="BURN_JACK"]');
    if (burnJack) setText(burnJack, 'Burn Jack −10');

    if (isJack) {
      clearStaged();
      panel.classList.add('compact-jack-action');
      panel.classList.remove('compact-has-targets');
      panel.querySelector('[data-compact-context-actions]')?.remove();
      return;
    }

    panel.classList.remove('compact-jack-action');
    enableSelectionProbes();
    renderContextActions(panel);
  }

  function autoSelectSingleBuild(panel: HTMLElement): boolean {
    const choices = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-buildchoice]'));
    if (choices.length !== 1 || choices[0].classList.contains('selected')) return false;
    clickSoon(choices[0]);
    return true;
  }

  function renamePendingAction(panel: HTMLElement, action: string): void {
    panel.classList.add('compact-action-dock', 'compact-pending-action');
    if (autoSelectSingleBuild(panel)) return;
    if (action === 'MAKE_BUILD' && resolveDeclaration(panel)) return;

    const submit = panel.querySelector<HTMLButtonElement>('[data-submit]');
    const cancel = panel.querySelector<HTMLButtonElement>('[data-cancel]');
    if (!submit) return;
    if (cancel) setText(cancel, 'Cancel');

    const played = selectedHandCard();
    const loose = selectedLooseCards();
    const selectedBuild = selectedBuildLabel(panel);
    const token = buildValue(selectedBuild);
    let enabled = true;
    let label = 'Confirm';

    if (action === 'CAPTURE_LOOSE') {
      enabled = !!played && loose.length > 0;
      if (enabled && played) {
        if (played.value != null) enabled = numericLooseValid(played.value);
        else if (played.rank === 'Q' || played.rank === 'K') enabled = loose.every((card) => card.rank === played.rank);
        else enabled = false;
      }
      label = enabled ? `Capture ${loose.length} card${loose.length === 1 ? '' : 's'}` : (loose.length ? 'Select a valid capture' : 'Select board cards');
    } else if (action === 'MAKE_BUILD') {
      const valid = validBuildDeclarations(panel);
      const selected = valid.find((button) => button.classList.contains('selected'));
      enabled = !!selected;
      label = selected ? (selected.textContent || 'Build').trim() : (valid.length > 1 ? 'Choose build value' : 'Select board cards');
      panel.classList.toggle('compact-ambiguous-declaration', valid.length > 1 && !selected);
    } else if (action === 'CAPTURE_BUILD') {
      enabled = !!selectedBuild;
      if (enabled && loose.length && token != null) {
        if (typeof token === 'number') enabled = loose.every((card) => card.value != null) && canPartition(loose.map((card) => card.value!), token);
        else enabled = loose.every((card) => card.rank === token);
      }
      label = selectedBuild ? `Capture ${selectedBuild}` : 'Choose a build';
    } else if (action === 'ADD_TO_BUILD') {
      enabled = !!selectedBuild && !!played;
      if (enabled && played && token != null) {
        if (typeof token === 'number') {
          enabled = played.value != null && loose.every((card) => card.value != null) && canPartition([played.value!, ...loose.map((card) => card.value!)], token);
        } else {
          enabled = played.rank === token && loose.every((card) => card.rank === token);
        }
      }
      label = selectedBuild ? `Add to ${selectedBuild}` : 'Choose a build';
    } else if (action === 'RAISE_BUILD') {
      enabled = !!selectedBuild && !!played;
      if (typeof token === 'number' && played?.value != null) label = `Raise to BUILD ${token + played.value}`;
      else label = selectedBuild ? `Raise ${selectedBuild}` : 'Choose a build';
    }

    submit.disabled = !enabled;
    setText(submit, label);

    const selectedBuildChoice = panel.querySelector('[data-buildchoice].selected');
    panel.classList.toggle('compact-target-chosen', !!selectedBuildChoice);
  }

  function enhance(): void {
    const table = document.querySelector('.table');
    document.documentElement.classList.toggle('brasta-gameplay-active', !!table);

    const panel = Array.from(document.querySelectorAll<HTMLElement>('.action-panel')).find((candidate) => !candidate.classList.contains('opening-panel'));
    if (!panel) return;

    const action = pendingAction(panel);
    if (action) renamePendingAction(panel, action);
    else if (selectedHandButton() && panel.querySelector('[data-legal]')) renameInitialActions(panel);
    else {
      stagedHandId = '';
      clearStaged();
    }
  }

  function onProbeClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target || busy) return;

    // selection-flow-v2 replays staged board targets through the native pending
    // action UI. Those synthetic clicks must reach the native game handler;
    // compact's capture-phase probe would otherwise swallow them.
    if (document.documentElement.dataset.selectionV2Replay === '1') return;

    const loose = target.closest<HTMLElement>('[data-compact-loose-probe]');
    if (loose) {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      const label = loose.dataset.compactLooseProbe || '';
      if (!label) return;
      if (stagedLoose.has(label)) stagedLoose.delete(label);
      else stagedLoose.add(label);
      enhance();
      return;
    }

    const build = target.closest<HTMLElement>('[data-compact-build-probe]');
    if (build) {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      const id = build.dataset.compactBuildProbe || build.dataset.build || '';
      if (!id) return;
      stagedBuildId = stagedBuildId === id ? '' : id;
      enhance();
    }
  }

  function start(): void {
    document.addEventListener('click', onProbeClick, true);
    const begin = () => {
      const app = document.getElementById('app');
      if (!app) {
        window.setTimeout(begin, 50);
        return;
      }
      const observer = new MutationObserver(enhance);
      observer.observe(app, { childList: true, subtree: true });
      enhance();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', begin, { once: true });
    else begin();
  }

  if (typeof window !== 'undefined') start();
}
