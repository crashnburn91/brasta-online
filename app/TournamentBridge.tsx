'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

type Team = {
  id: string;
  name: string;
  status: 'pending' | 'confirmed' | 'withdrawn';
  seed: number | null;
  confirmedAt: string | null;
  members: Array<{
    id: string;
    username: string;
    displayName: string | null;
    avatarUrl: string | null;
    role: 'captain' | 'partner';
    accepted: boolean;
  }>;
};

type Snapshot = {
  tournament: {
    id: string;
    title: string;
    description: string;
    startsAt: string;
    registrationOpensAt: string;
    registrationClosesAt: string;
    maxTeams: number;
    confirmedTeams: number;
    spotsRemaining: number;
    status: 'draft' | 'registration' | 'bracket' | 'active' | 'completed' | 'canceled';
    bracketPublished: boolean;
    championTeamId: string | null;
  } | null;
  teams: Team[];
  matches: Array<{
    id: string;
    roundNumber: number;
    roundLabel: string;
    matchNumber: number;
    team1Id: string | null;
    team2Id: string | null;
    winnerTeamId: string | null;
    roomCode: string | null;
    status: 'pending' | 'ready' | 'active' | 'completed' | 'bye';
  }>;
  myTeam: Team | null;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  }>;
};

const EMPTY: Snapshot = { tournament: null, teams: [], matches: [], myTeam: null, notifications: [] };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

