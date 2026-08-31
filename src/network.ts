namespace BrastaNet {
  export type SessionRole = 'player' | 'spectator';
  export interface PlayerExperienceSummary { level: number; title: string; progressPercent: number; progressLabel: string; }
  export interface RoomPlayer { seat: Brasta.Seat; name: string; connected: boolean; occupied: boolean; rankName?: string | null; experience?: PlayerExperienceSummary | null; }
  export interface RoomSpectator { name: string; connected: boolean; }
  export interface RoomSnapshot {
    code: string;
    mode: Brasta.Mode;
    targetScore: Brasta.TargetScore;
    started: boolean;
    revision: number;
    hostSeat: Brasta.Seat;
    players: RoomPlayer[];
    spectators: RoomSpectator[];
    spectatorCount: number;
    full: boolean;
    ranked?: {
      serverNow: number;
      turnSeat: Brasta.Seat | null;
      turnDeadlineAt: number | null;
      roundAdvanceAt: number | null;
    } | null;
  }
  export interface SessionInfo {
    code: string;
    seat: Brasta.Seat | null;
    token: string;
    name: string;
    isHost: boolean;
    role: SessionRole;
  }
  export interface RoomUpdate {
    room: RoomSnapshot;
    you: { seat: Brasta.Seat | null; name: string; isHost: boolean; role: SessionRole };
    state: Brasta.GameState | null;
  }
  export type ClientEvent =
    | { type: 'status'; status: 'connecting' | 'connected' | 'disconnected' }
    | { type: 'session'; session: SessionInfo }
    | { type: 'room'; update: RoomUpdate }
    | { type: 'error'; message: string }
    | { type: 'notice'; message: string };
  type EventHandler = (event: ClientEvent) => void;
  type DiagnosticEntry = {
    ts: number;
    event: string;
    code?: number;
    reason?: string;
    clean?: boolean;
    lifetimeMs?: number;
    delayMs?: number;
    attempt?: number;
    source?: string;
    online?: boolean;
    visibility?: string;
  };

  const SESSION_PREFIX = 'brasta-online-session:';
  const LAST_NAME_KEY = 'brasta-online-last-name';
  const AUTH_TOKEN_KEY = 'brasta-auth-access-token';
  const DIAGNOSTICS_KEY = 'brasta-network-diagnostics-v1';
  const MAX_DIAGNOSTICS = 80;
  const CONNECT_TIMEOUT_MS = 10000;
  const PING_INTERVAL_MS = 20000;
  const PONG_TIMEOUT_MS = 30000;
  const HEALTH_INTERVAL_MS = 5000;
  const RESUME_GRACE_MS = 10000;

  export function normalizeCode(code: string): string { return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  export function rememberName(name: string): void { try { localStorage.setItem(LAST_NAME_KEY, name.trim()); } catch {} }
  export function lastName(): string { try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch { return ''; } }
  export function authAccessToken(): string { try { return localStorage.getItem(AUTH_TOKEN_KEY) || ''; } catch { return ''; } }
  function sessionKey(code: string, role: SessionRole): string { return `${SESSION_PREFIX}${role}:${normalizeCode(code)}`; }
  function legacySessionKey(code: string): string { return SESSION_PREFIX + normalizeCode(code); }

  function diagnostic(event: string, extra: Partial<DiagnosticEntry> = {}): void {
    try {
      const raw = localStorage.getItem(DIAGNOSTICS_KEY);
      const entries = raw ? JSON.parse(raw) as DiagnosticEntry[] : [];
      entries.push({
        ts: Date.now(),
        event,
        online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
        visibility: typeof document !== 'undefined' ? document.visibilityState : undefined,
        ...extra,
      });
      localStorage.setItem(DIAGNOSTICS_KEY, JSON.stringify(entries.slice(-MAX_DIAGNOSTICS)));
    } catch {}
  }

  export function connectionDiagnostics(): DiagnosticEntry[] {
    try {
      const raw = localStorage.getItem(DIAGNOSTICS_KEY);
      return raw ? JSON.parse(raw) as DiagnosticEntry[] : [];
    } catch { return []; }
  }

  export function clearConnectionDiagnostics(): void {
    try { localStorage.removeItem(DIAGNOSTICS_KEY); } catch {}
  }

  export function loadSession(code: string, role: SessionRole = 'player'): SessionInfo | null {
    try {
      const normalized = normalizeCode(code);
      let raw = localStorage.getItem(sessionKey(normalized, role));
      if (!raw && role === 'player') raw = localStorage.getItem(legacySessionKey(normalized));
      if (!raw) return null;
      const v = JSON.parse(raw) as SessionInfo;
      if (!v?.token || !v?.code) return null;
      return { ...v, role: v.role === 'spectator' ? 'spectator' : role, seat: v.role === 'spectator' ? null : v.seat };
    } catch { return null; }
  }
  export function saveSession(session: SessionInfo): void {
    try {
      localStorage.setItem(sessionKey(session.code, session.role), JSON.stringify(session));
      if (session.role === 'player') localStorage.removeItem(legacySessionKey(session.code));
      rememberName(session.name);
    } catch {}
  }
  export function clearSession(code: string, role?: SessionRole): void {
    try {
      const normalized = normalizeCode(code);
      if (!role || role === 'player') {
        localStorage.removeItem(sessionKey(normalized, 'player'));
        localStorage.removeItem(legacySessionKey(normalized));
      }
      if (!role || role === 'spectator') localStorage.removeItem(sessionKey(normalized, 'spectator'));
    } catch {}
  }

  export class Client {
    private socket: WebSocket | null = null;
    private connecting: Promise<void> | null = null;
    private reconnectTimer: number | null = null;
    private pingTimer: number | null = null;
    private healthTimer: number | null = null;
    private reconnectDelay = 1000;
    private reconnectAttempt = 0;
    private stopped = false;
    private resume: { code: string; name: string; token: string; role: SessionRole } | null = null;
    private socketOpenedAt = 0;
    private lastMessageAt = 0;
    private lastPingAt = 0;
    private lastPongAt = 0;
    private resumeGraceUntil = 0;
    private lifecycleBound = false;

    private readonly onVisibilityChange = () => {
      diagnostic('visibility_change', { source: document.visibilityState });
      if (document.visibilityState === 'visible') {
        this.resumeGraceUntil = Date.now() + RESUME_GRACE_MS;
        this.recoverFromLifecycle('visibility');
      }
    };
    private readonly onPageShow = () => {
      diagnostic('pageshow');
      this.resumeGraceUntil = Date.now() + RESUME_GRACE_MS;
      this.recoverFromLifecycle('pageshow');
    };
    private readonly onOnline = () => {
      diagnostic('online');
      this.resumeGraceUntil = Date.now() + RESUME_GRACE_MS;
      this.recoverFromLifecycle('online');
    };
    private readonly onOffline = () => {
      // navigator.onLine is advisory only. Mobile browsers can briefly report
      // offline while changing Wi-Fi/cellular paths, so never stop recovery here.
      diagnostic('offline');
      if (!this.isConnected) this.recoverFromLifecycle('offline-event');
    };

    constructor(private handler: EventHandler) {
      this.bindLifecycle();
    }
    get isConnected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }

    private bindLifecycle(): void {
      if (this.lifecycleBound || typeof window === 'undefined') return;
      this.lifecycleBound = true;
      document.addEventListener('visibilitychange', this.onVisibilityChange);
      window.addEventListener('pageshow', this.onPageShow);
      window.addEventListener('online', this.onOnline);
      window.addEventListener('offline', this.onOffline);
    }

    private unbindLifecycle(): void {
      if (!this.lifecycleBound || typeof window === 'undefined') return;
      this.lifecycleBound = false;
      document.removeEventListener('visibilitychange', this.onVisibilityChange);
      window.removeEventListener('pageshow', this.onPageShow);
      window.removeEventListener('online', this.onOnline);
      window.removeEventListener('offline', this.onOffline);
    }

    connect(): Promise<void> {
      this.stopped = false;
      if (this.isConnected) return Promise.resolve();
      if (this.connecting) return this.connecting;
      this.connecting = this.openSocket(false).finally(() => { this.connecting = null; });
      return this.connecting;
    }

    private openSocket(resumeOnOpen: boolean): Promise<void> {
      if (location.protocol === 'file:') {
        const message = 'Online rooms require a deployed/server version of Brasta.';
        this.handler({ type: 'error', message });
        return Promise.reject(new Error(message));
      }

      this.handler({ type: 'status', status: 'connecting' });
      diagnostic('socket_opening', { attempt: this.reconnectAttempt, source: resumeOnOpen ? 'resume' : 'initial' });
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
        this.socket = ws;
        (window as any).__BRASTA_PRIMARY_GAME_SOCKET__ = ws;
        let settled = false;
        const connectStartedAt = Date.now();
        const connectTimeout = window.setTimeout(() => {
          if (settled || ws.readyState === WebSocket.OPEN) return;
          settled = true;
          diagnostic('connect_timeout', { attempt: this.reconnectAttempt });
          try { ws.close(4000, 'Connect timeout'); } catch {}
          reject(new Error('Connection attempt timed out.'));
        }, CONNECT_TIMEOUT_MS);

        ws.onopen = () => {
          window.clearTimeout(connectTimeout);
          settled = true;
          this.socketOpenedAt = Date.now();
          this.lastMessageAt = this.socketOpenedAt;
          this.lastPongAt = this.socketOpenedAt;
          this.lastPingAt = 0;
          this.resumeGraceUntil = this.socketOpenedAt + RESUME_GRACE_MS;
          this.reconnectDelay = 1000;
          this.reconnectAttempt = 0;
          diagnostic('socket_open', { delayMs: this.socketOpenedAt - connectStartedAt, source: resumeOnOpen ? 'resume' : 'initial' });
          this.handler({ type: 'status', status: 'connected' });
          this.startHeartbeat();
          if (resumeOnOpen && this.resume?.token) {
            this.send({
              type: this.resume.role === 'spectator' ? 'SPECTATE_ROOM' : 'JOIN_ROOM',
              code: this.resume.code,
              name: this.resume.name,
              token: this.resume.token,
              accessToken: this.resume.role === 'player' ? authAccessToken() || undefined : undefined,
            });
          }
          resolve();
        };
        ws.onerror = () => {
          diagnostic('socket_error', { attempt: this.reconnectAttempt });
          if (!settled) {
            window.clearTimeout(connectTimeout);
            settled = true;
            reject(new Error('Could not connect to the Brasta server.'));
          }
        };
        ws.onclose = (event) => {
          window.clearTimeout(connectTimeout);
          this.stopHeartbeat();
          const lifetimeMs = this.socketOpenedAt ? Date.now() - this.socketOpenedAt : 0;
          diagnostic('socket_close', {
            code: event.code,
            reason: String(event.reason || '').slice(0, 120),
            clean: event.wasClean,
            lifetimeMs,
            attempt: this.reconnectAttempt,
          });
          this.socketOpenedAt = 0;
          this.lastMessageAt = 0;
          this.lastPingAt = 0;
          this.lastPongAt = 0;
          this.resumeGraceUntil = 0;
          if (this.socket === ws) this.socket = null;
          if ((window as any).__BRASTA_PRIMARY_GAME_SOCKET__ === ws) {
            (window as any).__BRASTA_PRIMARY_GAME_SOCKET__ = null;
          }
          this.handler({ type: 'status', status: 'disconnected' });
          if (!settled) {
            settled = true;
            reject(new Error('Connection closed before it was ready.'));
          }
          if (!this.stopped) this.scheduleReconnect();
        };
        ws.onmessage = (event) => {
          this.lastMessageAt = Date.now();
          try { this.handleMessage(JSON.parse(String(event.data))); }
          catch { this.handler({ type: 'error', message: 'Received an unreadable message from the server.' }); }
        };
      });
    }

    private recoverFromLifecycle(source: string): void {
      if (this.stopped) return;

      if (this.socket?.readyState === WebSocket.OPEN) {
        diagnostic('lifecycle_probe', { source });
        this.sendPing(source);
        return;
      }
      if (this.socket?.readyState === WebSocket.CONNECTING || this.connecting) return;

      if (this.reconnectTimer != null) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = null;
      }
      diagnostic('lifecycle_reconnect', { source });
      this.connecting = this.openSocket(true)
        .catch(() => { this.scheduleReconnect(); })
        .finally(() => { this.connecting = null; });
    }

    private scheduleReconnect(): void {
      if (this.reconnectTimer != null || this.stopped) return;
      const jitter = Math.floor(Math.random() * 300);
      const delay = this.reconnectDelay + jitter;
      this.reconnectAttempt += 1;
      diagnostic('reconnect_scheduled', { delayMs: delay, attempt: this.reconnectAttempt });
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        if (this.stopped) return;
        if (this.connecting || this.socket?.readyState === WebSocket.CONNECTING || this.socket?.readyState === WebSocket.OPEN) return;
        this.connecting = this.openSocket(true)
          .catch(() => { this.scheduleReconnect(); })
          .finally(() => { this.connecting = null; });
      }, delay);
    }

    private sendPing(source = 'interval'): void {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      if (source === 'interval' && typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      try {
        this.lastPingAt = Date.now();
        this.socket.send(JSON.stringify({ type: 'PING' }));
        if (source !== 'interval') diagnostic('ping_probe', { source });
      } catch {
        try { this.socket.close(4000, 'Ping send failed'); } catch {}
      }
    }

    private startHeartbeat(): void {
      this.stopHeartbeat();
      this.pingTimer = window.setInterval(() => this.sendPing(), PING_INTERVAL_MS);
      this.healthTimer = window.setInterval(() => {
        if (this.socket?.readyState !== WebSocket.OPEN) return;
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
        const now = Date.now();
        if (now < this.resumeGraceUntil) return;

        // Any server traffic after our last ping proves the socket is alive. Do
        // not require a specific PONG if a room update/notice arrived meanwhile.
        const latestServerActivity = Math.max(this.lastPongAt, this.lastMessageAt);
        if (this.lastPingAt > latestServerActivity && now - this.lastPingAt > PONG_TIMEOUT_MS) {
          diagnostic('pong_timeout', { lifetimeMs: this.socketOpenedAt ? now - this.socketOpenedAt : 0 });
          try { this.socket.close(4000, 'PONG timeout'); } catch {}
        }
      }, HEALTH_INTERVAL_MS);
    }

    private stopHeartbeat(): void {
      if (this.pingTimer != null) { clearInterval(this.pingTimer); this.pingTimer = null; }
      if (this.healthTimer != null) { clearInterval(this.healthTimer); this.healthTimer = null; }
    }

    private handleMessage(message: any): void {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'PONG') {
        this.lastPongAt = Date.now();
        return;
      }
      if (message.type === 'SESSION') {
        const session = message.session as SessionInfo;
        saveSession(session);
        this.resume = { code: session.code, name: session.name, token: session.token, role: session.role };
        this.handler({ type: 'session', session });
      }
      else if (message.type === 'ROOM_STATE') this.handler({ type: 'room', update: message.update as RoomUpdate });
      else if (message.type === 'EMOTE') {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('brasta-emote-received', { detail: message.event }));
        }
      }
      else if (message.type === 'ERROR') this.handler({ type: 'error', message: String(message.message || 'Server rejected the request.') });
      else if (message.type === 'NOTICE') this.handler({ type: 'notice', message: String(message.message || '') });
    }

    private send(payload: object): void {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.handler({ type: 'error', message: 'Connection interrupted. Reconnecting…' });
        return;
      }
      this.socket.send(JSON.stringify(payload));
    }

    async createRoom(name: string, mode: Brasta.Mode, targetScore: Brasta.TargetScore = 110): Promise<void> {
      this.resume = null;
      await this.connect();
      this.send({ type: 'CREATE_ROOM', name: name.trim(), mode, targetScore, accessToken: authAccessToken() || undefined });
    }
    async joinRoom(code: string, name: string, token?: string): Promise<void> {
      const normalized = normalizeCode(code);
      this.resume = token ? { code: normalized, name: name.trim(), token, role: 'player' } : null;
      await this.connect();
      this.send({ type: 'JOIN_ROOM', code: normalized, name: name.trim(), token: token || undefined, accessToken: authAccessToken() || undefined });
    }
    async resumeAccount(accessToken: string): Promise<void> {
      this.resume = null;
      await this.connect();
      this.send({ type: 'RESUME_ACCOUNT', accessToken });
    }
    async spectateRoom(code: string, name: string, token?: string): Promise<void> {
      const normalized = normalizeCode(code);
      this.resume = token ? { code: normalized, name: name.trim(), token, role: 'spectator' } : null;
      await this.connect();
      this.send({ type: 'SPECTATE_ROOM', code: normalized, name: name.trim(), token: token || undefined });
    }
    startGame(): void { this.send({ type: 'START_GAME' }); }
    openingChoice(choice: 'keep' | 'put'): void { this.send({ type: 'OPENING_CHOICE', choice }); }
    emote(emote: string): void { this.send({ type: 'EMOTE', emote }); }
    claimAccount(accessToken?: string): void {
      const token = accessToken || authAccessToken();
      if (token) this.send({ type: 'CLAIM_ACCOUNT', accessToken: token });
    }
    command(command: Brasta.Command): void { this.send({ type: 'COMMAND', command }); }
    rankedTurnTimeout(): void { this.send({ type: 'RANKED_TURN_TIMEOUT' }); }
    nextRound(): void { this.send({ type: 'NEXT_ROUND' }); }
    endMatch(): void { this.send({ type: 'END_MATCH' }); }
    leaveRoom(): void { this.resume = null; this.send({ type: 'LEAVE_ROOM' }); }
    close(): void {
      this.stopped = true;
      this.resume = null;
      this.stopHeartbeat();
      this.unbindLifecycle();
      if (this.reconnectTimer != null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      const closingSocket = this.socket;
      try { closingSocket?.close(1000, 'Client closed'); } catch {}
      this.socket = null;
      if ((window as any).__BRASTA_PRIMARY_GAME_SOCKET__ === closingSocket) {
        (window as any).__BRASTA_PRIMARY_GAME_SOCKET__ = null;
      }
      diagnostic('client_closed');
    }
  }
}
