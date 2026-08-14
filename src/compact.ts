namespace BrastaCompact {
  const SUIT_NAMES: Record<string, string> = { '♣': 'clubs', '♦': 'diamonds', '♥': 'hearts', '♠': 'spades' };
  let busy = false;

  type ParsedCard = { rank: string; suit: string; value: number | null; label: string };

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

  function handCards(): ParsedCard[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.hand .card[aria-label]'))
      .map((button) => parseCardLabel(button.getAttribute('aria-label') || ''))
      .filter((card): card is ParsedCard => !!card);
  }

  function selectedLooseCards(): ParsedCard[] {
    return Array.from(document.querySelectorAll<HTMLButtonElement>('.loose-row .card.selected[aria-label]'))
      .map((button) => parseCardLabel(button.getAttribute('aria-label') || ''))
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

  function beginLooseTarget(label: string): void {
    if (busy) return;
    const capture = actionButton('CAPTURE_LOOSE');
    const build = actionButton('MAKE_BUILD');
    const chosen = capture || build;
    if (!chosen) return;

    busy = true;
    chosen.click();
    window.setTimeout(() => {
      const target = findLooseByLabel(label);
      if (target) target.click();
      busy = false;
    }, 0);
  }

  function tryBuildAction(id: string, actions: string[], index = 0): void {
    if (index >= actions.length || busy) return;
    const button = actionButton(actions[index]);
    if (!button) {
      tryBuildAction(id, actions, index + 1);
      return;
    }

    busy = true;
    button.click();
    window.setTimeout(() => {
      const target = buildChoiceById(id);
      if (target) {
        target.click();
        busy = false;
        return;
      }
      cancelPending();
      busy = false;
      window.setTimeout(() => tryBuildAction(id, actions, index + 1), 0);
    }, 0);
  }

  function beginBuildTarget(id: string): void {
    // Tapping a matching build means capture first; otherwise prefer raise, then add.
    tryBuildAction(id, ['CAPTURE_BUILD', 'RAISE_BUILD', 'ADD_TO_BUILD']);
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

  function renameInitialActions(panel: HTMLElement): void {
    panel.classList.add('compact-action-dock', 'compact-initial-action');
    const played = selectedHandCard();
    const play = panel.querySelector<HTMLButtonElement>('[data-legal="PLAY_LOOSE"]');
    if (play && played) setText(play, `Play ${played.label}`);

    const makeBuild = panel.querySelector<HTMLButtonElement>('[data-legal="MAKE_BUILD"]');
    if (makeBuild) setText(makeBuild, 'Build');

    for (const type of ['CAPTURE_LOOSE', 'CAPTURE_BUILD', 'ADD_TO_BUILD', 'RAISE_BUILD']) {
      panel.querySelector<HTMLElement>(`[data-legal="${type}"]`)?.classList.add('compact-auto-action');
    }

    const jackSweep = panel.querySelector<HTMLButtonElement>('[data-legal="JACK_SWEEP"]');
    if (jackSweep) setText(jackSweep, 'Sweep');
    const burnJack = panel.querySelector<HTMLButtonElement>('[data-legal="BURN_JACK"]');
    if (burnJack) setText(burnJack, 'Burn Jack −10');

    // Loose cards become direct targets while no action has been chosen.
    document.querySelectorAll<HTMLButtonElement>('.loose-row .card[aria-label]').forEach((card) => {
      if (card.dataset.card) return;
      card.disabled = false;
      card.classList.add('compact-probe');
      card.dataset.compactLooseProbe = card.getAttribute('aria-label') || '';
    });

    // Builds also become direct targets. Existing data-build IDs are preserved.
    document.querySelectorAll<HTMLElement>('.build[data-build]').forEach((build) => {
      build.classList.add('compact-probe');
      build.dataset.compactBuildProbe = build.dataset.build || '';
      build.setAttribute('aria-disabled', 'false');
      build.tabIndex = 0;
    });
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
  }

  function onProbeClick(event: Event): void {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const loose = target.closest<HTMLElement>('[data-compact-loose-probe]');
    if (loose) {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      const label = loose.dataset.compactLooseProbe || '';
      if (label) beginLooseTarget(label);
      return;
    }

    const build = target.closest<HTMLElement>('[data-compact-build-probe]');
    if (build) {
      event.preventDefault();
      event.stopPropagation();
      if ('stopImmediatePropagation' in event) event.stopImmediatePropagation();
      const id = build.dataset.compactBuildProbe || build.dataset.build || '';
      if (id) beginBuildTarget(id);
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
