(() => {
  const ROOT_ID = 'brasta-branding-layer';

  function openPlayModal() {
    document.body.classList.add('brand-play-open');
    document.getElementById('brand-play-modal')?.setAttribute('aria-hidden', 'false');
    setTimeout(() => document.querySelector('#brand-play-modal input')?.focus(), 80);
  }

  function closePlayModal() {
    document.body.classList.remove('brand-play-open');
    document.getElementById('brand-play-modal')?.setAttribute('aria-hidden', 'true');
  }

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
        <a class="brand-wordmark" href="#brand-top" aria-label="Brasta home">BRASTA <span>♥ ♦ ♣ ♠</span></a>
        <nav aria-label="Brand navigation">
          <button type="button" data-brand-play>PLAY</button>
          <button type="button" data-brand-scroll="brand-learn">LEARN</button>
          <button type="button" data-brand-scroll="brand-learn">STRATEGY</button>
          <button type="button" data-brand-scroll="brand-story">STORY</button>
          <button type="button" data-brand-scroll="brand-community">COMMUNITY</button>
        </nav>
        <div class="brand-nav-actions">
          <button type="button" class="brand-login" data-brand-play>LOG IN</button>
          <button type="button" class="brand-create" data-brand-play>CREATE ROOM</button>
        </div>
      </header>

      <section class="brand-hero" id="brand-top">
        <div class="brand-hero-copy">
          <div class="brand-hero-wordmark">BRASTA</div>
          <div class="brand-kicker-row"><i></i><span>A ROMANI-AMERICAN<br>CARD GAME</span><i></i></div>
          <div class="brand-big-cards"><span>10♦</span><i>•</i><span>2♣</span></div>
          <p class="brand-tagline">From family tables to the online table.</p>
          <p class="brand-intro">A competitive card game passed down through Romani-American families and communities—now playable online with friends.</p>
          <div class="brand-hero-actions">
            <button type="button" class="brand-primary" data-brand-play><span>🂠</span> Play Brasta</button>
            <button type="button" class="brand-secondary" data-brand-scroll="brand-learn"><span>▶</span> Watch How to Play</button>
          </div>
        </div>

        <div class="brand-hero-table-wrap">
          <div class="brand-hero-table" aria-hidden="true">
            <div class="brand-mini-top">
              <span><b>Donny</b><small>Team A</small><em>YOU</em></span>
              <strong><small>Round 3</small>Your Turn</strong>
              <span><b>Brasta Bot</b><small>Team B</small></span>
            </div>
            <div class="brand-mini-label">BUILDS</div>
            <div class="brand-mini-builds">
              <div class="mini-stack"><span class="red">7♥</span><span>7♣</span><span class="red">7♦</span><em>7</em></div>
              <div class="mini-stack"><span class="red">6♥</span><span>2♠</span><em>8</em></div>
              <div class="mini-stack"><span class="red">9♦</span><em>9</em></div>
            </div>
            <div class="brand-mini-label">LOOSE CARDS</div>
            <div class="brand-mini-loose"><span>4♠</span><span class="red">5♥</span><span>8♣</span><span class="red">Q♦</span><span>J♠</span></div>
            <div class="brand-mini-last"><b>LAST MOVE</b> Maria raised BUILD 7 to 8.</div>
            <div class="brand-mini-hand"><span class="red">3♦</span><span>6♠</span><span class="red">8♥</span><span>K♣</span><span class="red">A♦</span></div>
          </div>
        </div>
      </section>

      <section class="brand-learn" id="brand-learn">
        <div class="brand-section-heading"><span>WHAT IS BRASTA?</span><p>A fast, strategic game of builds, captures and sweeps.</p></div>
        <div class="brand-pillars">
          <article><div class="brand-pillar-icon">▦</div><h3>BUILD</h3><p>Combine cards into values you control.</p></article>
          <article><div class="brand-pillar-icon">🂠</div><h3>CAPTURE</h3><p>Match cards, combinations, or builds from the table.</p></article>
          <article><div class="brand-pillar-icon">⌁</div><h3>SWEEP</h3><p>Clear the table in one capture for a Brasta.</p></article>
          <article><div class="brand-pillar-icon">♜</div><h3>SCORE</h3><p>Fight for the Big 2, Big 10, clubs, cards and last pickup.</p></article>
        </div>
      </section>

      <section class="brand-story" id="brand-story">
        <div class="brand-story-art">
          <div class="brand-photo-frame">
            <div class="brand-photo-placeholder">
              <div class="brand-photo-people"><span>●</span><span>●</span><span>●</span><span>●</span><span>●</span></div>
              <div class="brand-photo-table">♠ ♥ ♣ ♦</div>
            </div>
          </div>
        </div>
        <div class="brand-story-copy">
          <div class="brand-story-heading">A GAME PASSED DOWN AT THE TABLE</div>
          <div class="brand-story-rule"></div>
          <p>Brasta comes from the Romani-American card-playing tradition our families grew up with. Like many family games, its rules were learned around the table—taught by parents, grandparents, cousins and friends.</p>
          <p>This version preserves the rules our community knows while making the game easier to learn, share and play anywhere.</p>
          <aside>Romani communities are diverse, and card-game traditions can vary between families and communities. Brasta reflects the tradition passed down to us rather than claiming to represent every Romani-American tradition.</aside>
        </div>
        <div class="brand-cardback-art" aria-hidden="true">
          <div class="brand-cardback card-a"></div><div class="brand-cardback card-b"></div><div class="brand-cardback card-c"><span>✺</span></div>
          <div class="brand-heritage-seal">ROMANI-AMERICAN<br><b>✺</b><br>HERITAGE</div>
        </div>
      </section>

      <section class="brand-feature-strip" id="brand-community">
        <article><div>♣</div><section><b>PLAY WITH FRIENDS</b><span>Create private rooms, invite friends, or join open tables.</span></section></article>
        <article><div>▥</div><section><b>TRACK YOUR GAME</b><span>Stats, match history and leaderboards to measure your skill.</span></section></article>
        <article><div>✪</div><section><b>CUSTOMIZE</b><span>Card backs, tables and avatars to make the table your own.</span></section></article>
        <article><div>★</div><section><b>ALWAYS IMPROVING</b><span>New features, events and game modes coming soon.</span></section></article>
      </section>

      <section class="brand-ready">
        <div class="brand-ready-copy">
          <h2>READY TO PLAY?</h2>
          <div class="brand-ready-rule"></div>
          <p>Join players discovering a game with history.</p>
          <button type="button" class="brand-primary brand-ready-button" data-brand-play><span>🂠</span> PLAY NOW — IT'S FREE</button>
          <small>No download. Works on any device.</small>
        </div>
        <div class="brand-device-stage" aria-hidden="true">
          <div class="brand-laptop"><div class="brand-device-screen">BRASTA<div>7♥ 7♣ &nbsp; 8♠ &nbsp; 9♦</div><small>BUILDS · CAPTURES · SWEEPS</small></div></div>
          <div class="brand-phone"><div class="brand-device-screen">B<div>4♠ 5♥</div></div></div>
          <div class="brand-tablet"><div class="brand-device-screen">BRASTA<div>10♦ &nbsp; 2♣</div></div></div>
        </div>
      </section>

      <footer class="brand-footer">
        <strong>BRASTA <span>♥ ♦ ♣ ♠</span></strong>
        <nav><button data-brand-scroll="brand-story">ABOUT</button><button data-brand-scroll="brand-learn">RULES</button><button data-brand-play>PLAY</button><button>CONTACT</button><button>TERMS</button><button>PRIVACY</button></nav>
        <div class="brand-social">○ ○ ○ ○</div>
      </footer>
    `;

    landing.insertBefore(shell, grid);

    const modal = document.createElement('div');
    modal.id = 'brand-play-modal';
    modal.className = 'brand-play-modal';
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="brand-play-backdrop" data-brand-close></div><section class="brand-play-sheet"><button class="brand-play-close" type="button" data-brand-close aria-label="Close">×</button><div class="brand-play-heading"><span>PLAY BRASTA</span><small>Create a room, join friends, spectate, or play locally.</small></div></section>`;
    landing.appendChild(modal);
    const sheet = modal.querySelector('.brand-play-sheet');
    if (sheet) sheet.appendChild(grid);

    document.querySelectorAll('[data-brand-scroll]').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.getAttribute('data-brand-scroll');
        document.getElementById(id || '')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    document.querySelectorAll('[data-brand-play]').forEach((button) => button.addEventListener('click', openPlayModal));
    document.querySelectorAll('[data-brand-close]').forEach((button) => button.addEventListener('click', closePlayModal));
    document.addEventListener('keydown', (event) => { if (event.key === 'Escape') closePlayModal(); });
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