'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient } from '../../../lib/supabase-browser';

type Team = {
  id: string;
  name: string;
  status: 'pending' | 'confirmed' | 'withdrawn';
  seed: number | null;
  members: Array<{ id: string; username: string; role: 'captain' | 'partner'; accepted: boolean }>;
};

type AdminTournament = {
  tournament: {
    id: string;
    title: string;
    description: string;
    mode: '1v1' | '2v2';
    startsAt: string;
    registrationClosesAt: string;
    maxTeams: number;
    confirmedTeams: number;
    status: string;
    bracketPublished: boolean;
    championTeamId: string | null;
  };
  teams: Team[];
  matches: Array<{
    id: string;
    roundLabel: string;
    matchNumber: number;
    team1Id: string | null;
    team2Id: string | null;
    winnerTeamId: string | null;
    roomCode: string | null;
    status: string;
  }>;
};

function inputDate(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function entrantName(team: Team | undefined, individual: boolean): string {
  if (!team) return 'TBD';
  return individual ? `@${team.members[0]?.username || team.name}` : team.name;
}

function initialStart() {
  const date = new Date(Date.now() + 24 * 60 * 60_000);
  date.setMinutes(Math.ceil(date.getMinutes() / 15) * 15, 0, 0);
  return inputDate(date);
}

function TournamentScheduleEditor({
  tournament,
  busy,
  onSave,
}: {
  tournament: AdminTournament['tournament'];
  busy: boolean;
  onSave: (updates: Record<string, unknown>) => void;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    onSave({
      title: String(data.get('title') || ''),
      description: String(data.get('description') || ''),
      startsAt: new Date(String(data.get('startsAt') || '')).toISOString(),
      registrationClosesAt: new Date(String(data.get('registrationClosesAt') || '')).toISOString(),
      maxTeams: Number(data.get('maxTeams') || tournament.maxTeams),
    });
  }

  return (
    <details className="tournament-admin-editor">
      <summary>Edit schedule & details</summary>
      <form onSubmit={submit}>
        <label>Title<input name="title" defaultValue={tournament.title} minLength={3} maxLength={80} required /></label>
        <label className="wide">Description<textarea name="description" defaultValue={tournament.description} maxLength={500} /></label>
        <label>Start date & time<input name="startsAt" type="datetime-local" defaultValue={inputDate(tournament.startsAt)} required /></label>
        <label>Registration closes<input name="registrationClosesAt" type="datetime-local" defaultValue={inputDate(tournament.registrationClosesAt)} required /></label>
        <label>{tournament.mode === '1v1' ? 'Player' : 'Team'} limit<input name="maxTeams" type="number" min={Math.max(2, tournament.confirmedTeams)} max={12} defaultValue={tournament.maxTeams} required /></label>
        <button type="submit" disabled={busy}>Save Changes</button>
      </form>
    </details>
  );
}

export default function TournamentAdminClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [accessToken, setAccessToken] = useState('');
  const [tournaments, setTournaments] = useState<AdminTournament[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState<'1v1' | '2v2'>('2v2');
  const [title, setTitle] = useState('Brasta 2v2 Tournament');
  const [description, setDescription] = useState('Team up, register in advance, and battle through a single-elimination Brasta bracket.');
  const [startsAt, setStartsAt] = useState(initialStart);
  const [registrationClosesAt, setRegistrationClosesAt] = useState(() => inputDate(new Date(new Date(initialStart()).getTime() - 15 * 60_000)));
  const [maxTeams, setMaxTeams] = useState(12);

  const api = useCallback(async (action: string, extra: Record<string, unknown> = {}, token = accessToken) => {
    if (!token) throw new Error('Sign in to Brasta first.');
    const response = await fetch('/api/admin/tournaments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...extra }),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(String(data.error || 'Tournament admin request failed.'));
    return data as { tournaments: AdminTournament[]; state?: string };
  }, [accessToken]);

  const load = useCallback(async (token: string) => {
    try {
      const data = await api('list', {}, token);
      setTournaments(data.tournaments || []);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load tournaments.');
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
        setMessage('Sign in to Brasta first, then return to this page.');
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

  async function mutate(action: string, extra: Record<string, unknown>, success: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await api(action, extra);
      setTournaments(data.tournaments || []);
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament admin action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    await mutate('create', {
      mode,
      title,
      description,
      startsAt: new Date(startsAt).toISOString(),
      registrationClosesAt: new Date(registrationClosesAt).toISOString(),
      maxTeams,
    }, 'Tournament created and registration banner published.');
  }

  return (
    <main className="tournament-admin-shell">
      <header className="tournament-admin-header">
        <div><span>BRASTA ADMIN</span><h1>Tournaments</h1><p>Schedule 1v1 or 2v2 events, manage registration, publish brackets, and advance winners.</p></div>
        <nav><a href="/admin/moderation">Moderation</a><a href="/admin/live">Live Traffic</a><a href="/">Back to Brasta</a></nav>
      </header>

      {message && <div className="tournament-admin-message">{message}</div>}

      <section className="tournament-admin-card">
        <div className="tournament-admin-card-head"><div><span>NEW EVENT</span><h2>Schedule a Tournament</h2></div><b>12 {mode === '1v1' ? 'players' : 'teams'} maximum</b></div>
        <form className="tournament-admin-form" onSubmit={create}>
          <label>Mode<select value={mode} onChange={(event) => {
            const nextMode = event.target.value as '1v1' | '2v2';
            setMode(nextMode);
            setTitle(`Brasta ${nextMode} Tournament`);
            setDescription(nextMode === '1v1'
              ? 'Register in advance and battle through a single-elimination Brasta bracket.'
              : 'Team up, register in advance, and battle through a single-elimination Brasta bracket.');
          }}><option value="1v1">1v1 · Individual</option><option value="2v2">2v2 · Teams</option></select></label>
          <label>Title<input value={title} minLength={3} maxLength={80} required onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="wide">Description<textarea value={description} maxLength={500} onChange={(event) => setDescription(event.target.value)} /></label>
          <label>Start date & time<input type="datetime-local" value={startsAt} required onChange={(event) => {
            setStartsAt(event.target.value);
            setRegistrationClosesAt(inputDate(new Date(new Date(event.target.value).getTime() - 15 * 60_000)));
          }} /></label>
          <label>Registration closes<input type="datetime-local" value={registrationClosesAt} required onChange={(event) => setRegistrationClosesAt(event.target.value)} /></label>
          <label>{mode === '1v1' ? 'Player' : 'Team'} limit<input type="number" min={2} max={12} value={maxTeams} required onChange={(event) => setMaxTeams(Number(event.target.value))} /></label>
          <button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create & Open Registration'}</button>
        </form>
      </section>

      {loading && <section className="tournament-admin-card">Loading tournaments…</section>}

      {tournaments.map((entry) => {
        const tournament = entry.tournament;
        const individual = tournament.mode === '1v1';
        const teamMap = new Map(entry.teams.map((team) => [team.id, team]));
        return (
          <section className="tournament-admin-card event" key={tournament.id}>
            <div className="tournament-admin-event-head">
              <div><span>{tournament.status.toUpperCase()} · {tournament.mode.toUpperCase()}</span><h2>{tournament.title}</h2><p>{formatDate(tournament.startsAt)} · registration closes {formatDate(tournament.registrationClosesAt)}</p></div>
              <div><b>{tournament.confirmedTeams}/{tournament.maxTeams}</b><small>confirmed {individual ? 'players' : 'teams'}</small></div>
            </div>

            <div className="tournament-admin-actions">
              {!tournament.bracketPublished && tournament.confirmedTeams >= 2 && tournament.status !== 'canceled' && (
                <button type="button" disabled={busy} onClick={() => void mutate('publish', { tournamentId: tournament.id }, 'Bracket published.')}>Publish Bracket</button>
              )}
              {tournament.status !== 'canceled' && tournament.status !== 'completed' && (
                <button className="danger" type="button" disabled={busy} onClick={() => void mutate('update', { tournamentId: tournament.id, status: 'canceled' }, 'Tournament canceled.')}>Cancel Tournament</button>
              )}
            </div>

            {tournament.status !== 'canceled' && tournament.status !== 'completed' && (
              <TournamentScheduleEditor
                tournament={tournament}
                busy={busy}
                onSave={(updates) => void mutate('update', { tournamentId: tournament.id, ...updates }, 'Tournament schedule updated and registered players notified.')}
              />
            )}

            <div className="tournament-admin-teams">
              <h3>{individual ? 'Players' : 'Teams'}</h3>
              {entry.teams.length === 0 ? <p>{individual ? 'No players registered yet.' : 'No team invitations yet.'}</p> : entry.teams.map((team) => (
                <article key={team.id} className={team.status}>
                  <b>{team.seed ? `#${team.seed} ` : ''}{individual ? `@${team.members[0]?.username || team.name}` : team.name}</b>
                  {!individual && <span>{team.members.map((member) => `@${member.username}${member.accepted ? '' : ' (pending)'}`).join(' + ')}</span>}
                  <small>{team.status}</small>
                </article>
              ))}
            </div>

            {entry.matches.length > 0 && (
              <div className="tournament-admin-matches">
                <h3>Bracket Results</h3>
                {entry.matches.map((match) => {
                  const team1 = teamMap.get(match.team1Id || '');
                  const team2 = teamMap.get(match.team2Id || '');
                  return (
                    <article key={match.id}>
                      <div><small>{match.roundLabel} · Match {match.matchNumber}</small><b>{entrantName(team1, individual)} vs {entrantName(team2, individual)}</b><span>{match.status}{match.roomCode ? ` · Room ${match.roomCode}` : ''}</span></div>
                      {match.status !== 'completed' && team1 && team2 && (
                        <div className="winner-buttons">
                          <button type="button" disabled={busy} onClick={() => void mutate('winner', { matchId: match.id, winnerTeamId: team1.id }, `${entrantName(team1, individual)} advanced.`)}>{entrantName(team1, individual)} won</button>
                          <button type="button" disabled={busy} onClick={() => void mutate('winner', { matchId: match.id, winnerTeamId: team2.id }, `${entrantName(team2, individual)} advanced.`)}>{entrantName(team2, individual)} won</button>
                        </div>
                      )}
                      {match.winnerTeamId && <strong>Winner: {entrantName(teamMap.get(match.winnerTeamId), individual)}</strong>}
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </main>
  );
}
