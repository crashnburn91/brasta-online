(() => {
  if (window.__BRASTA_NETWORK_STABILITY_V2__) return;
  window.__BRASTA_NETWORK_STABILITY_V2__ = true;

  const DIAGNOSTICS_KEY = 'brasta-network-diagnostics-v1';
  const CONNECT_TIMEOUT_MS = 10000;

  function diagnostic(event, extra = {}) {
    try {
      const raw = localStorage.getItem(DIAGNOSTICS_KEY);
      const entries = raw ? JSON.parse(raw) : [];
      entries.push({
        ts: Date.now(),
        event,
        online: navigator.onLine,
        visibility: document.visibilityState,
        ...extra,
      });
      localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(entries.slice(-80)));
    } catch {}
  }

  function install() {
    const Client = window.BrastaNet?.Client;
    if (!Client) {
      window.setTimeout(install, 50);
      return;
    }

    const proto = Client.prototype;
    if (proto.__brastaGenerationGuardInstalled) return;
    proto.__brastaGenerationGuardInstalled = true;

    proto.openSocket = function (resumeOnOpen) {
      if (location.protocol === 'file:') {
        const message = 'Online rooms require a deployed/server version of Brasta.';
        this.handler({ type: 'error', message });
        return Promise.reject(new Error(message));
      }

      this.handler({ type: 'status', status: 'connecting' });
      const generation = (this.__brastaSocketGeneration || 0) + 1;
      this.__brastaSocketGeneration = generation;
      diagnostic('socket_opening', {
        attempt: this.reconnectAttempt || 0,
        source: resumeOnOpen ? 'resume' : 'initial',
        generation,
      });

      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
        this.socket = ws;
        let settled = false;
        const connectStartedAt = Date.now();
        const isCurrent = () => this.socket === ws && this.__brastaSocketGeneration === generation;

        const connectTimeout = window.setTimeout(() => {
          if (settled || ws.readyState === WebSocket.OPEN || !isCurrent()) return;
          settled = true;
          diagnostic('connect_timeout', { attempt: this.reconnectAttempt || 0, generation });
          try { ws.close(4000, 'Connect timeout'); } catch {}
          reject(new Error('Connection attempt timed out.'));
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          window.clearTimeout(connectTimeout);
          if (!isCurrent()) {
            diagnostic('stale_socket_open_ignored', { generation });
            try { ws.close(4002, 'Superseded socket'); } catch {}
            if (!settled) { settled = true; resolve(); }
            return;
          }

          settled = true;
          this.socketOpenedAt = Date.now();
          this.lastMessageAt = this.socketOpenedAt;
          this.lastPongAt = this.socketOpenedAt;
          this.lastPingAt = 0;
          this.resumeGraceUntil = this.socketOpenedAt + 10000;
          this.reconnectDelay = 1000;
          this.reconnectAttempt = 0;
          diagnostic('socket_open', {
            delayMs: this.socketOpenedAt - connectStartedAt,
            source: resumeOnOpen ? 'resume' : 'initial',
            generation,
          });
          this.handler({ type: 'status', status: 'connected' });
          this.startHeartbeat();

          if (resumeOnOpen && this.resume?.token) {
            this.send({
              type: this.resume.role === 'spectator' ? 'SPECTATE_ROOM' : 'JOIN_ROOM',
              code: this.resume.code,
              name: this.resume.name,
              token: this.resume.token,
            });
          }
          resolve();
        };

        ws.onerror = () => {
          if (!isCurrent()) {
            diagnostic('stale_socket_error_ignored', { generation });
            return;
          }
          diagnostic('socket_error', { attempt: this.reconnectAttempt || 0, generation });
          if (!settled) {
            window.clearTimeout(connectTimeout);
            settled = true;
            reject(new Error('Could not connect to the Brasta server.'));
          }
        };

        ws.onclose = (event) => {
          window.clearTimeout(connectTimeout);

          if (!isCurrent()) {
            diagnostic('stale_socket_close_ignored', {
              generation,
              code: event.code,
              reason: String(event.reason || '').slice(0, 120),
            });
            if (!settled) { settled = true; resolve(); }
            return;
          }

          this.stopHeartbeat();
          const lifetimeMs = this.socketOpenedAt ? Date.now() - this.socketOpenedAt : 0;
          diagnostic('socket_close', {
            code: event.code,
            reason: String(event.reason || '').slice(0, 120),
            clean: event.wasClean,
            lifetimeMs,
            attempt: this.reconnectAttempt || 0,
            generation,
          });

          this.socketOpenedAt = 0;
          this.lastMessageAt = 0;
          this.lastPingAt = 0;
          this.lastPongAt = 0;
          this.resumeGraceUntil = 0;
          this.socket = null;
          this.handler({ type: 'status', status: 'disconnected' });

          if (!settled) {
            settled = true;
            reject(new Error('Connection closed before it was ready.'));
          }
          if (!this.stopped) this.scheduleReconnect();
        };

        ws.onmessage = (event) => {
          if (!isCurrent()) {
            diagnostic('stale_socket_message_ignored', { generation });
            return;
          }
          this.lastMessageAt = Date.now();
          try { this.handleMessage(JSON.parse(String(event.data))); }
          catch { this.handler({ type: 'error', message: 'Received an unreadable message from the server.' }); }
        };
      });
    };

    diagnostic('generation_guard_installed');
  }

  install();
})();