(() => {
  if (window.__BRASTA_TUTORIAL_OPENING_ORDER__) return;
  window.__BRASTA_TUTORIAL_OPENING_ORDER__ = true;

  function apply() {
    const guide = document.querySelector('.tutorial-guide[data-tutorial-current="0"]');
    if (!guide) return;

    const tip = guide.querySelector('.tutorial-tip span');
    const correctedTip = 'Try it below. Either choice is legal. KEEP: you keep these four, the other player(s) are dealt next, then four cards are dealt to the board. PUT: these four become the opening board, the other player(s) are dealt next, then you receive your replacement four last.';
    if (tip && tip.textContent !== correctedTip) tip.textContent = correctedTip;

    const result = document.querySelector('.tutorial-choice-result');
    if (!result) return;
    const choice = document.querySelector('[data-tutorial-opening].selected')?.getAttribute('data-tutorial-opening');
    const span = result.querySelector('span');
    if (!span) return;
    if (choice === 'keep') {
      const text = 'These four stay in your hand. The other player(s) are dealt first; then four new cards are dealt face-up to the table.';
      if (span.textContent !== text) span.textContent = text;
    } else if (choice === 'put') {
      const text = 'These four become the opening table. The other player(s) are dealt first; then you receive your replacement four last.';
      if (span.textContent !== text) span.textContent = text;
    }
  }

  const start = () => {
    const app = document.getElementById('app');
    if (!app) return void window.setTimeout(start, 50);
    const observer = new MutationObserver(apply);
    observer.observe(app, { childList: true, subtree: true });
    apply();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
