(() => {
  if (window.__BRASTA_ACCOUNT_NETWORK__) return;
  window.__BRASTA_ACCOUNT_NETWORK__ = true;

  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const originalSend = WebSocket.prototype.send;

  if (WebSocket.prototype.__brastaAccountSendPatched) return;
  Object.defineProperty(WebSocket.prototype, '__brastaAccountSendPatched', { value: true });

  WebSocket.prototype.send = function brastaAccountSend(data) {
    if (typeof data !== 'string') return originalSend.call(this, data);

    // Brasta Bot uses its own WebSocket in the signed-in player's browser.
    // Only the primary human game socket may inherit the account token.
    if (this !== window.__BRASTA_PRIMARY_GAME_SOCKET__) {
      return originalSend.call(this, data);
    }

    let path = '';
    try { path = new URL(this.url, location.href).pathname; } catch {}
    if (path !== '/api/ws') return originalSend.call(this, data);

    let message;
    try { message = JSON.parse(data); } catch { return originalSend.call(this, data); }
    if (!message || !['CREATE_ROOM', 'JOIN_ROOM', 'SPECTATE_ROOM'].includes(message.type)) {
      return originalSend.call(this, data);
    }

    try {
      const accessToken = localStorage.getItem(AUTH_TOKEN_KEY);
      if (accessToken) message.accessToken = accessToken;
    } catch {}
    return originalSend.call(this, JSON.stringify(message));
  };
})();
