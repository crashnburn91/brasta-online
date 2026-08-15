import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions';
import { handleMessage, registerSocket, unregisterSocket } from '../../../lib/brasta-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return experimental_upgradeWebSocket((ws) => {
    let connPromise = registerSocket(ws);
    ws.on('message', (data: WebSocketData) => {
      const raw = String(data);

      // Heartbeat acknowledgement must not depend on Redis latency or room-lock
      // contention. Reply immediately at the socket edge, then let the normal
      // handler update presence asynchronously. A second PONG from the normal
      // handler is harmless and keeps backwards compatibility with older clients.
      try {
        const msg = JSON.parse(raw);
        if (msg?.type === 'PING') ws.send(JSON.stringify({ type: 'PONG' }));
      } catch {}

      void connPromise.then((conn) => handleMessage(conn, raw));
    });
    ws.on('close', () => {
      void connPromise.then((conn) => unregisterSocket(conn));
    });
    ws.on('error', () => {
      void connPromise.then((conn) => unregisterSocket(conn));
    });
  });
}
