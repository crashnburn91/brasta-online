(() => {
  if (window.__BRASTA_LOBBY_POLISH__) return;
  window.__BRASTA_LOBBY_POLISH__ = true;

  let audioContext = null;
  let audioUnlocked = false;
  let wasYourTurn = false;
  let eventAudioPrimed = false;
  const playedEventSoundKeys = new Set();
  let turnToastTimer = null;
  let polishScheduled = false;
  let rankedTabMode = '1v1';
  let requested2v2Refresh = false;

  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      void audioContext.resume();
      audioUnlocked = true;
    } catch {}
  }

  function playNotes(notes, delay = 0) {
    if (!audioUnlocked || !audioContext) return;
    try {
      const now = audioContext.currentTime + delay;
      notes.forEach(({ frequency, offset, duration, gain = 0.08 }) => {
        const oscillator = audioContext.createOscillator();
        const volume = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, now + offset);
        volume.gain.setValueAtTime(0.0001, now + offset);
        volume.gain.exponentialRampToValueAtTime(gain, now + offset + 0.015);
        volume.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
        oscillator.connect(volume);
        volume.connect(audioContext.destination);
        oscillator.start(now + offset);
        oscillator.stop(now + offset + duration + 0.02);
      });
    } catch {}
  }

  function playTurnSound() {
    playNotes([
      { frequency: 659.25, offset: 0, duration: 0.15 },
      { frequency: 880, offset: 0.17, duration: 0.22 },
    ]);
  }

  function playJackSweepSound(delay = 0) {
    playNotes([
      { frequency: 987.77, offset: 0, duration: 0.11, gain: 0.09 },
      { frequency: 783.99, offset: 0.09, duration: 0.12, gain: 0.085 },
      { frequency: 587.33, offset: 0.18, duration: 0.2, gain: 0.08 },
    ], delay);
    return 0.4;
  }

  function playBrastaSound(delay = 0) {
    playNotes([
      { frequency: 392, offset: 0, duration: 0.16, gain: 0.09 },
      { frequency: 523.25, offset: 0.12, duration: 0.17, gain: 0.095 },
      { frequency: 659.25, offset: 0.24, duration: 0.18, gain: 0.1 },
      { frequency: 783.99, offset: 0.36, duration: 0.2, gain: 0.105 },
      { frequency: 1046.5, offset: 0.5, duration: 0.34, gain: 0.12 },
    ], delay);
    return 0.86;
  }

  function playBig2Sound(delay = 0) {
    playNotes([
      { frequency: 220, offset: 0, duration: 0.16, gain: 0.1 },
      { frequency: 440, offset: 0.14, duration: 0.25, gain: 0.095 },
    ], delay);
    return 0.41;
  }

  function playBig10Sound(delay = 0) {
    playNotes([
      { frequency: 523.25, offset: 0, duration: 0.14, gain: 0.09 },
      { frequency: 783.99, offset: 0.13, duration: 0.25, gain: 0.1 },
    ], delay);
    return 0.4;
  }

  function playLastPickupSound(delay = 0) {
    playNotes([
      { frequency: 392, offset: 0, duration: 0.15, gain: 0.085 },
      { frequency: 493.88, offset: 0.15, duration: 0.15, gain: 0.09 },
      { frequency: 587.33, offset: 0.3, duration: 0.3, gain: 0.105 },
    ], delay);
    return 0.62;
  }

  function playLastHandSound(delay = 0) {
    playNotes([
      { frequency: 523.25, offset: 0, duration: 0.16 },
      { frequency: 659.25, offset: 0.17, duration: 0.16 },
      { frequency: 783.99, offset: 0.34, duration: 0.3, gain: 0.1 },
    ], delay);
    return 0.66;
  }

  function playSpecialEventSounds(text) {
    let delay = 0;
    const enqueue = (player) => {
      delay += player(delay) + 0.12;
    };

    if (/Jack sweep/i.test(text)) enqueue(playJackSweepSound);
    if (/BRASTA!/i.test(text)) enqueue(playBrastaSound);
    if (/BIG 2(?:\s*\+\s*BIG 10)?!/i.test(text)) enqueue(playBig2Sound);
    if (/BIG 10!/i.test(text) || /BIG 2\s*\+\s*BIG 10!/i.test(text)) enqueue(playBig10Sound);
    if (/LAST PICKUP!/i.test(text)) enqueue(playLastPickupSound);
    if (/LAST HAND!/i.test(text)) enqueue(playLastHandSound);
  }

  function updateEventAudio(eventBanner, hasMatch) {
    if (!hasMatch) {
      eventAudioPrimed = false;
      return;
    }

    if (!eventBanner) {
      if (!eventAudioPrimed) eventAudioPrimed = true;
      return;
    }

    const seq = eventBanner.dataset.eventSeq || '';
    if (!seq) return;

    const text = String(eventBanner.textContent || '').replace(/\s+/g, ' ').trim();
    const key = `${seq}|${text}`;

    // The app can re-render the same event banner many times while waiting for
    // the next player. Remember every event sound we have handled instead of
    // only the most recent sequence. This prevents Jack Sweep, Brasta, Big 2/10,
    // Last Pickup and Last Hand audio from replaying on DOM refreshes.
    if (playedEventSoundKeys.has(key)) return;

    playedEventSoundKeys.add(key);
    while (playedEventSoundKeys.size > 80) {
      playedEventSoundKeys.delete(playedEventSoundKeys.values().next().value);
    }

    if (!eventAudioPrimed) {
      eventAudioPrimed = true;
      return;
    }

    playSpecialEventSounds(text);
  }

  function turnBanner() {
    let banner = document.getElementById('brasta-your-turn-alert');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'brasta-your-turn-alert';
      banner.className = 'brasta-turn-alert';
      banner.textContent = 'YOUR TURN';
      banner.hidden = true;
      document.body.appendChild(banner);
    }
    return banner;
  }

  function hideTurnBanner() {
    if (turnToastTimer != null) {
      window.clearTimeout(turnToastTimer);
      turnToastTimer = null;
    }
    turnBanner().hidden = true;
  }

  function showTurnBannerBriefly() {
    const banner = turnBanner();
    if (turnToastTimer != null) window.clearTimeout(turnToastTimer);
    banner.hidden = false;
    banner.classList.remove('leaving');
    turnToastTimer = window.setTimeout(() => {
      banner.classList.add('leaving');
      window.setTimeout(() => {
        banner.hidden = true;
        banner.classList.remove('leaving');
      }, 180);
      turnToastTimer = null;
    }, 1150);
  }

  function polishRoomUi() {
    const nav = document.querySelector('.topbar nav');
    if (!nav) return;

    nav.querySelectorAll('[data-copy-invite], [data-copy-spectate]').forEach((el) => el.remove());

    const lobbyControls = document.querySelector('.lobby-controls');
    if (!lobbyControls) return;

    const roomAction = Array.from(lobbyControls.querySelectorAll('[data-online-home]'))
      .find((el) => /leave room|disconnect/i.test(el.textContent || ''));

    if (roomAction) {
      roomAction.classList.add('toolbar-exit');
      nav.appendChild(roomAction);
    }

    const duplicateSpectatorAction = Array.from(lobbyControls.querySelectorAll('[data-online-home]'))
      .find((el) => /stop spectating/i.test(el.textContent || ''));
    duplicateSpectatorAction?.remove();
  }

  function updateRankedTabs(shell) {
    const one = shell.querySelector('[data-competitive-card]');
    const two = shell.querySelector('[data-competitive-2v2-card]');
    if (!one || !two) return;

    const activeOne = rankedTabMode !== '2v2';
    one.hidden = !activeOne;
    two.hidden = activeOne;
    one.classList.toggle('active', activeOne);
    two.classList.toggle('active', !activeOne);

    shell.querySelectorAll('[data-ranked-home-tab]').forEach((button) => {
      const active = button.dataset.rankedHomeTab === rankedTabMode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', active ? 'true' : 'false');
      button.tabIndex = active ? 0 : -1;
    });

    if (!activeOne && !String(two.textContent || '').trim()) {
      two.innerHTML = '<div class="ranked-tab-loading"><div class="eyebrow">RANKED 2v2</div><h2>Team Competitive</h2><p>Loading your 2v2 competitive profile…</p></div>';
      if (!requested2v2Refresh) {
        requested2v2Refresh = true;
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent('brasta-competitive-updated'));
          window.setTimeout(() => { requested2v2Refresh = false; schedulePolish(); }, 250);
        }, 0);
      }
    }
  }

  function syncRankedTabs() {
    if (new URLSearchParams(location.search).get('room') || new URLSearchParams(location.search).get('spectate') || location.hash === '#lab') return;
    const grid = document.querySelector('.landing.landing-wide .landing-grid');
    if (!grid) return;

    let shell = grid.querySelector('[data-ranked-tabs-shell]');
    let one = grid.querySelector('[data-competitive-card]');
    let two = grid.querySelector('[data-competitive-2v2-card]');

    if (!one || !two) return;

    if (!shell) {
      shell = document.createElement('section');
      shell.className = 'landing-card competitive-card ranked-tabs-shell';
      shell.dataset.rankedTabsShell = '1';
      shell.innerHTML = '<div class="ranked-mode-tabs" role="tablist" aria-label="Ranked mode"><button type="button" data-ranked-home-tab="1v1" role="tab">1v1</button><button type="button" data-ranked-home-tab="2v2" role="tab">2v2</button></div>';
      one.insertAdjacentElement('beforebegin', shell);

      [one, two].forEach((panel) => {
        panel.classList.remove('landing-card', 'competitive-card', 'competitive-card-2v2');
        panel.classList.add('ranked-tab-panel');
        shell.appendChild(panel);
      });

      shell.querySelectorAll('[data-ranked-home-tab]').forEach((button) => {
        button.addEventListener('click', () => {
          rankedTabMode = button.dataset.rankedHomeTab === '2v2' ? '2v2' : '1v1';
          updateRankedTabs(shell);
        });
      });
    } else {
      one = shell.querySelector('[data-competitive-card]') || one;
      two = shell.querySelector('[data-competitive-2v2-card]') || two;
      if (one.parentElement !== shell) shell.appendChild(one);
      if (two.parentElement !== shell) shell.appendChild(two);
    }

    updateRankedTabs(shell);
  }

  function syncLearnBrastaActions() {
    const legacyLocalControl = document.querySelector('[data-newmode]');
    const learnCard = legacyLocalControl?.closest('.landing-card');
    const tutorial = learnCard?.querySelector('[data-nav="lab"]');
    const bot = document.querySelector('[data-play-bot]');
    if (!learnCard || !tutorial || !bot) return;

    let actions = learnCard.querySelector('.learn-brasta-actions');
    if (!actions) {
      actions = document.createElement('div');
      actions.className = 'learn-brasta-actions';
      tutorial.insertAdjacentElement('beforebegin', actions);
    }

    if (tutorial.parentElement !== actions) actions.appendChild(tutorial);
    if (bot.parentElement !== actions) actions.appendChild(bot);

    if (!bot.classList.contains('learn-bot-launch')) {
      bot.classList.add('learn-bot-launch');
      bot.innerHTML = '<span class="learn-bot-icon">🤖</span><span class="learn-bot-copy"><b>Play vs Bot</b><small>Practice a private 1v1 match</small></span>';
      bot.setAttribute('aria-label', 'Play a practice match against the Brasta bot');
    }
  }

  function updateGameAlerts() {
    const hasGame = !!document.querySelector('.table');
    const hasMatch = !!document.querySelector('.players');
    const activePlayer = document.querySelector('.player-chip.active');
    const yourTurn = hasGame && activePlayer?.dataset.you === '1';

    document.documentElement.classList.toggle('brasta-your-turn', yourTurn);
    document.querySelectorAll('.player-chip').forEach((chip) => chip.classList.toggle('your-turn-chip', chip === activePlayer && yourTurn));
    document.querySelector('.hand-area')?.classList.toggle('your-turn-hand', yourTurn);

    if (yourTurn && !wasYourTurn) {
      showTurnBannerBriefly();
      playTurnSound();
    } else if (!yourTurn) {
      hideTurnBanner();
    }
    wasYourTurn = yourTurn;

    const targetTitle = yourTurn ? 'Your Turn — Brasta' : 'Brasta';
    if (document.title !== targetTitle) document.title = targetTitle;

    const events = Array.from(document.querySelectorAll('.event'));
    const lastHandEvent = events.find((el) => /LAST HAND!/i.test(el.textContent || ''));
    if (lastHandEvent) lastHandEvent.classList.add('last-hand-banner');

    const sequencedEvent = events.find((el) => el.dataset.eventSeq);
    updateEventAudio(sequencedEvent, hasMatch);

    if (!hasGame) {
      wasYourTurn = false;
      document.documentElement.classList.remove('brasta-your-turn');
      hideTurnBanner();
    }
  }

  function polish() {
    polishScheduled = false;
    polishRoomUi();
    syncRankedTabs();
    syncLearnBrastaActions();
    updateGameAlerts();
  }

  function schedulePolish() {
    if (polishScheduled) return;
    polishScheduled = true;
    requestAnimationFrame(polish);
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  const observer = new MutationObserver(schedulePolish);
  function startObserver() {
    const appRoot = document.getElementById('app');
    if (!appRoot) {
      window.setTimeout(startObserver, 50);
      return;
    }
    observer.observe(appRoot, { childList: true, subtree: true });
    schedulePolish();
  }

  window.addEventListener('brasta-auth-changed', schedulePolish);
  window.addEventListener('brasta-competitive-updated', schedulePolish);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();