(() => {
  if (window.__BRASTA_TUTORIAL_SCORING_RULES__) return;
  window.__BRASTA_TUTORIAL_SCORING_RULES__ = true;

  function patch() {
    document.querySelectorAll('.tutorial-score-copy small').forEach((el) => {
      if ((el.textContent || '').trim() === 'No points if tied') {
        el.textContent = 'Split 1 point each if tied';
      }
    });

    const note = document.querySelector('.tutorial-score-note');
    if (note && !note.querySelector('.tutorial-score-baseline')) {
      const baseline = document.createElement('div');
      baseline.className = 'tutorial-score-baseline';
      baseline.innerHTML = '<b>42-point baseline:</b> If no Jacks are burned, every completed round awards at least 42 total points across both sides before any Brasta bonuses are added.';
      note.appendChild(baseline);
    }
  }

  const start = () => {
    const app = document.getElementById('app');
    if (!app) return void window.setTimeout(start, 50);
    const observer = new MutationObserver(patch);
    observer.observe(app, { childList: true, subtree: true });
    patch();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
