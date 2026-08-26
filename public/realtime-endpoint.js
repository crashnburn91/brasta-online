(() => {
  if (window.__BRASTA_REALTIME_ENDPOINT_SHIM__) return;
  window.__BRASTA_REALTIME_ENDPOINT_SHIM__ = true;

  const meta = document.querySelector('meta[name="brasta-realtime-url"]');
  const configured = String(meta?.getAttribute('content') || '').trim();
  if (!configured) return;

  const NativeWebSocket = window.WebSocket;
  if (!NativeWebSocket) return;

  function configuredSocketUrl() {
    try {
      const target = new URL(configured, location.href);
      if (target.protocol === 'http:') target.protocol = 'ws:';
      else if (target.protocol === 'https:') target.protocol = 'wss:';
      if (target.protocol !== 'ws:' && target.protocol !== 'wss:') return null;
      return target.toString();
    } catch {
      return null;
    }
  }

  const realtimeUrl = configuredSocketUrl();
  if (!realtimeUrl) {
    console.error('[Brasta realtime] Ignoring invalid configured realtime URL.');
    return;
  }

  function shouldRedirect(url) {
    try {
      const requested = new URL(String(url), location.href);
      return requested.host === location.host && requested.pathname === '/api/ws';
    } catch {
      return false;
    }
  }

  class BrastaConfiguredWebSocket extends NativeWebSocket {
    constructor(url, protocols) {
      const target = shouldRedirect(url) ? realtimeUrl : url;
      if (protocols === undefined) super(target);
      else super(target, protocols);
    }
  }

  window.WebSocket = BrastaConfiguredWebSocket;
  window.__BRASTA_REALTIME_URL__ = realtimeUrl;
  console.info('[Brasta realtime] Using configured realtime endpoint:', realtimeUrl);
})();
