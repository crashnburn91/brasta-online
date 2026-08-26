import http from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import {
  handleMessage,
  health,
  registerSocket,
  unregisterSocket,
  type Connection,
  type WireSocket,
} from '../lib/brasta-server';

const host = process.env.HOST || '0.0.0.0';
const port = Number(process.env.PORT || 3001);
const configuredPath = normalizePath(process.env.BRASTA_WS_PATH || '/ws');
const websocketPaths = new Set([configuredPath, '/api/ws']);
const requireRedis = process.env.BRASTA_REQUIRE_REDIS !== 'false';

function normalizePath(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '/ws';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function requestPath(url: string | undefined): string {
  try {
    return new URL(url || '/', 'http://localhost').pathname;
  } catch {
    return '/';
  }
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

if (requireRedis && !process.env.REDIS_URL) {
  console.error('[brasta realtime] REDIS_URL is required. Set BRASTA_REQUIRE_REDIS=false only for local development.');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const path = requestPath(req.url);

  if (req.method === 'GET' && path === '/health') {
    try {
      const status = await health();
      const ready = requireRedis ? status.redisConfigured && status.redisOk : true;
      json(res, ready ? 200 : 503, {
        service: 'brasta-realtime',
        ready,
        redisConfigured: status.redisConfigured,
        redisOk: status.redisOk,
        connections: status.localConnections,
        uptimeSeconds: Math.round(process.uptime()),
      });
    } catch (error) {
      json(res, 503, {
        service: 'brasta-realtime',
        ready: false,
        error: error instanceof Error ? error.message : 'Health check failed.',
      });
    }
    return;
  }

  if (req.method === 'GET' && path === '/') {
    json(res, 200, {
      service: 'brasta-realtime',
      status: 'running',
      websocketPath: configuredPath,
      healthPath: '/health',
    });
    return;
  }

  json(res, 404, { error: 'Not found.' });
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

server.on('upgrade', (req, socket, head) => {
  const path = requestPath(req.url);
  if (!websocketPaths.has(path)) {
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
    return;
  }

  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit('connection', ws, req);
  });
});

wss.on('connection', async (ws: WebSocket) => {
  let conn: Connection | null = null;
  let cleanedUp = false;

  const cleanup = () => {
    if (cleanedUp || !conn) return;
    cleanedUp = true;
    void unregisterSocket(conn).catch((error) => {
      console.error('[brasta realtime] socket cleanup failed', error);
    });
  };

  try {
    conn = await registerSocket(ws as unknown as WireSocket);
  } catch (error) {
    console.error('[brasta realtime] socket registration failed', error);
    try { ws.close(1011, 'Server initialization failed'); } catch {}
    return;
  }

  ws.on('message', (data) => {
    if (!conn) return;
    void handleMessage(conn, String(data)).catch((error) => {
      console.error('[brasta realtime] message handler failed', error);
    });
  });
  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(port, host, () => {
  console.log(`[brasta realtime] listening on http://${host}:${port}`);
  console.log(`[brasta realtime] websocket paths: ${[...websocketPaths].join(', ')}`);
  console.log(`[brasta realtime] Redis required: ${requireRedis ? 'yes' : 'no'}`);
});

let shuttingDown = false;
function shutdown(signal: string): void {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[brasta realtime] ${signal} received; draining connections`);

  for (const client of wss.clients) {
    try { client.close(1012, 'Server restarting'); } catch {}
  }

  server.close(() => process.exit(0));
  const timer = setTimeout(() => process.exit(1), 10_000);
  timer.unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
