(() => {
  if (window.__BRASTA_TUTORIAL__) return;
  window.__BRASTA_TUTORIAL__ = true;

  let stepIndex = 0;
  let switchingScenario = false;

  const steps = [
    {
      title: 'Welcome to Brasta',
      eyebrow: '1 · THE GOAL',
      text: 'Brasta is played in rounds. Capture cards, protect valuable cards, build combinations, and earn bonuses. Matches are played to 110 or 220 points.',
      tip: 'At the start of each round, the starting player may KEEP their first four cards or PUT those four on the board and receive a replacement hand.',
      scenario: 'build7',
      passive: true,
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
      text: 'Captured cards and round bonuses all add together. The last successful capture also receives every card left on the table when the round ends.',
      tip: 'Aces +1 each · Jacks +1 each · 2♣ +10 · 10♦ +10 · most clubs +2 · most cards +2 · Last Pickup +10 · each Brasta +10 · each Burned Jack −10.',
      scenario: 'brasta',
      passive: true,
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
    document.querySelectorAll('[data-nav="lab"]').forEach((el) => {
      if ((el.textContent || '').trim() !== 'Tutorial') el.textContent = 'Tutorial';
    });
  }

  function tutorialMarkup(step) {
    const dots = steps.map((_, i) => `<button class="tutorial-dot ${i === stepIndex ? 'active' : ''}" data-tutorial-step="${i}" aria-label="Tutorial step ${i + 1}"></button>`).join('');
    return `
      <section class="tutorial-guide">
        <div class="tutorial-copy">
          <div class="tutorial-eyebrow">${step.eyebrow}</div>
          <h1>${step.title}</h1>
          <p>${step.text}</p>
          <div class="tutorial-tip"><b>${step.passive ? 'Remember' : 'Your move'}</b><span>${step.tip}</span></div>
        </div>
        <div class="tutorial-controls">
          <div class="tutorial-progress">${dots}</div>
          <div class="tutorial-nav">
            <button data-tutorial-prev ${stepIndex === 0 ? 'disabled' : ''}>Back</button>
            <span>${stepIndex + 1} / ${steps.length}</span>
            <button class="primary" data-tutorial-next>${stepIndex === steps.length - 1 ? 'Finish' : 'Next'}</button>
          </div>
        </div>
      </section>`;
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

    const prev = document.querySelector('[data-tutorial-prev]');
    if (prev) prev.onclick = () => {
      if (stepIndex <= 0) return;
      stepIndex -= 1;
      setScenario(steps[stepIndex].scenario);
      enhance();
    };

    const next = document.querySelector('[data-tutorial-next]');
    if (next) next.onclick = () => {
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

  function enhanceLab() {
    const lab = labRoot();
    if (!lab) return;
    lab.classList.add('tutorial-mode');

    const originalTitle = lab.querySelector(':scope > h1');
    const originalIntro = lab.querySelector(':scope > p');
    if (originalTitle) originalTitle.hidden = true;
    if (originalIntro) originalIntro.hidden = true;

    lab.querySelector('.lab-scenarios')?.classList.add('tutorial-source-controls');
    lab.querySelector('.inspector')?.classList.add('tutorial-hidden-inspector');

    const existing = lab.querySelector('.tutorial-guide');
    const markup = tutorialMarkup(steps[stepIndex]);
    if (existing) existing.outerHTML = markup;
    else {
      const grid = lab.querySelector('.lab-grid');
      if (grid) grid.insertAdjacentHTML('beforebegin', markup);
      else lab.insertAdjacentHTML('afterbegin', markup);
    }

    const grid = lab.querySelector('.lab-grid');
    grid?.classList.add('tutorial-game-grid');

    const handTitle = lab.querySelector('.hand-title');
    if (handTitle && /test hand/i.test(handTitle.textContent || '')) handTitle.textContent = 'Your tutorial hand';

    bindTutorial();
  }

  function enhance() {
    renameNavigation();
    enhanceLab();
  }

  const start = () => {
    const app = document.getElementById('app');
    if (!app) {
      window.setTimeout(start, 50);
      return;
    }
    const observer = new MutationObserver(enhance);
    observer.observe(app, { childList: true, subtree: true });
    enhance();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
