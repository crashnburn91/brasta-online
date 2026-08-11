import { experimental_upgradeWebSocket, type WebSocketData } from '@vercel/functions';
import { handleMessage, registerSocket, unregisterSocket } from '../../../lib/brasta-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return experimental_upgradeWebSocket((ws) => {
    let connPromise = registerSocket(ws);
    ws.on('message', (data: WebSocketData) => {
      void connPromise.then((conn) => handleMessage(conn, String(data)));
    });
    ws.on('close', () => {
      void connPromise.then((conn) => unregisterSocket(conn));
    });
    ws.on('error', () => {
      void connPromise.then((conn) => unregisterSocket(conn));
    });
  });
}