function countdown(value: string, now: number): string {
  const difference = new Date(value).getTime() - now;
  if (difference <= 0) return 'Starting now';
  const totalMinutes = Math.ceil(difference / 60_000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function teamLabel(team: Team | undefined): string {
  if (!team) return 'TBD';
  return team.seed ? `${team.seed}. ${team.name}` : team.name;
}

function avatar(member: Team['members'][number]) {
  if (member.avatarUrl) return <img src={member.avatarUrl} alt="" referrerPolicy="no-referrer" />;
  return <span>{member.username.slice(0, 1).toUpperCase()}</span>;
}

export default function TournamentBridge({ accessToken, userId }: { accessToken: string; userId: string }) {
  const [snapshot, setSnapshot] = useState<Snapshot>(EMPTY);
  const [homeTarget, setHomeTarget] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [teamName, setTeamName] = useState('');
  const [partnerUsername, setPartnerUsername] = useState('');
  const [now, setNow] = useState(Date.now());

  const api = useCallback(async (action?: string, extra: Record<string, unknown> = {}) => {
    const response = await fetch('/api/tournaments', {
      method: action ? 'POST' : 'GET',
      headers: {
        ...(action ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(action ? { body: JSON.stringify({ action, ...extra }) } : {}),
      cache: 'no-store',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) throw new Error(String(data.error || 'Could not load tournament.'));
    return data as Snapshot & { state?: string };
  }, [accessToken]);

  const refresh = useCallback(async (silent = true) => {
    try {
      const data = await api();
      setSnapshot(data);
      if (!silent) setMessage('');
    } catch (error) {
      if (!silent) setMessage(error instanceof Error ? error.message : 'Could not load tournament.');
    }
  }, [api]);

  useEffect(() => {
    void refresh(true);
    const timer = window.setInterval(() => void refresh(true), 30_000);
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      window.clearInterval(clock);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    const find = () => setHomeTarget(document.querySelector('.landing.landing-wide .landing-grid'));
    find();
    const observer = new MutationObserver(find);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const tournament = snapshot.tournament;
    if (!tournament || !snapshot.myTeam || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    const difference = new Date(tournament.startsAt).getTime() - Date.now();
    if (difference <= 0 || difference > 2_147_000_000) return;
    const key = `brasta-tournament-start-notified:${tournament.id}:${tournament.startsAt}`;
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(key)) return;
        new Notification(`${tournament.title} is starting`, { body: 'Open Brasta to view your matchup and bracket.' });
        localStorage.setItem(key, '1');
      } catch {}
    }, difference);
    return () => window.clearTimeout(timer);
  }, [snapshot.myTeam, snapshot.tournament]);

  const tournament = snapshot.tournament;
  const myTeam = snapshot.myTeam;
  const unread = snapshot.notifications.filter((item) => !item.readAt).length;
  const teamsById = useMemo(() => new Map(snapshot.teams.map((team) => [team.id, team])), [snapshot.teams]);
  const rounds = useMemo(() => {
    const labels = [...new Set(snapshot.matches.map((match) => match.roundLabel))];
    return labels.map((label) => ({ label, matches: snapshot.matches.filter((match) => match.roundLabel === label) }));
  }, [snapshot.matches]);

  async function mutate(action: string, extra: Record<string, unknown>, success?: string) {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      const data = await api(action, extra);
      setSnapshot(data);
      if (success) setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Tournament action failed.');
    } finally {
      setBusy(false);
    }
  }

  async function register(event: FormEvent) {
    event.preventDefault();
    if (!tournament) return;
    await mutate('register', {
      tournamentId: tournament.id,
      teamName,
      partnerUsername: partnerUsername.replace(/^@/, ''),
    }, `Invitation sent to @${partnerUsername.replace(/^@/, '')}.`);
    setTeamName('');
    setPartnerUsername('');
  }

  async function enableNotifications() {
    if (typeof Notification === 'undefined') {
      setMessage('Browser notifications are not supported on this device. Your in-app tournament alerts will still appear here.');
      return;
    }
    const permission = await Notification.requestPermission();
    setMessage(permission === 'granted'
      ? 'Tournament browser alert enabled for this device.'
      : 'Browser alerts were not enabled. Your in-app tournament alerts will still appear here.');
  }

  function openTournament() {
    setOpen(true);
    if (unread && accessToken) void mutate('mark-read', {});
  }

  const homeBanner = tournament && homeTarget ? createPortal(
    <section className="tournament-home-banner" aria-label="Upcoming Brasta tournament">
      <div className="tournament-banner-mark" aria-hidden="true">♠<b>2v2</b>♥</div>
      <div className="tournament-banner-copy">
        <span className="tournament-kicker">UPCOMING TOURNAMENT</span>
        <h2>{tournament.title}</h2>
        <p>{formatDate(tournament.startsAt)} · {tournament.confirmedTeams}/{tournament.maxTeams} teams registered</p>
      </div>
      <div className="tournament-banner-countdown">
        <small>{tournament.status === 'active' ? 'LIVE NOW' : 'STARTS IN'}</small>
        <strong>{tournament.status === 'active' ? 'LIVE' : countdown(tournament.startsAt, now)}</strong>
      </div>
      <button type="button" onClick={openTournament}>
        {myTeam ? 'View My Team' : tournament.spotsRemaining > 0 && tournament.status === 'registration' ? 'Register Team' : 'View Bracket'}
      </button>
    </section>,
    homeTarget,
  ) : null;

  const modal = open && tournament ? createPortal(
    <div className="tournament-modal-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) setOpen(false);
    }}>
      <section className="tournament-modal" role="dialog" aria-modal="true" aria-label={tournament.title}>
        <button className="tournament-close" type="button" onClick={() => setOpen(false)} aria-label="Close">×</button>
        <header className="tournament-modal-header">
          <span className="tournament-kicker">BRASTA 2v2 TOURNAMENT</span>
          <h2>{tournament.title}</h2>
          {tournament.description && <p>{tournament.description}</p>}
          <div className="tournament-schedule">
            <span><small>START TIME</small><b>{formatDate(tournament.startsAt)}</b></span>
            <span><small>COUNTDOWN</small><b>{tournament.status === 'active' ? 'Live now' : countdown(tournament.startsAt, now)}</b></span>
            <span><small>TEAMS</small><b>{tournament.confirmedTeams} / {tournament.maxTeams}</b></span>
          </div>
        </header>

        {message && <div className="tournament-message">{message}</div>}

        {myTeam ? (
          <section className={`tournament-my-team ${myTeam.status}`}>
            <div>
              <span className="tournament-kicker">YOUR TEAM</span>
              <h3>{myTeam.name}</h3>
            </div>
            <div className="tournament-member-list">
              {myTeam.members.map((member) => (
                <div key={member.id}>
                  <i>{avatar(member)}</i>
                  <span><b>@{member.username}</b><small>{member.role} · {member.accepted ? 'confirmed' : 'awaiting response'}</small></span>
                </div>
              ))}
            </div>
            {myTeam.status === 'pending' && myTeam.members.some((member) => member.role === 'partner' && !member.accepted && member.id === userId) && (
              <div className="tournament-team-actions">
                <button className="primary" type="button" disabled={busy} onClick={() => void mutate('accept', { teamId: myTeam.id }, 'Team registration confirmed.')}>Accept Invitation</button>
                <button type="button" disabled={busy} onClick={() => void mutate('decline', { teamId: myTeam.id })}>Decline</button>
              </div>
            )}
            {myTeam.status === 'pending' && myTeam.members.some((member) => member.role === 'captain' && member.id === userId) && (
              <button className="tournament-withdraw" type="button" disabled={busy} onClick={() => void mutate('withdraw', { teamId: myTeam.id })}>Cancel team invitation</button>
            )}
            {myTeam.status === 'confirmed' && typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
              <button className="tournament-notify-button" type="button" onClick={() => void enableNotifications()}>Enable start-time alert on this device</button>
            )}
          </section>
        ) : tournament.status === 'registration' && tournament.spotsRemaining > 0 ? (
          <form className="tournament-registration" onSubmit={register}>
            <div>
              <span className="tournament-kicker">TEAM REGISTRATION</span>
              <h3>Register your 2v2 team</h3>
              <p>Your teammate must have a Brasta account and accept the invitation before your team takes a bracket slot.</p>
            </div>
            {!accessToken ? (
              <div className="tournament-signin-note">Sign in to Brasta, then reopen tournament registration.</div>
            ) : (
              <>
                <label>Team name<input value={teamName} minLength={2} maxLength={32} required onChange={(event) => setTeamName(event.target.value)} placeholder="The Sweepers" /></label>
                <label>Teammate username<input value={partnerUsername} minLength={3} maxLength={21} required onChange={(event) => setPartnerUsername(event.target.value)} placeholder="@username" autoCapitalize="none" /></label>
                <button className="primary" type="submit" disabled={busy}>{busy ? 'Sending invitation…' : 'Invite Teammate'}</button>
              </>
            )}
          </form>
        ) : (
          <div className="tournament-registration-closed">Registration is closed. You can still follow the bracket below.</div>
        )}

        {snapshot.notifications.length > 0 && (
          <section className="tournament-notifications">
            <h3>Tournament Updates</h3>
            {snapshot.notifications.slice(0, 5).map((notification) => (
              <article key={notification.id} className={notification.readAt ? '' : 'unread'}>
                <b>{notification.title}</b>
                <p>{notification.body}</p>
                <small>{formatDate(notification.createdAt)}</small>
              </article>
            ))}
          </section>
        )}

        <section className="tournament-bracket-section">
          <div className="tournament-section-heading">
            <div><span className="tournament-kicker">SINGLE ELIMINATION</span><h3>Tournament Bracket</h3></div>
            {!tournament.bracketPublished && <p>Bracket will be published when registration closes.</p>}
          </div>
          {tournament.bracketPublished ? (
            <div className="tournament-bracket">
              {rounds.map((round) => (
                <div className="tournament-round" key={round.label}>
                  <h4>{round.label}</h4>
                  <div className="tournament-round-matches">
                    {round.matches.map((match) => {
                      const team1 = teamsById.get(match.team1Id || '');
                      const team2 = teamsById.get(match.team2Id || '');
                      return (
                        <article className={`tournament-match ${match.status}`} key={match.id}>
                          <small>Match {match.matchNumber}{match.roomCode ? ` · ${match.roomCode}` : ''}</small>
                          <div className={match.winnerTeamId === match.team1Id ? 'winner' : ''}><span>{teamLabel(team1)}</span>{match.winnerTeamId === match.team1Id && <b>WIN</b>}</div>
                          <div className={match.winnerTeamId === match.team2Id ? 'winner' : ''}><span>{teamLabel(team2)}</span>{match.winnerTeamId === match.team2Id && <b>WIN</b>}</div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="tournament-bracket-placeholder">
              <b>{tournament.confirmedTeams} confirmed teams</b>
              <span>Up to {tournament.maxTeams} teams · top seeds receive first-round byes when needed</span>
            </div>
          )}
        </section>

        {snapshot.teams.length > 0 && (
          <section className="tournament-team-roster">
            <h3>Registered Teams</h3>
            <div>
              {snapshot.teams.map((team) => (
                <article key={team.id}><b>{team.seed ? `#${team.seed} ` : ''}{team.name}</b><span>{team.members.map((member) => `@${member.username}`).join(' + ')}</span></article>
              ))}
            </div>
          </section>
        )}
      </section>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      {tournament && (myTeam || unread > 0) && (
        <button className="tournament-dock" type="button" onClick={openTournament} aria-label="Open Brasta tournament">
          <span aria-hidden="true">♜</span>
          <b>Tournament</b>
          {unread > 0 && <i>{unread > 9 ? '9+' : unread}</i>}
        </button>
      )}
      {homeBanner}
      {modal}
    </>
  );
}
