(() => {
  if (window.__BRASTA_TUTORIAL__) return;
  window.__BRASTA_TUTORIAL__ = true;

  let stepIndex = 0;
  let switchingScenario = false;
  let openingChoice = '';

  const steps = [
    {
      title: 'Choose Your Opening Four',
      eyebrow: '1 · OPENING CHOICE',
      text: 'At the start of each round, the starting player sees their first four cards before the table is dealt. You decide whether to KEEP them or PUT all four onto the board.',
      tip: 'Try it below. Either choice is legal: KEEP means these four stay in your hand and four new cards are dealt to the table. PUT means these four become the opening table and you receive four replacement cards.',
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
      title: 'Round Scoring',
      eyebrow: '9 · SCORING',
      text: 'At the end of the round, captured cards and bonuses are counted together. These are the values to remember.',
      tip: 'Special cards score individually. Majority bonuses, Last Pickup, Brastas, and Burned Jacks are then added to the round total.',
      scenario: 'brasta',
      mode: 'scoring',
    },
  ];

  function labRoot() {
    return document.querySelector('.lab');
  }

  function scenarioButton(name) {
    return Array.from(document.querySelectorAll('[data-scenario]')).find((el) => el.dataset.scenario === name) || null;
  }

  function setScenario(name) {
    if (switchingScenario) return;
    const button = scenarioButton(name);
    if (!button) return;
    switchingScenario = true;
    button.click();
    window.setTimeout(() => { switchingScenario = false; enhance(); }, 0);
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

  function tutorialMarkup(step) {
    const dots = steps.map((_, i) => `<button class="tutorial-dot ${i === stepIndex ? 'active' : ''}" data-tutorial-step="${i}" aria-label="Tutorial step ${i + 1}"></button>`).join('');
    const needsOpeningChoice = step.mode === 'opening' && !openingChoice;
    return `
      <section class="tutorial-guide" data-tutorial-current="${stepIndex}">
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
            <button class="primary" data-tutorial-next ${needsOpeningChoice ? 'disabled' : ''}>${stepIndex === steps.length - 1 ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </section>`;
  }

  function faceCard(rank, suit, red = false) {
    return `<div class="tutorial-card-face ${red ? 'red' : ''}" aria-label="${rank}${suit}"><span>${rank}</span><strong>${suit}</strong></div>`;
  }

  function openingMarkup() {
    const result = openingChoice === 'keep'
      ? '<div class="tutorial-choice-result"><b>KEEP</b><span>These four cards stay in your hand. The dealer now puts four new cards face-up on the table, then deals the other players.</span></div>'
      : openingChoice === 'put'
        ? '<div class="tutorial-choice-result"><b>PUT</b><span>These four cards become the opening table. You receive four replacement cards, then the other players are dealt.</span></div>'
        : '<div class="tutorial-choice-result muted"><b>Your decision</b><span>Look at the four cards, then choose what you would do. There is no universally correct answer.</span></div>';
    return `<section class="tutorial-special-stage tutorial-opening-stage" data-tutorial-special="opening" data-opening-choice="${openingChoice || 'none'}">
      <div class="tutorial-opening-label">YOUR FIRST FOUR</div>
      <div class="tutorial-opening-hand">
        ${faceCard('A','♠')}${faceCard('7','♥',true)}${faceCard('10','♦',true)}${faceCard('4','♣')}
      </div>
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
        <div class="tutorial-score-row"><div class="tutorial-score-icon">♣</div><div class="tutorial-score-copy"><b>Most Clubs</b><span>+2</span><small>No points if tied</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon">▤</div><div class="tutorial-score-copy"><b>Most Captured Cards</b><span>+2</span><small>No points if tied</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon">LAST</div><div class="tutorial-score-copy"><b>Last Pickup</b><span>+10</span><small>Also receives cards left on the table at round end</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon gold">B</div><div class="tutorial-score-copy"><b>Each Brasta</b><span>+10</span><small>Clear the entire table with a non-Jack capture</small></div></div>
        <div class="tutorial-score-row"><div class="tutorial-score-icon danger">J</div><div class="tutorial-score-copy"><b>Each Burned Jack</b><span>−10</span><small>Playing a Jack when no loose cards are available</small></div></div>
      </div>
      <div class="tutorial-score-note"><b>Other cards</b> do not score individually, but every captured card still counts toward the Most Cards bonus, and every captured club counts toward Most Clubs.</div>
    </section>`;
  }

  function renderSpecialStage(lab, step, force = false) {
    const stage = lab.querySelector('.tutorial-special-stage');
    const wanted = step.mode || 'game';
    if (wanted === 'game') {
      if (stage) stage.remove();
      return;
    }

    const currentMode = stage?.getAttribute('data-tutorial-special') || '';
    const currentChoice = stage?.getAttribute('data-opening-choice') || '';
    const desiredChoice = openingChoice || 'none';
    const isCurrent = currentMode === wanted && (wanted !== 'opening' || currentChoice === desiredChoice);
    if (stage && isCurrent && !force) return;

    const markup = wanted === 'opening' ? openingMarkup() : scoringMarkup();
    if (stage) stage.outerHTML = markup;
    else {
      const grid = lab.querySelector('.lab-grid');
      if (grid) grid.insertAdjacentHTML('beforebegin', markup);
      else lab.insertAdjacentHTML('beforeend', markup);
    }
  }

  function bindTutorial() {
    document.querySelectorAll('[data-tutorial-step]').forEach((el) => {
      el.onclick = () => {
        stepIndex = Number(el.dataset.tutorialStep || 0);
        const step = steps[stepIndex];
        setScenario(step.scenario);
        enhance();
      };
    });

    document.querySelectorAll('[data-tutorial-opening]').forEach((el) => {
      el.onclick = () => {
        openingChoice = el.dataset.tutorialOpening || '';
        enhance(true);
      };
    });

    const prev = document.querySelector('[data-tutorial-prev]');
    if (prev) prev.onclick = () => {
      if (stepIndex <= 0) return;
      stepIndex -= 1;
      setScenario(steps[stepIndex].scenario);
      enhance();
    };

    const next = document.querySelector('[data-tutorial-next]');
    if (next) next.onclick = () => {
      if (stepIndex === 0 && !openingChoice) return;
      if (stepIndex >= steps.length - 1) {
        location.hash = '';
        location.reload();
        return;
      }
      stepIndex += 1;
      setScenario(steps[stepIndex].scenario);
      enhance();
    };
  }

  function enhanceLab(forceGuide = false) {
    const lab = labRoot();
    if (!lab) return;
    lab.classList.add('tutorial-mode');
    const step = steps[stepIndex];
    lab.classList.toggle('tutorial-special-mode', step.mode === 'opening' || step.mode === 'scoring');

    const originalTitle = lab.querySelector(':scope > h1');
    const originalIntro = lab.querySelector(':scope > p');
    if (originalTitle) originalTitle.hidden = true;
    if (originalIntro) originalIntro.hidden = true;

    lab.querySelector('.lab-scenarios')?.classList.add('tutorial-source-controls');
    lab.querySelector('.inspector')?.classList.add('tutorial-hidden-inspector');

    const existing = lab.querySelector('.tutorial-guide');
    const currentStep = existing?.getAttribute('data-tutorial-current');
    if (!existing) {
      const grid = lab.querySelector('.lab-grid');
      if (grid) grid.insertAdjacentHTML('beforebegin', tutorialMarkup(step));
      else lab.insertAdjacentHTML('afterbegin', tutorialMarkup(step));
    } else if (currentStep !== String(stepIndex) || forceGuide) {
      existing.outerHTML = tutorialMarkup(step);
    }

    const grid = lab.querySelector('.lab-grid');
    grid?.classList.add('tutorial-game-grid');
    renderSpecialStage(lab, step, forceGuide);

    const handTitle = lab.querySelector('.hand-title');
    if (handTitle && /test hand/i.test(handTitle.textContent || '')) handTitle.textContent = 'Your tutorial hand';

    bindTutorial();
  }

  function enhance(forceGuide = false) {
    renameNavigation();
    enhanceLab(forceGuide);
  }

  const start = () => {
    const app = document.getElementById('app');
    if (!app) {
      window.setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(() => enhance(false));
    observer.observe(app, { childList: true, subtree: true });
    enhance();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
