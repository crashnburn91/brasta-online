(() => {
  if (window.__BRASTA_SELECTION_CLEANUP__) return;
  window.__BRASTA_SELECTION_CLEANUP__ = true;

  const tokenFromBuild = (build) => {
    const text = build?.querySelector('.build-label')?.textContent || '';
    const match = text.toUpperCase().match(/BUILD\s+(10|[1-9]|Q|K)/);
    if (!match) return null;
    return /^\d+$/.test(match[1]) ? Number(match[1]) : match[1];
  };

  const selectedHandCard = () => {
    const el = document.querySelector('.hand .card.selected[data-card][aria-label]');
    if (!el) return null;
    const label = (el.getAttribute('aria-label') || '').trim();
    const rank = label.slice(0, -1).trim().toUpperCase();
    const value = rank === 'A' ? 1 : /^\d+$/.test(rank) ? Number(rank) : null;
    return { el, label, rank, value };
  };

  const cardMatchesToken = (card, token) => token != null && (typeof token === 'number' ? card?.value === token : card?.rank === token);

  function cleanup() {
    const panel = Array.from(document.querySelectorAll('.action-panel')).find((el) => !el.classList.contains('opening-panel'));
    if (!panel) return;

    const hasBoardTarget = panel.classList.contains('selection-v2-has-target');

    // The legacy compact layer may render a second contextual Capture/Build action.
    // When selection-v2 owns a board-target interaction, only its action row should be visible.
    panel.querySelectorAll('.compact-context-actions').forEach((row) => {
      row.style.display = hasBoardTarget ? 'none' : '';
    });

    // Extra safety: if multiple visible action buttons with identical labels remain,
    // prefer the selection-v2 button and hide the duplicate(s).
    if (hasBoardTarget) {
      const buttons = Array.from(panel.querySelectorAll('button')).filter((button) => {
        const style = getComputedStyle(button);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      const byLabel = new Map();
      for (const button of buttons) {
        const label = (button.textContent || '').trim();
        if (!label) continue;
        const prior = byLabel.get(label);
        if (!prior) {
          byLabel.set(label, button);
          continue;
        }
        const priorPreferred = prior.classList.contains('selection-v2-action');
        const currentPreferred = button.classList.contains('selection-v2-action');
        if (currentPreferred && !priorPreferred) {
          prior.style.display = 'none';
          byLabel.set(label, button);
        } else {
          button.style.display = 'none';
        }
      }
    }

    // If no board target is selected and the chosen hand card is the card that
    // must be retained for an existing build, do not leave an empty action bar.
    const oldNote = panel.querySelector('[data-selection-retention-note]');
    if (hasBoardTarget) {
      oldNote?.remove();
      return;
    }

    const card = selectedHandCard();
    const matchingBuild = card ? Array.from(document.querySelectorAll('.build[data-build]')).find((build) => cardMatchesToken(card, tokenFromBuild(build))) : null;
    if (!card || !matchingBuild) {
      oldNote?.remove();
      return;
    }

    const token = tokenFromBuild(matchingBuild);
    if (token == null) {
      oldNote?.remove();
      return;
    }

    const visibleAction = Array.from(panel.querySelectorAll('button')).some((button) => {
      const style = getComputedStyle(button);
      return style.display !== 'none' && style.visibility !== 'hidden' && !button.disabled;
    });
    if (visibleAction) {
      oldNote?.remove();
      return;
    }

    const note = oldNote || document.createElement('div');
    note.dataset.selectionRetentionNote = '1';
    note.className = 'selection-v2-note';
    note.textContent = `You must keep a ${token} in your hand while you control Build ${token}.`;
    if (!oldNote) panel.appendChild(note);
  }

  let queued = false;
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      cleanup();
    });
  };

  document.addEventListener('click', schedule, false);
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
  schedule();
})();
