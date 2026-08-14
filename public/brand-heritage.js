(() => {
  const ROOT_ID = 'brasta-branding-layer';

  function decorateLanding() {
    const landing = document.querySelector('.landing.landing-wide');
    if (!landing || landing.dataset.brandReady === '1') return;
    landing.dataset.brandReady = '1';
    document.body.classList.add('heritage-brand');

    const originalLogo = landing.querySelector('.logo-mark');
    const originalTitle = landing.querySelector(':scope > h1');
    const originalLead = landing.querySelector(':scope > p');
    if (originalLogo) originalLogo.classList.add('brand-original-hidden');
    if (originalTitle) originalTitle.classList.add('brand-original-hidden');
    if (originalLead) originalLead.classList.add('brand-original-hidden');

    const grid = landing.querySelector('.landing-grid');
    if (!grid) return;

    const shell = document.createElement('div');
    shell.id = ROOT_ID;
    shell.innerHTML = `
      <header class="brand-nav">
        <a class="brand-wordmark" href="#top" aria-label="Brasta home">BRASTA <span>♥ ♦ ♣ ♠</span></a>
        <nav aria-label="Brand navigation">
          <button type="button" data-brand-scroll="play">PLAY</button>
          <button type="button" data-brand-scroll="learn">LEARN</button>
          <button type="button" data-brand-scroll="story">STORY</button>
        </nav>
      </header>
      <section class="brand-hero" id="top">
        <div class="brand-hero-copy">
          <div class="brand-kicker">A ROMANI-AMERICAN CARD GAME</div>
          <h1>BRASTA</h1>
          <div class="brand-big-cards"><span>10♦</span><i>•</i><span>2♣</span></div>
          <p class="brand-tagline">From family tables to the online table.</p>
          <p class="brand-intro">A competitive game of builds, captures and sweeps, passed down through Romani-American families and communities and now playable online with friends.</p>
          <div class="brand-hero-actions">
            <button type="button" class="brand-primary" data-brand-scroll="play">Play Brasta</button>
            <button type="button" class="brand-secondary" data-brand-scroll="learn">Learn the Game</button>
          </div>
        </div>
        <div class="brand-hero-table" aria-hidden="true">
          <div class="brand-mini-top"><span>DONNY <b>YOU</b></span><strong>YOUR TURN</strong><span>BRASTA BOT</span></div>
          <div class="brand-mini-label">BUILDS</div>
          <div class="brand-mini-builds">
            <div class="mini-stack"><span>7♥</span><span>7♣</span><em>7</em></div>
            <div class="mini-stack"><span>6♥</span><span>2♠</span><em>8</em></div>
            <div class="mini-stack"><span>9♦</span><em>9</em></div>
          </div>
          <div class="brand-mini-label">LOOSE CARDS</div>
          <div class="brand-mini-loose"><span>4♠</span><span>5♥</span><span>8♣</span><span>Q♦</span><span>J♠</span></div>
          <div class="brand-mini-last">LAST MOVE · Build 7 raised to 8</div>
          <div class="brand-mini-hand"><span>3♦</span><span>6♠</span><span>8♥</span><span>K♣</span><span>A♦</span></div>
        </div>
      </section>
      <section class="brand-learn" id="learn">
        <div class="brand-section-heading"><span>WHAT IS BRASTA?</span><p>A fast, strategic game of builds, captures and sweeps.</p></div>
        <div class="brand-pillars">
          <article><div>▦</div><h3>BUILD</h3><p>Combine cards into values you control.</p></article>
          <article><div>🂠</div><h3>CAPTURE</h3><p>Match cards, combinations, or builds from the table.</p></article>
          <article><div>✦</div><h3>SWEEP</h3><p>Clear the table in one capture for a Brasta.</p></article>
          <article><div>♛</div><h3>SCORE</h3><p>Fight for the Big 2, Big 10, clubs, cards and last pickup.</p></article>
        </div>
      </section>`;

    landing.insertBefore(shell, grid);
    grid.id = 'play';

    const story = document.createElement('section');
    story.className = 'brand-story';
    story.id = 'story';
    story.innerHTML = `
      <div class="brand-story-art">
        <div class="brand-photo-frame"><div class="brand-photo-placeholder">♣</div></div>
      </div>
      <div class="brand-story-copy">
        <div class="brand-kicker">A GAME PASSED DOWN AT THE TABLE</div>
        <h2>Learned around the table. Preserved online.</h2>
        <p>Brasta comes from the Romani-American card-playing tradition our families grew up with. Like many family games, its rules were learned by playing — taught by parents, grandparents, cousins and friends.</p>
        <p>This version preserves the rules our community knows while making the game easier to learn, share and play anywhere.</p>
        <aside>Romani communities are diverse, and card-game traditions can vary between families and communities. Brasta reflects the tradition passed down to us rather than claiming to represent every Romani-American tradition.</aside>
      </div>`;
    grid.insertAdjacentElement('afterend', story);

    const footer = document.createElement('footer');
    footer.className = 'brand-footer';
    footer.innerHTML = `<strong>BRASTA <span>♥ ♦ ♣ ♠</span></strong><p>A Romani-American card game · From family tables to the online table.</p>`;
    story.insertAdjacentElement('afterend', footer);

    document.querySelectorAll('[data-brand-scroll]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-brand-scroll');
        document.getElementById(id || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  function decorateOtherScreens() {
    const brandedLanding = document.querySelector('.landing.landing-wide');
    document.body.classList.toggle('heritage-brand', !!brandedLanding || !!document.querySelector('.topbar'));
  }

  function apply() {
    decorateLanding();
    decorateOtherScreens();
  }

  const observer = new MutationObserver(apply);
  const start = () => {
    apply();
    const app = document.getElementById('app');
    if (app) observer.observe(app, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
