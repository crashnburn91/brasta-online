(() => {
  if (window.__BRASTA_LOBBY_POLISH__) return;
  window.__BRASTA_LOBBY_POLISH__ = true;

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

  const observer = new MutationObserver(polishRoomUi);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', polishRoomUi, { once: true });
  } else {
    polishRoomUi();
  }
})();
