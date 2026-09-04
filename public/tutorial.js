(() => {
  if (window.__BRASTA_TUTORIAL_V2__) return;
  window.__BRASTA_TUTORIAL_V2__ = true;

  let stepIndex = 0;
  let switchingScenario = false;
  let openingChoice = '';

  const steps = [
    {
      title: 'Choose Your Opening Four',
      eyebrow: '1 · OPENING CHOICE',
      text: 'At the start of each round, the starting player sees their first four cards before the table is dealt. You decide whether to KEEP them or PUT all four onto the board.',
      tip: 'Try it below. Either choice is legal: KEEP means these four stay in your hand and the other player(s) are dealt before the board. PUT means these four become the opening board, the other player(s) are dealt, and your replacement four are dealt last.',
      scenario: 'build7',
      mode: 'opening',
    },
    {
      title: 'Make a Build',
      eyebrow: '2 · BUILDING',
      text: 'A build combines your played card with loose cards on the table. You must keep a card in your hand that can later capture the declared build.',
      tip: 'Try it: select 3♠, choose Build, then tap 4♣. Because 3 + 4 can only make 7 here, Brasta declares BUILD 7 automatically while you retain 7♥.',
      scenario: 'build7',
    },
    {
      title: 'Add to a Build',
      eyebrow: '3 · ADDING',
      text: 'You may add another complete set to an existing build while retaining its capture card. Loose cards are only required when your played card does not complete the build value by itself.',
      tip: 'Try it: play 5♠ and add the loose 3♣ to BUILD 8. You retain 8♥, so 5 + 3 becomes another complete 8-set.',
      scenario: 'add8',
    },
    {
      title: 'Raise a Build',
      eyebrow: '4 · RAISING',
      text: 'A numeric build can be raised by playing one numeric card onto it. The new declared value is the old build value plus your played card, and you must retain the new capture value.',
      tip: 'Try it: play 2♠ onto BUILD 6. Since you retain 8♥, the pile becomes BUILD 8.',
      scenario: 'raise8',
    },
    {
      title: 'Capture a Build',
      eyebrow: '5 · CAPTURING BUILDS',
      text: 'Capture a build by playing the matching declared value or face rank. Compatible loose sets may be captured at the same time.',
      tip: 'Try it: select 8♥ and tap BUILD 8. You can also include the loose 5♣ + 3♦ before confirming to clear the entire table.',
      scenario: 'capture8',
    },
    {
      title: 'Use a Jack',
      eyebrow: '6 · JACK SWEEP',
      text: 'A Jack sweeps every LOOSE card on the table. Jacks never capture builds, and a Jack sweep never earns a Brasta.',
      tip: 'Try it: select J♥ and Sweep. The loose 4♣ and 7♦ are captured, but BUILD 8 remains on the table.',
      scenario: 'jackBuild',
    },
    {
      title: 'Avoid a Burned Jack',
      eyebrow: '7 · BURNED JACK',
      text: 'If you play a Jack when there are no loose cards, the Jack is burned: it becomes loose and your side loses 10 points.',
      tip: 'Try it: select J♥. With only a build on the table, your only Jack action is Burn Jack −10.',
      scenario: 'burnJack',
    },
    {
      title: 'Earn a Brasta',
      eyebrow: '8 · CLEAR THE TABLE',
      text: 'When a non-Jack capture removes every loose card and every build from the table, your side earns a Brasta worth +10 points.',
      tip: 'Try it: select 8♥, then capture the loose 5♣ + 3♦. The board clears, so Team A earns BRASTA! +10.',
      scenario: 'brasta',
    },
    {
      title: 'Capture the Big 2',
      eyebrow: '9 · BIG 2',
      text: 'The 2♣ is the Big 2. Capturing it adds +10 points to your side at the end of the round, even when the move is not a Brasta.',
      tip: 'Try it: select 2♥, then capture 2♣. The A♦ stays on the table, so this triggers the standalone BIG 2! +10 presentation.',
      scenario: 'big2',
    },
    {
      title: 'Capture the Big 10',
      eyebrow: '10 · BIG 10',
      text: 'The 10♦ is the Big 10. Capturing it adds +10 points to your side at the end of the round, even when the move is not a Brasta.',
      tip: 'Try it: select 10♥, then capture 10♦. The A♣ stays on the table, so this triggers the standalone BIG 10! +10 presentation.',
      scenario: 'big10',
    },
    {
      title: 'Capture Both Prizes',
      eyebrow: '11 · POWER PAIR',
      text: 'One capture can take the 2♣ and 10♦ together. Both special cards score, so the move earns +20 points before any other bonuses.',
      tip: 'Try it: select 10♥, then select 10♦ plus the 2♣ + 8♠ set. Capture all three while A♥ remains on the table.',
      scenario: 'big2big10',
    },
    {
      title: 'Round Scoring',
      eyebrow: '12 · SCORING',
      text: 'At the end of the round, captured cards and bonuses are counted together. These are the values to remember.',
      tip: 'Special cards score individually. Majority bonuses, Last Pickup, Brastas, and Burned Jacks are then added to the round total.',
      mode: 'scoring',
    },
  ];

  function labRoot() {
    return document.querySelector('.lab');
  }

  function scenarioButton(name) {
    return Array.from(document.querySelectorAll('[data-scenario]')).find((el) => el.dataset.scenario === name) || null;
  }

  function renameNavigation() {
    const inTutorial = !!labRoot();
    document.documentElement.classList.toggle('tutorial-page-active', inTutorial);
    document.querySelectorAll('[data-nav="lab"]').forEach((el) => {
      if (!el.classList.contains('tutorial-launch')) {
        el.classList.add('tutorial-launch');
        el.innerHTML = '<span class="tutorial-launch-icon">?</span><span class="tutorial-launch-copy"><b>Tutorial</b><small>Learn Brasta step by step</small></span>';
        el.setAttribute('aria-label', 'Open Brasta tutorial');
      }
      el.classList.toggle('tutorial-launch-current', inTutorial && !!el.closest('.topbar'));
    });
  }

  function faceCard(rank, suit, red = false) {
    return `<div class="tutorial-card-face ${red ? 'red' : ''}" aria-label="${rank}${suit}"><span>${rank}</span><strong>${suit}</strong></div>`;
  }

  function guideMarkup(step) {
    const dots = steps.map((_, i) => `<button class="tutorial-dot ${i === stepIndex ? 'active' : ''}" data-tutorial-step="${i}" aria-label="Tutorial step ${i + 1}"></button>`).join('');
    const needsChoice = step.mode === 'opening' && !openingChoice;
    return `<section class="tutorial-guide" data-tutorial-current="${stepIndex}">
      <div class="tutorial-copy">
        <div class="tutorial-eyebrow">${step.eyebrow}</div>
        <h1>${step.title}</h1>
        <p>${step.text}</p>
        <div class="tutorial-tip"><b>${step.mode === 'scoring' ? 'Reference' : step.mode === 'opening' ? 'Your choice' : 'Your move'}</b><span>${step.tip}</span></div>
      </div>
      <div class="tutorial-controls">
        <div class="tutorial-progress">${dots}</div>
        <div class="tutorial-nav">
          <button data-tutorial-prev ${stepIndex === 0 ? 'disabled' : ''}>Back</button>
          <span>${stepIndex + 1} / ${steps.length}</span>
          <button class="primary" data-tutorial-next ${needsChoice ? 'disabled' : ''}>${stepIndex === steps.length - 1 ? 'Finish' : 'Next'}</button>
        </div>
      </div>
    </section>`;
  }

  function openingMarkup() {
    const result = openingChoice === 'keep'
      ? '<div class="tutorial-choice-result"><b>KEEP</b><span>These four stay in your hand. The other player(s) are dealt first; then four new cards are dealt face-up to the table.</span></div>'
      : openingChoice === 'put'
        ? '<div class="tutorial-choice-result"><b>PUT</b><span>These four become the opening table. The other player(s) are dealt first; then you receive your replacement four last.</span></div>'
        : '<div class="tutorial-choice-result muted"><b>Your decision</b><span>Look at the four cards, then choose what you would do. There is no universally correct answer.</span></div>';
    return `<section class="tutorial-special-stage tutorial-opening-stage" data-tutorial-special="opening" data-opening-choice="${openingChoice || 'none'}">
      <div class="tutorial-opening-label">YOUR FIRST FOUR</div>
      <div class="tutorial-opening-hand">${faceCard('A','♠')}${faceCard('7','♥',true)}${faceCard('10','♦',true)}${faceCard('4','♣')}</div>
      <div class="tutorial-opening-actions">
        <button class="${openingChoice === 'keep' ? 'selected' : ''}" data-tutorial-opening="keep"><b>KEEP 4</b><span>Keep these cards in your hand</span></button>
        <button class="${openingChoice === 'put' ? 'selected' : ''}" data-tutorial-opening="put"><b>PUT 4 ON BOARD</b><span>Use these as the opening table</span></button>
      </div>
      ${result}
    </section>`;
  }

  function scoringCard(rank, suit, value, text, red = false) {
    return `<div class="tutorial-score-row"><div class="tutorial-score-visual">${faceCard(rank, suit, red)}</div><div class="tutorial-score-copy"><b>${text}</b><span>${value}</span></div></div>`;
  }

  function scoringMarkup() {
    return `<section class="tutorial-special-stage tutorial-scoring-stage" data-tutorial-special="scoring">
      <div class="tutorial-score-list">
        ${scoringCard('A','♠','+1 each','Every Ace')}
        ${scoringCard('J','♥','+1 each','Every Jack',true)}
        ${scoringCard('2','♣','+10','Big 2 · 2♣')}
        ${scoringCard('10','♦','+10','Big 10 · 10♦',true)}
        <div class="tutorial-score-row"><div class="tutorial-score-icon">♣</div><div class="tutorial-score-copy"><b>Most Clubs</b><span>+2</span><small>13 clubs means there is always one majority winner</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon">▤</div><div class="tutorial-score-copy"><b>Most Captured Cards</b><span>+2</span><small>Split 1 point each on a 26–26 tie</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon">LAST</div><div class="tutorial-score-copy"><b>Last Pickup</b><span>+10</span><small>Also receives cards left on the table at round end</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon gold">B</div><div class="tutorial-score-copy"><b>Each Brasta</b><span>+10</span><small>Clear the entire table with a non-Jack capture</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon danger">J</div><div class="tutorial-score-copy"><b>Each Burned Jack</b><span>−10</span><small>Playing a Jack when no loose cards are available</small></div></div>
      </div>
      <div class="tutorial-score-note"><b>Other cards</b> do not score individually, but every captured card still counts toward Most Cards and every captured club counts toward Most Clubs.<div class="tutorial-score-baseline"><b>42-point baseline:</b> With no burned Jacks, every completed round awards at least 42 total points across both sides before Brasta bonuses.</div></div>
    </section>`;
  }

  function renderSpecialStage(lab, step, force = false) {
    const stage = lab.querySelector('.tutorial-special-stage');
    const wanted = step.mode || 'game';
    if (wanted === 'game') {
      if (stage) stage.remove();
      return;
    }

    const desiredChoice = openingChoice || 'none';
    const currentMode = stage?.getAttribute('data-tutorial-special') || '';
    const currentChoice = stage?.getAttribute('data-opening-choice') || '';
    const current = currentMode === wanted && (wanted !== 'opening' || currentChoice === desiredChoice);
    if (stage && current && !force) return;

    const markup = wanted === 'opening' ? openingMarkup() : scoringMarkup();
    if (stage) stage.outerHTML = markup;
    else {
      const grid = lab.querySelector('.lab-grid');
      if (grid) grid.insertAdjacentHTML('beforebegin', markup);
      else lab.insertAdjacentHTML('beforeend', markup);
    }
  }

  function enhance(force = false) {
    renameNavigation();
    const lab = labRoot();
    if (!lab) return;

    const step = steps[stepIndex];
    lab.classList.add('tutorial-mode');
    lab.classList.toggle('tutorial-special-mode', step.mode === 'opening' || step.mode === 'scoring');

    const originalTitle = lab.querySelector(':scope > h1');
    const originalIntro = lab.querySelector(':scope > p');
    if (originalTitle) originalTitle.hidden = true;
    if (originalIntro) originalIntro.hidden = true;
    lab.querySelector('.lab-scenarios')?.classList.add('tutorial-source-controls');
    lab.querySelector('.inspector')?.classList.add('tutorial-hidden-inspector');

    const guide = lab.querySelector('.tutorial-guide');
    const currentStep = guide?.getAttribute('data-tutorial-current');
    if (!guide) {
      const grid = lab.querySelector('.lab-grid');
      if (grid) grid.insertAdjacentHTML('beforebegin', guideMarkup(step));
      else lab.insertAdjacentHTML('afterbegin', guideMarkup(step));
    } else if (currentStep !== String(stepIndex) || force) {
      guide.outerHTML = guideMarkup(step);
    }

    lab.querySelector('.lab-grid')?.classList.add('tutorial-game-grid');
    renderSpecialStage(lab, step, force);

    const handTitle = lab.querySelector('.hand-title');
    if (handTitle && /test hand/i.test(handTitle.textContent || '')) handTitle.textContent = 'Your tutorial hand';
  }

  function loadScenarioForStep(step) {
    if (!step.scenario || step.mode === 'opening' || step.mode === 'scoring') {
      enhance(true);
      return;
    }
    if (switchingScenario) return;
    const button = scenarioButton(step.scenario);
    if (!button) {
      enhance(true);
      return;
    }
    switchingScenario = true;
    button.click();
    window.setTimeout(() => {
      switchingScenario = false;
      enhance(true);
    }, 0);
  }

  function goToStep(index) {
    if (index < 0 || index >= steps.length) return;
    stepIndex = index;
    loadScenarioForStep(steps[stepIndex]);
  }

  function finishTutorial() {
    location.hash = '';
    location.reload();
  }

  function clickHandler(event) {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;

    const opening = target.closest('[data-tutorial-opening]');
    if (opening) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openingChoice = opening.getAttribute('data-tutorial-opening') || '';
      enhance(true);
      return;
    }

    const dot = target.closest('[data-tutorial-step]');
    if (dot) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToStep(Number(dot.getAttribute('data-tutorial-step') || 0));
      return;
    }

    if (target.closest('[data-tutorial-prev]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (stepIndex > 0) goToStep(stepIndex - 1);
      return;
    }

    if (target.closest('[data-tutorial-next]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (stepIndex === 0 && !openingChoice) return;
      if (stepIndex >= steps.length - 1) finishTutorial();
      else goToStep(stepIndex + 1);
    }
  }

  document.addEventListener('click', clickHandler, true);

  const start = () => {
    const app = document.getElementById('app');
    if (!app) {
      window.setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(() => enhance(false));
    observer.observe(app, { childList: true, subtree: true });
    enhance(true);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
