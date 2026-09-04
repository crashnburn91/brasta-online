'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type PublicProfile = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
};

type ModerationReport = {
  id: string;
  messageId: string | null;
  roomId: string;
  reason: string;
  details: string | null;
  messageSnapshot: string;
  status: 'open' | 'reviewing' | 'resolved' | 'dismissed';
  resolutionNote: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  reporter: PublicProfile;
  reportedUser: PublicProfile;
  moderator: PublicProfile | null;
};

type ModerationAction = {
  id: string;
  targetUser: PublicProfile;
  moderator: PublicProfile | null;
  relatedReportId: string | null;
  actionType: 'warning' | 'mute' | 'suspension' | 'ban' | 'reversal';
  reason: string;
  startsAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type ModerationSnapshot = { reports: ModerationReport[]; actions: ModerationAction[] };

function formatDate(value: string | null): string {
  if (!value) return 'No expiration';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function ProfileLabel({ profile }: { profile: PublicProfile }) {
  return (
    <span className="moderation-profile">
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <i>{profile.username.slice(0, 1).toUpperCase()}</i>}
      <span><b>@{profile.username}</b>{profile.displayName ? <small>{profile.displayName}</small> : null}</span>
    </span>
  );
}

function EnforcementForm({
  report,
  busy,
  onEnforce,
}: {
  report: ModerationReport;
  busy: boolean;
  onEnforce: (values: { actionType: string; durationHours: number; reason: string }) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onEnforce({
      actionType: String(data.get('actionType') || 'warning'),
      durationHours: Number(data.get('durationHours') || 0),
      reason: String(data.get('reason') || ''),
    });
  }

  return (
    <details className="moderation-enforcement">
      <summary>Take enforcement action</summary>
      <form onSubmit={submit}>
        <label>Action<select name="actionType" defaultValue="mute"><option value="warning">Warning only</option><option value="mute">Mute</option><option value="suspension">Chat suspension</option><option value="ban">Permanent chat ban</option></select></label>
        <label>Duration<select name="durationHours" defaultValue="24"><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option><option value="720">30 days</option><option value="0">No expiration</option></select></label>
        <label className="wide">Reason<textarea name="reason" defaultValue={`Report: ${report.reason}. ${report.details || ''}`.trim()} minLength={3} maxLength={1000} required /></label>
        <button type="submit" disabled={busy}>Apply &amp; Resolve Report</button>
      </form>
    </details>
  );
}

export default function ModerationAdminClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState('');
  const [snapshot, setSnapshot] = useState<ModerationSnapshot>({ reports: [], actions: [] });
  const [filter, setFilter] = useState<'active' | 'all'>('active');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [message, setMessage] = useState('');

  const api = useCallback(async (action: string, extra: Record<string, unknown> = {}, token = accessToken) => {
    if (!token) throw new Error('Sign in to Brasta first.');
    const response = await fetch('/api/admin/moderation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({})) as Partial<ModerationSnapshot> & { error?: string; state?: string };
    if (!response.ok || data.error) throw new Error(data.error || 'Moderation request failed.');
    return { reports: data.reports || [], actions: data.actions || [] };
  }, [accessToken]);

  const load = useCallback(async (token: string) => {
    try {
      setSnapshot(await api('list', {}, token));
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load moderation reports.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    if (!supabase) {
      setMessage('Brasta authentication is not configured.');
      setLoading(false);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      const token = data.session?.access_token || '';
      setAccessToken(token);
      if (token) void load(token);
      else {
        setMessage('Sign in to an authorized Brasta admin account, then return here.');
        setLoading(false);
      }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      const token = session?.access_token || '';
      setAccessToken(token);
      if (token) void load(token);
    });
    return () => {
      alive = false;
      listener.subscription.unsubscribe();
    };
  }, [load, supabase]);

  async function mutate(key: string, action: string, extra: Record<string, unknown>, success: string) {
    if (busyId) return;
    setBusyId(key);
    setMessage('');
    try {
      setSnapshot(await api(action, extra));
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Moderation action failed.');
    } finally {
      setBusyId('');
    }
  }

  const reports = filter === 'active'
    ? snapshot.reports.filter((report) => report.status === 'open' || report.status === 'reviewing')
    : snapshot.reports;
  const activeActions = snapshot.actions.filter((action) => !action.revokedAt && (!action.expiresAt || new Date(action.expiresAt).getTime() > Date.now()));

  return (
    <main className="moderation-admin-shell">
      <header className="moderation-admin-header">
        <div><span>BRASTA ADMIN</span><h1>Chat Moderation</h1><p>Review user reports, remove unsafe messages, and apply documented enforcement actions.</p></div>
        <nav><a href="/admin/live">Live Traffic</a><a href="/admin/tournaments">Tournaments</a><a href="/">Back to Brasta</a></nav>
      </header>

      {message ? <div className="moderation-admin-message" role="status">{message}</div> : null}

      <section className="moderation-summary" aria-label="Moderation summary">
        <article><span>OPEN REPORTS</span><b>{snapshot.reports.filter((report) => report.status === 'open').length}</b></article>
        <article><span>IN REVIEW</span><b>{snapshot.reports.filter((report) => report.status === 'reviewing').length}</b></article>
        <article><span>ACTIVE ACTIONS</span><b>{activeActions.length}</b></article>
      </section>

      <section className="moderation-admin-card">
        <div className="moderation-card-head"><div><span>REPORT QUEUE</span><h2>User Reports</h2></div><div className="moderation-filter"><button type="button" className={filter === 'active' ? 'active' : ''} onClick={() => setFilter('active')}>Needs Review</button><button type="button" className={filter === 'all' ? 'active' : ''} onClick={() => setFilter('all')}>All Reports</button></div></div>
        {loading ? <p className="moderation-empty">Loading moderation queue…</p> : null}
        {!loading && reports.length === 0 ? <p className="moderation-empty">No reports in this view.</p> : null}
        <div className="moderation-report-list">
          {reports.map((report) => (
            <article className={`moderation-report status-${report.status}`} key={report.id}>
              <header><div><span>{report.status.toUpperCase()} · {report.reason.replace(/_/g, ' ').toUpperCase()}</span><b>{formatDate(report.createdAt)}</b></div><small>Room {report.roomId.replace(/^room:/, '').replace(/:\d+$/, '')}</small></header>
              <blockquote>{report.messageSnapshot}</blockquote>
              {report.details ? <p className="moderation-details"><b>Reporter context:</b> {report.details}</p> : null}
              <div className="moderation-people"><div><small>REPORTED USER</small><ProfileLabel profile={report.reportedUser} /></div><div><small>REPORTED BY</small><ProfileLabel profile={report.reporter} /></div></div>
              {report.resolutionNote ? <p className="moderation-resolution"><b>Resolution:</b> {report.resolutionNote}</p> : null}
              <div className="moderation-report-actions">
                {report.status === 'open' ? <button type="button" disabled={Boolean(busyId)} onClick={() => void mutate(report.id, 'report', { reportId: report.id, status: 'reviewing' }, 'Report marked as reviewing.')}>Start Review</button> : null}
                {report.messageId ? <button type="button" className="danger" disabled={Boolean(busyId)} onClick={() => void mutate(report.id, 'remove-message', { messageId: report.messageId, roomId: report.roomId, reason: 'Removed after moderator review.' }, 'Message removed from chat.')}>Remove Message</button> : null}
                {(report.status === 'open' || report.status === 'reviewing') ? <button type="button" className="quiet" disabled={Boolean(busyId)} onClick={() => void mutate(report.id, 'report', { reportId: report.id, status: 'dismissed', resolutionNote: 'Reviewed; no violation found.' }, 'Report dismissed.')}>Dismiss</button> : null}
              </div>
              {(report.status === 'open' || report.status === 'reviewing') ? (
                <EnforcementForm report={report} busy={Boolean(busyId)} onEnforce={(values) => void mutate(report.id, 'enforce', {
                  reportId: report.id,
                  targetUserId: report.reportedUser.id,
                  ...values,
                }, 'Enforcement action applied and report resolved.')} />
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="moderation-admin-card">
        <div className="moderation-card-head"><div><span>AUDIT LOG</span><h2>Enforcement Actions</h2></div><b>{snapshot.actions.length} recorded</b></div>
        {snapshot.actions.length === 0 ? <p className="moderation-empty">No enforcement actions recorded.</p> : null}
        <div className="moderation-action-list">
          {snapshot.actions.map((action) => {
            const active = !action.revokedAt && (!action.expiresAt || new Date(action.expiresAt).getTime() > Date.now());
            return (
              <article key={action.id}>
                <div><span>{action.actionType.toUpperCase()} · {active ? 'ACTIVE' : action.revokedAt ? 'REVOKED' : 'EXPIRED'}</span><ProfileLabel profile={action.targetUser} /></div>
                <p>{action.reason}</p>
                <small>Started {formatDate(action.startsAt)} · {action.expiresAt ? `expires ${formatDate(action.expiresAt)}` : 'no expiration'}</small>
                {active && action.actionType !== 'warning' ? <button type="button" disabled={Boolean(busyId)} onClick={() => void mutate(action.id, 'revoke', { actionId: action.id }, 'Moderation action revoked.')}>Revoke</button> : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
