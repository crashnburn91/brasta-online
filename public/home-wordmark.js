(() => {
  const SRC = '/brasta-wordmark.webp?v=4';
  let scheduled = false;

  function installWordmark() {
    const landing = document.querySelector('.landing.landing-wide');
    if (!landing) return;

    if (!landing.querySelector('.brasta-home-wordmark')) {
      const legacyMark = landing.querySelector('.logo-mark');
      const wordmark = document.createElement('img');
      wordmark.className = 'brasta-home-wordmark';
      wordmark.src = SRC;
      wordmark.alt = 'Brasta';
      wordmark.width = 1920;
      wordmark.height = 640;
      wordmark.decoding = 'async';
      wordmark.fetchPriority = 'high';

      if (legacyMark) legacyMark.replaceWith(wordmark);
      else landing.prepend(wordmark);
    }

    const legacyTitle = landing.querySelector(':scope > h1');
    if (legacyTitle) legacyTitle.remove();
  }

  function scheduleInstall() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      installWordmark();
    });
  }

  function boot() {
    const app = document.getElementById('app');
    if (!app) return;
    installWordmark();
    new MutationObserver(scheduleInstall).observe(app, { childList: true });
    window.addEventListener('pageshow', installWordmark);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
  else boot();
})();
