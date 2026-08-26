(() => {
  if (window.__BRASTA_COMPACT_AMBIGUITY__) return;
  window.__BRASTA_COMPACT_AMBIGUITY__ = true;

  function polishAmbiguousBuildChoice() {
    if (document.body.classList.contains('brasta-ranked-active') || document.querySelector('.ranked-pill')) return;
    const selectedHand = document.querySelector('.hand .card.selected[aria-label]');
    const panel = Array.from(document.querySelectorAll('.action-panel'))
      .find((candidate) => candidate.querySelector('[data-legal]'));
    if (!selectedHand || !panel) return;

    const capture = panel.querySelector('[data-legal="CAPTURE_BUILD"]');
    const add = panel.querySelector('[data-legal="ADD_TO_BUILD"]');
    if (!capture || !add) return;

    // Each app render creates a fresh action panel. Mark this particular panel before
    // mutating any child text so the childList observer cannot trigger a feedback loop.
    if (panel.dataset.compactAmbiguousPolished === '1') return;
    panel.dataset.compactAmbiguousPolished = '1';

    // This is a genuinely ambiguous direct-manipulation case: the same hand card
    // can either capture a matching build or be added to it while another matching
    // capture card is retained. Do not let the compact layer silently prefer capture.
    capture.classList.remove('compact-auto-action');
    add.classList.remove('compact-auto-action');
    if (capture.textContent !== 'Capture Build') capture.textContent = 'Capture Build';
    if (add.textContent !== 'Add to Build') add.textContent = 'Add to Build';
    panel.classList.add('compact-build-ambiguous');

    // Disable the compact layer's direct build probe for this state. After the player
    // chooses Capture or Add, the normal pending-action renderer makes the build itself
    // selectable and the existing server-authoritative validation remains unchanged.
    document.querySelectorAll('.build[data-compact-build-probe]').forEach((build) => {
      build.removeAttribute('data-compact-build-probe');
      build.classList.remove('compact-probe');
    });
  }

  function start() {
    const app = document.getElementById('app');
    if (!app) {
      window.setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(polishAmbiguousBuildChoice);
    observer.observe(app, { childList: true, subtree: true });
    polishAmbiguousBuildChoice();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
