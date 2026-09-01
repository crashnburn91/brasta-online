import { brastaAdminConfigured, isBrastaAdmin } from '../../../../lib/admin-auth';
import {
  createModerationAction,
  listModerationQueue,
  removeModeratedMessage,
  revokeModerationAction,
  updateModerationReport,
} from '../../../../lib/chat-moderation';
import { removeChatMessageFromRuntime } from '../../../../lib/brasta-server';
import { verifyBrastaAccessToken } from '../../../../lib/supabase-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokenFrom(request: Request): string {
  return (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
}

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  try {
    const token = tokenFrom(request);
    if (!token) return json({ error: 'Sign in to use moderation tools.' }, 401);
    const identity = await verifyBrastaAccessToken(token);
    if (!identity?.userId) return json({ error: 'Your Brasta session has expired.' }, 401);
    if (!brastaAdminConfigured()) return json({ error: 'Brasta admin access is not configured.' }, 503);
    if (!isBrastaAdmin(identity)) return json({ error: 'This Brasta account is not authorized to moderate chat.' }, 403);

    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || 'list');

    if (action === 'list') return json(await listModerationQueue());

    if (action === 'report') {
      const status = String(body.status || 'reviewing');
      if (!['open', 'reviewing', 'resolved', 'dismissed'].includes(status)) return json({ error: 'Choose a valid report status.' }, 400);
      await updateModerationReport({
        reportId: String(body.reportId || ''),
        moderatorId: identity.userId,
        status: status as 'open' | 'reviewing' | 'resolved' | 'dismissed',
        resolutionNote: body.resolutionNote,
      });
      return json({ state: 'report-updated', ...(await listModerationQueue()) });
    }

    if (action === 'enforce') {
      const actionType = String(body.actionType || 'warning');
      if (!['warning', 'mute', 'suspension', 'ban'].includes(actionType)) return json({ error: 'Choose a valid moderation action.' }, 400);
      const durationHours = Math.max(0, Math.min(Number(body.durationHours || 0), 24 * 365));
      const expiresAt = actionType === 'warning' || actionType === 'ban' || !durationHours
        ? null
        : new Date(Date.now() + durationHours * 60 * 60_000).toISOString();
      await createModerationAction({
        targetUserId: String(body.targetUserId || ''),
        moderatorId: identity.userId,
        relatedReportId: String(body.reportId || '') || null,
        actionType: actionType as 'warning' | 'mute' | 'suspension' | 'ban',
        reason: body.reason,
        expiresAt,
      });
      if (body.reportId) {
        await updateModerationReport({
          reportId: String(body.reportId),
          moderatorId: identity.userId,
          status: 'resolved',
          resolutionNote: body.reason,
        });
      }
      return json({ state: 'action-created', ...(await listModerationQueue()) });
    }

    if (action === 'revoke') {
      await revokeModerationAction(String(body.actionId || ''));
      return json({ state: 'action-revoked', ...(await listModerationQueue()) });
    }

    if (action === 'remove-message') {
      const messageId = String(body.messageId || '');
      const roomId = String(body.roomId || '');
      await removeModeratedMessage(messageId, body.reason);
      await removeChatMessageFromRuntime(roomId, messageId);
      return json({ state: 'message-removed', ...(await listModerationQueue()) });
    }

    return json({ error: 'Unsupported moderation action.' }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Moderation request failed.';
    const status = /expired|sign in/i.test(message) ? 401
      : /not authorized/i.test(message) ? 403
      : /not configured|backend/i.test(message) ? 503
      : 400;
    console.error('[brasta moderation admin]', error);
    return json({ error: message.replace(/^Could not [^:]+:\s*/i, '') }, status);
  }
}
