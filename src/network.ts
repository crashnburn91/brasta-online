namespace BrastaNet {
  export type SessionRole = 'player' | 'spectator';
  export interface RoomPlayer { seat: Brasta.Seat; name: string; connected: boolean; occupied: boolean; }
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
  const SESSION_PREFIX = 'brasta-online-session:';
  const LAST_NAME_KEY = 'brasta-online-last-name';
  export function normalizeCode(code: string): string { return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); }
  export function rememberName(name: string): void { try { localStorage.setItem(LAST_NAME_KEY, name.trim()); } catch {} }
  export function lastName(): string { try { return localStorage.getItem(LAST_NAME_KEY) || ''; } catch { return ''; } }
  function sessionKey(code: string, role: SessionRole): string { return `${SESSION_PREFIX}${role}:${normalizeCode(code)}`; }
  function legacySessionKey(code: string): string { return SESSION_PREFIX + normalizeCode(code); }
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
    private reconnectDelay = 1000;
    private stopped = false;
    private resume: { code: string; name: string; token: string; role: SessionRole } | null = null;

    constructor(private handler: EventHandler) {}
    get isConnected(): boolean { return this.socket?.readyState === WebSocket.OPEN; }

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
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${protocol}//${location.host}/api/ws`);
        this.socket = ws;
        let settled = false;
        ws.onopen = () => {
          settled = true;
          this.reconnectDelay = 1000;
          this.handler({ type: 'status', status: 'connected' });
          this.startPing();
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
          if (!settled) { settled = true; reject(new Error('Could not connect to the Brasta server.')); }
        };
        ws.onclose = () => {
          this.stopPing();
          if (this.socket === ws) this.socket = null;
          this.handler({ type: 'status', status: 'disconnected' });
          if (!settled) { settled = true; reject(new Error('Connection closed before it was ready.')); }
          if (!this.stopped) this.scheduleReconnect();
        };
        ws.onmessage = (event) => {
          try { this.handleMessage(JSON.parse(String(event.data))); }
          catch { this.handler({ type: 'error', message: 'Received an unreadable message from the server.' }); }
        };
      });
    }

    private scheduleReconnect(): void {
      if (this.reconnectTimer != null || this.stopped) return;
      const delay = this.reconnectDelay;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 10000);
      this.reconnectTimer = window.setTimeout(() => {
        this.reconnectTimer = null;
        if (this.stopped) return;
        this.openSocket(true).catch(() => this.scheduleReconnect());
      }, delay);
    }

    private startPing(): void {
      this.stopPing();
      this.pingTimer = window.setInterval(() => {
        if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify({ type: 'PING' }));
      }, 20000);
    }
    private stopPing(): void { if (this.pingTimer != null) { clearInterval(this.pingTimer); this.pingTimer = null; } }

    private handleMessage(message: any): void {
      if (!message || typeof message.type !== 'string') return;
      if (message.type === 'SESSION') {
        const session = message.session as SessionInfo;
        saveSession(session);
        this.resume = { code: session.code, name: session.name, token: session.token, role: session.role };
        this.handler({ type: 'session', session });
      }
      else if (message.type === 'ROOM_STATE') this.handler({ type: 'room', update: message.update as RoomUpdate });
      else if (message.type === 'ERROR') this.handler({ type: 'error', message: String(message.message || 'Server rejected the request.') });
      else if (message.type === 'NOTICE') this.handler({ type: 'notice', message: String(message.message || '') });
    }

    private send(payload: object): void {
      if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
        this.handler({ type: 'error', message: 'Not connected to the Brasta server.' });
        return;
      }
      this.socket.send(JSON.stringify(payload));
    }

    async createRoom(name: string, mode: Brasta.Mode, targetScore: Brasta.TargetScore = 110): Promise<void> {
      this.resume = null;
      await this.connect();
      this.send({ type: 'CREATE_ROOM', name: name.trim(), mode, targetScore });
    }
    async joinRoom(code: string, name: string, token?: string): Promise<void> {
      const normalized = normalizeCode(code);
      this.resume = token ? { code: normalized, name: name.trim(), token, role: 'player' } : null;
      await this.connect();
      this.send({ type: 'JOIN_ROOM', code: normalized, name: name.trim(), token: token || undefined });
    }
    async spectateRoom(code: string, name: string, token?: string): Promise<void> {
      const normalized = normalizeCode(code);
      this.resume = token ? { code: normalized, name: name.trim(), token, role: 'spectator' } : null;
      await this.connect();
      this.send({ type: 'SPECTATE_ROOM', code: normalized, name: name.trim(), token: token || undefined });
    }
    startGame(): void { this.send({ type: 'START_GAME' }); }
    openingChoice(choice: 'keep' | 'put'): void { this.send({ type: 'OPENING_CHOICE', choice }); }
    command(command: Brasta.Command): void { this.send({ type: 'COMMAND', command }); }
    nextRound(): void { this.send({ type: 'NEXT_ROUND' }); }
    endMatch(): void { this.send({ type: 'END_MATCH' }); }
    leaveRoom(): void { this.resume = null; this.send({ type: 'LEAVE_ROOM' }); }
    close(): void {
      this.stopped = true;
      this.resume = null;
      this.stopPing();
      if (this.reconnectTimer != null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }
      this.socket?.close();
      this.socket = null;
    }
  }
}
