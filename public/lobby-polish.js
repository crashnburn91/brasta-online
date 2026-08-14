(() => {
  if (window.__BRASTA_LOBBY_POLISH__) return;
  window.__BRASTA_LOBBY_POLISH__ = true;

  let audioContext = null;
  let audioUnlocked = false;
  let wasYourTurn = false;
  let lastHandSeen = false;

  function unlockAudio() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!audioContext) audioContext = new AudioCtx();
      void audioContext.resume();
      audioUnlocked = true;
    } catch {}
  }

  function playNotes(notes) {
    if (!audioUnlocked || !audioContext) return;
    try {
      const now = audioContext.currentTime;
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

  function playLastHandSound() {
    playNotes([
      { frequency: 523.25, offset: 0, duration: 0.16 },
      { frequency: 659.25, offset: 0.17, duration: 0.16 },
      { frequency: 783.99, offset: 0.34, duration: 0.3, gain: 0.1 },
    ]);
  }

  function ensureTurnBanner(show) {
    let banner = document.getElementById('brasta-your-turn-alert');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'brasta-your-turn-alert';
      banner.className = 'brasta-turn-alert';
      banner.textContent = 'YOUR TURN';
      banner.hidden = true;
      document.body.appendChild(banner);
    }
    const shouldHide = !show;
    if (banner.hidden !== shouldHide) banner.hidden = shouldHide;
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

  function updateGameAlerts() {
    const hasGame = !!document.querySelector('.table');
    const activePlayer = document.querySelector('.player-chip.active');
    const yourTurn = hasGame && !!activePlayer?.querySelector('.you-badge');

    ensureTurnBanner(yourTurn);
    if (yourTurn && !wasYourTurn) playTurnSound();
    wasYourTurn = yourTurn;

    const targetTitle = yourTurn ? 'Your Turn — Brasta' : 'Brasta';
    if (document.title !== targetTitle) document.title = targetTitle;

    const events = Array.from(document.querySelectorAll('.event'));
    const lastHandEvent = events.find((el) => /LAST HAND!/i.test(el.textContent || ''));
    if (lastHandEvent) {
      lastHandEvent.classList.add('last-hand-banner');
      if (!lastHandSeen) {
        playLastHandSound();
        lastHandSeen = true;
      }
    } else if (!document.querySelector('.round-end')) {
      lastHandSeen = false;
    }

    if (!hasGame) {
      wasYourTurn = false;
      ensureTurnBanner(false);
    }
  }

  function polish() {
    polishRoomUi();
    updateGameAlerts();
  }

  document.addEventListener('pointerdown', unlockAudio, { once: true, passive: true });
  document.addEventListener('touchstart', unlockAudio, { once: true, passive: true });
  document.addEventListener('keydown', unlockAudio, { once: true });

  const observer = new MutationObserver(polish);
  function startObserver() {
    const appRoot = document.getElementById('app');
    if (!appRoot) {
      window.setTimeout(startObserver, 50);
      return;
    }
    observer.observe(appRoot, { childList: true, subtree: true });
    polish();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  } else {
    startObserver();
  }
})();
