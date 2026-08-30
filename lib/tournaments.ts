import crypto from 'node:crypto';
import { buildTournamentBracket } from './tournament-bracket';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://fhdrywazfmmvgswkdpdb.supabase.co';
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

type TournamentStatus = 'draft' | 'registration' | 'bracket' | 'active' | 'completed' | 'canceled';
type TeamStatus = 'pending' | 'confirmed' | 'withdrawn';
type MatchStatus = 'pending' | 'ready' | 'active' | 'completed' | 'bye';

type TournamentRow = {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  registration_opens_at: string;
  registration_closes_at: string;
  max_teams: number;
  status: TournamentStatus;
  bracket_size: number | null;
  bracket_published_at: string | null;
  champion_team_id: string | null;
  created_at: string;
  updated_at: string;
};

type TeamRow = {
  id: string;
  tournament_id: string;
  team_name: string;
  captain_id: string;
  status: TeamStatus;
  seed: number | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
};

type MemberRow = {
  tournament_id: string;
  team_id: string;
  player_id: string;
  member_role: 'captain' | 'partner';
  accepted_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

type MatchRow = {
  id: string;
  tournament_id: string;
  round_number: number;
  round_label: string;
  match_number: number;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  next_match_id: string | null;
  next_slot: 1 | 2 | null;
  room_code: string | null;
  status: MatchStatus;
  scheduled_at: string | null;
  completed_at: string | null;
};

type NotificationRow = {
  id: string;
  tournament_id: string;
  user_id: string;
  notification_type: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
};

export type TournamentTeam = {
  id: string;
  name: string;
  status: TeamStatus;
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

export type TournamentSnapshot = {
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
    status: TournamentStatus;
    bracketPublished: boolean;
    championTeamId: string | null;
  } | null;
  teams: TournamentTeam[];
  matches: Array<{
    id: string;
    roundNumber: number;
    roundLabel: string;
    matchNumber: number;
    team1Id: string | null;
    team2Id: string | null;
    winnerTeamId: string | null;
    roomCode: string | null;
    status: MatchStatus;
  }>;
  myTeam: TournamentTeam | null;
  notifications: Array<{
    id: string;
    type: string;
    title: string;
    body: string;
    readAt: string | null;
    createdAt: string;
  }>;
};

function configured(): boolean {
  return Boolean(supabaseUrl && secretKey);
}

function requestHeaders(extra: Record<string, string> = {}): Record<string, string> {
  if (!secretKey) throw new Error('Tournament backend is not configured.');
  return {
    apikey: secretKey,
    Authorization: `Bearer ${secretKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...extra,
  };
}

async function parse<T>(response: Response, context: string): Promise<T> {
  const text = await response.text();
  if (!response.ok) {
    let detail = text;
    try {
      const data = JSON.parse(text) as { message?: string; hint?: string; details?: string };
      detail = data.message || data.hint || data.details || text;
    } catch {}
    throw new Error(`${context}: ${detail || `HTTP ${response.status}`}`);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

async function rest<T>(path: string, init: RequestInit = {}, context = 'Tournament request failed'): Promise<T> {
  if (!configured()) throw new Error('Tournament backend is not configured.');
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers: requestHeaders(init.headers as Record<string, string> || {}),
    cache: 'no-store',
  });
  return parse<T>(response, context);
}

async function rpc<T>(name: string, body: Record<string, unknown>, context: string): Promise<T> {
  return rest<T>(`rpc/${name}`, { method: 'POST', body: JSON.stringify(body) }, context);
}

function safeText(value: unknown, max: number): string {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);
}

function validUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function profilesByIds(ids: string[]): Promise<Map<string, ProfileRow>> {
  const unique = [...new Set(ids.filter(validUuid))];
  if (!unique.length) return new Map();
  const rows = await rest<ProfileRow[]>(
    `profiles?id=in.(${unique.join(',')})&select=id,username,display_name,avatar_url`,
    {},
    'Could not load tournament players',
  );
  return new Map(rows.map((row) => [row.id, row]));
}

async function profileByUsername(username: string): Promise<ProfileRow | null> {
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) return null;
  const rows = await rest<ProfileRow[]>(
    `profiles?username=ilike.${encodeURIComponent(username)}&select=id,username,display_name,avatar_url&limit=1`,
    {},
    'Could not find that teammate',
  );
  return rows[0] || null;
}

function tournamentPublic(row: TournamentRow, confirmedTeams: number) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.starts_at,
    registrationOpensAt: row.registration_opens_at,
    registrationClosesAt: row.registration_closes_at,
    maxTeams: row.max_teams,
    confirmedTeams,
    spotsRemaining: Math.max(0, row.max_teams - confirmedTeams),
    status: row.status,
    bracketPublished: Boolean(row.bracket_published_at),
    championTeamId: row.champion_team_id,
  };
}

function notificationPayload(args: {
  tournamentId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  dedupeKey: string;
}) {
  return {
    tournament_id: args.tournamentId,
    user_id: args.userId,
    notification_type: args.type,
    title: args.title,
    body: args.body,
    dedupe_key: args.dedupeKey,
  };
}

async function createNotifications(rows: ReturnType<typeof notificationPayload>[]): Promise<void> {
  if (!rows.length) return;
  await rest<void>(
    'tournament_notifications?on_conflict=dedupe_key',
    {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    },
    'Could not create tournament notifications',
  );
}

async function tournamentRowsForPublic(): Promise<TournamentRow[]> {
  return rest<TournamentRow[]>(
    'tournaments?status=in.(registration,bracket,active)&select=*&order=starts_at.asc&limit=1',
    {},
    'Could not load the upcoming tournament',
  );
}

async function loadTeamRows(tournamentId: string): Promise<{ teams: TeamRow[]; members: MemberRow[] }> {
  const [teams, members] = await Promise.all([
    rest<TeamRow[]>(
      `tournament_teams?tournament_id=eq.${tournamentId}&select=*&order=seed.asc.nullslast,confirmed_at.asc.nullslast,created_at.asc`,
      {},
      'Could not load tournament teams',
    ),
    rest<MemberRow[]>(
      `tournament_team_members?tournament_id=eq.${tournamentId}&select=*&order=created_at.asc`,
      {},
      'Could not load tournament team members',
    ),
  ]);
  return { teams, members };
}

function composeTeams(rows: TeamRow[], members: MemberRow[], profiles: Map<string, ProfileRow>): TournamentTeam[] {
  return rows.map((team) => ({
    id: team.id,
    name: team.team_name,
    status: team.status,
    seed: team.seed,
    confirmedAt: team.confirmed_at,
    members: members
      .filter((member) => member.team_id === team.id)
      .sort((a, b) => a.member_role === 'captain' ? -1 : b.member_role === 'captain' ? 1 : 0)
      .map((member) => {
        const profile = profiles.get(member.player_id);
        return {
          id: member.player_id,
          username: profile?.username || 'Player',
          displayName: profile?.display_name || null,
          avatarUrl: profile?.avatar_url || null,
          role: member.member_role,
          accepted: Boolean(member.accepted_at),
        };
      }),
  }));
}

async function sendStartingNotifications(tournament: TournamentRow, members: MemberRow[]): Promise<void> {
  const accepted = [...new Set(members.filter((member) => member.accepted_at).map((member) => member.player_id))];
  await createNotifications(accepted.map((userId) => notificationPayload({
    tournamentId: tournament.id,
    userId,
    type: 'tournament_starting',
    title: `${tournament.title} is starting`,
    body: 'Open Brasta to view your bracket matchup and tournament status.',
    dedupeKey: `tournament-start:${tournament.id}:${userId}`,
  })));
}

async function maybeActivateTournament(tournament: TournamentRow): Promise<TournamentRow> {
  if (!['bracket', 'registration'].includes(tournament.status) || new Date(tournament.starts_at).getTime() > Date.now()) return tournament;
  if (!tournament.bracket_published_at) {
    const { teams } = await loadTeamRows(tournament.id);
    if (teams.filter((team) => team.status === 'confirmed').length >= 2) await publishTournamentBracket(tournament.id);
  }
  const updated = await rest<TournamentRow[]>(
    `tournaments?id=eq.${tournament.id}&status=in.(registration,bracket)`,
    {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ status: 'active', updated_at: new Date().toISOString() }),
    },
    'Could not start the tournament',
  );
  return updated[0] || tournament;
}

export async function getTournamentSnapshot(userId?: string | null): Promise<TournamentSnapshot> {
  let tournament = (await tournamentRowsForPublic())[0] || null;
  if (!tournament) return { tournament: null, teams: [], matches: [], myTeam: null, notifications: [] };
  tournament = await maybeActivateTournament(tournament);

  const { teams: allTeamRows, members } = await loadTeamRows(tournament.id);
  if (tournament.status === 'active') await sendStartingNotifications(tournament, members);

  const publicTeamRows = allTeamRows.filter((team) => team.status === 'confirmed');
  const myTeamRow = userId
    ? allTeamRows.find((team) => members.some((member) => member.team_id === team.id && member.player_id === userId)) || null
    : null;
  const visibleRows = myTeamRow && !publicTeamRows.some((team) => team.id === myTeamRow.id)
    ? [...publicTeamRows, myTeamRow]
    : publicTeamRows;
  const visibleMembers = members.filter((member) => visibleRows.some((team) => team.id === member.team_id));
  const profiles = await profilesByIds(visibleMembers.map((member) => member.player_id));
  const composed = composeTeams(visibleRows, visibleMembers, profiles);
  const matches = tournament.bracket_published_at
    ? await rest<MatchRow[]>(
      `tournament_matches?tournament_id=eq.${tournament.id}&select=*&order=round_number.asc,match_number.asc`,
      {},
      'Could not load tournament bracket',
    )
    : [];
  const notifications = userId
    ? await rest<NotificationRow[]>(
      `tournament_notifications?tournament_id=eq.${tournament.id}&user_id=eq.${userId}&select=*&order=created_at.desc&limit=20`,
      {},
      'Could not load tournament notifications',
    )
    : [];

  return {
    tournament: tournamentPublic(tournament, publicTeamRows.length),
    teams: composed.filter((team) => team.status === 'confirmed'),
    matches: matches.map((match) => ({
      id: match.id,
      roundNumber: match.round_number,
      roundLabel: match.round_label,
      matchNumber: match.match_number,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      winnerTeamId: match.winner_team_id,
      roomCode: match.room_code,
      status: match.status,
    })),
    myTeam: myTeamRow ? composed.find((team) => team.id === myTeamRow.id) || null : null,
    notifications: notifications.map((item) => ({
      id: item.id,
      type: item.notification_type,
      title: item.title,
      body: item.body,
      readAt: item.read_at,
      createdAt: item.created_at,
    })),
  };
}

export async function inviteTournamentPartner(args: {
  tournamentId: string;
  captainId: string;
  partnerUsername: unknown;
  teamName: unknown;
}): Promise<void> {
  const partnerUsername = safeText(args.partnerUsername, 20).replace(/^@/, '');
  const teamName = safeText(args.teamName, 32);
  if (teamName.length < 2) throw new Error('Enter a team name with at least 2 characters.');
  const partner = await profileByUsername(partnerUsername);
  if (!partner?.id || !partner.username) throw new Error('No Brasta player has that username.');
  if (partner.id === args.captainId) throw new Error('Choose a teammate other than yourself.');

  const teamId = await rpc<string>('brasta_create_tournament_team', {
    p_tournament_id: args.tournamentId,
    p_captain_id: args.captainId,
    p_partner_id: partner.id,
    p_team_name: teamName,
  }, 'Could not create tournament team');

  const tournamentRows = await rest<TournamentRow[]>(
    `tournaments?id=eq.${args.tournamentId}&select=*&limit=1`,
    {},
    'Could not load tournament schedule',
  );
  const tournament = tournamentRows[0];
  if (!tournament) return;
  await createNotifications([notificationPayload({
    tournamentId: tournament.id,
    userId: partner.id,
    type: 'team_invite',
    title: `${teamName} invited you`,
    body: `Accept the 2v2 team invitation for ${tournament.title}, starting ${new Date(tournament.starts_at).toISOString()}.`,
    dedupeKey: `team-invite:${teamId}:${partner.id}`,
  })]);
}

async function teamWithMembers(teamId: string): Promise<{ team: TeamRow; members: MemberRow[]; tournament: TournamentRow } | null> {
  const teams = await rest<TeamRow[]>(`tournament_teams?id=eq.${teamId}&select=*&limit=1`, {}, 'Could not load tournament team');
  const team = teams[0];
  if (!team) return null;
  const [members, tournaments] = await Promise.all([
    rest<MemberRow[]>(`tournament_team_members?team_id=eq.${teamId}&select=*`, {}, 'Could not load team members'),
    rest<TournamentRow[]>(`tournaments?id=eq.${team.tournament_id}&select=*&limit=1`, {}, 'Could not load tournament'),
  ]);
  if (!tournaments[0]) return null;
  return { team, members, tournament: tournaments[0] };
}

export async function acceptTournamentInvite(teamId: string, userId: string): Promise<void> {
  const before = await teamWithMembers(teamId);
  if (!before || !before.members.some((member) => member.player_id === userId && member.member_role === 'partner')) {
    throw new Error('That team invitation is no longer available.');
  }
  await rpc<void>('brasta_accept_tournament_team', { p_team_id: teamId, p_player_id: userId }, 'Could not accept team invitation');
  await createNotifications(before.members.map((member) => notificationPayload({
    tournamentId: before.tournament.id,
    userId: member.player_id,
    type: 'team_confirmed',
    title: `${before.team.team_name} is registered`,
    body: `${before.tournament.title} starts at ${new Date(before.tournament.starts_at).toISOString()}.`,
    dedupeKey: `team-confirmed:${teamId}:${member.player_id}`,
  })));
}

export async function removeTournamentTeam(teamId: string, userId: string): Promise<void> {
  const data = await teamWithMembers(teamId);
  if (!data || !data.members.some((member) => member.player_id === userId)) return;
  if (!['draft', 'registration'].includes(data.tournament.status) || data.tournament.bracket_published_at) {
    throw new Error('Teams cannot withdraw after the bracket is published.');
  }
  await rest<void>(
    `tournament_teams?id=eq.${teamId}&tournament_id=eq.${data.tournament.id}`,
    { method: 'DELETE' },
    'Could not remove tournament team',
  );
}

export async function markTournamentNotificationsRead(userId: string, notificationId?: string): Promise<void> {
  const path = notificationId
    ? `tournament_notifications?id=eq.${encodeURIComponent(notificationId)}&user_id=eq.${userId}`
    : `tournament_notifications?user_id=eq.${userId}&read_at=is.null`;
  await rest<void>(path, {
    method: 'PATCH',
    body: JSON.stringify({ read_at: new Date().toISOString() }),
  }, 'Could not update tournament notification');
}

export async function listAdminTournaments(): Promise<TournamentSnapshot[]> {
  const tournaments = await rest<TournamentRow[]>('tournaments?select=*&order=starts_at.desc&limit=25', {}, 'Could not load tournaments');
  const snapshots: TournamentSnapshot[] = [];
  for (const tournament of tournaments) {
    const { teams, members } = await loadTeamRows(tournament.id);
    const profiles = await profilesByIds(members.map((member) => member.player_id));
    const composed = composeTeams(teams, members, profiles);
    const matches = tournament.bracket_published_at
      ? await rest<MatchRow[]>(`tournament_matches?tournament_id=eq.${tournament.id}&select=*&order=round_number.asc,match_number.asc`, {}, 'Could not load bracket')
      : [];
    const confirmed = teams.filter((team) => team.status === 'confirmed').length;
    snapshots.push({
      tournament: tournamentPublic(tournament, confirmed),
      teams: composed,
      matches: matches.map((match) => ({
        id: match.id,
        roundNumber: match.round_number,
        roundLabel: match.round_label,
        matchNumber: match.match_number,
        team1Id: match.team1_id,
        team2Id: match.team2_id,
        winnerTeamId: match.winner_team_id,
        roomCode: match.room_code,
        status: match.status,
      })),
      myTeam: null,
      notifications: [],
    });
  }
  return snapshots;
}

export async function createTournament(args: {
  title: unknown;
  description: unknown;
  startsAt: unknown;
  registrationOpensAt?: unknown;
  registrationClosesAt?: unknown;
  maxTeams?: unknown;
  createdBy: string;
}): Promise<string> {
  const title = safeText(args.title, 80) || 'Brasta 2v2 Tournament';
  const description = safeText(args.description, 500);
  const startsAt = new Date(String(args.startsAt || ''));
  if (!Number.isFinite(startsAt.getTime()) || startsAt.getTime() <= Date.now()) throw new Error('Choose a tournament start time in the future.');
  const opensAt = args.registrationOpensAt ? new Date(String(args.registrationOpensAt)) : new Date();
  const closesAt = args.registrationClosesAt
    ? new Date(String(args.registrationClosesAt))
    : new Date(startsAt.getTime() - 15 * 60_000);
  if (!Number.isFinite(opensAt.getTime()) || !Number.isFinite(closesAt.getTime()) || closesAt <= opensAt || closesAt > startsAt) {
    throw new Error('Registration must close after it opens and no later than the tournament start.');
  }
  const maxTeams = Math.min(12, Math.max(2, Math.floor(Number(args.maxTeams) || 12)));
  const rows = await rest<TournamentRow[]>(
    'tournaments',
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        title,
        description,
        starts_at: startsAt.toISOString(),
        registration_opens_at: opensAt.toISOString(),
        registration_closes_at: closesAt.toISOString(),
        max_teams: maxTeams,
        status: 'registration',
        created_by: args.createdBy,
      }),
    },
    'Could not create tournament',
  );
  if (!rows[0]) throw new Error('Tournament creation did not return a record.');
  return rows[0].id;
}

export async function updateTournament(args: {
  tournamentId: string;
  title?: unknown;
  description?: unknown;
  startsAt?: unknown;
  registrationClosesAt?: unknown;
  maxTeams?: unknown;
  status?: unknown;
}): Promise<void> {
  const existingRows = await rest<TournamentRow[]>(`tournaments?id=eq.${args.tournamentId}&select=*&limit=1`, {}, 'Could not load tournament');
  const existing = existingRows[0];
  if (!existing) throw new Error('Tournament not found.');
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (args.title != null) patch.title = safeText(args.title, 80);
  if (args.description != null) patch.description = safeText(args.description, 500);
  if (args.maxTeams != null) patch.max_teams = Math.min(12, Math.max(2, Math.floor(Number(args.maxTeams) || existing.max_teams)));
  if (args.startsAt != null) {
    const value = new Date(String(args.startsAt));
    if (!Number.isFinite(value.getTime())) throw new Error('Choose a valid tournament start time.');
    patch.starts_at = value.toISOString();
  }
  if (args.registrationClosesAt != null) {
    const value = new Date(String(args.registrationClosesAt));
    if (!Number.isFinite(value.getTime())) throw new Error('Choose a valid registration close time.');
    patch.registration_closes_at = value.toISOString();
  }
  if (args.status != null) {
    const status = String(args.status) as TournamentStatus;
    if (!['draft','registration','bracket','active','completed','canceled'].includes(status)) throw new Error('Unsupported tournament status.');
    patch.status = status;
  }
  const nextStart = new Date(String(patch.starts_at || existing.starts_at));
  const nextClose = new Date(String(patch.registration_closes_at || existing.registration_closes_at));
  if (nextClose > nextStart) throw new Error('Registration must close no later than the tournament start.');

  await rest<void>(`tournaments?id=eq.${args.tournamentId}`, { method: 'PATCH', body: JSON.stringify(patch) }, 'Could not update tournament');

  if (patch.starts_at && patch.starts_at !== existing.starts_at) {
    const members = await rest<MemberRow[]>(
      `tournament_team_members?tournament_id=eq.${args.tournamentId}&accepted_at=not.is.null&select=*`,
      {},
      'Could not load registered players',
    );
    await createNotifications([...new Set(members.map((member) => member.player_id))].map((userId) => notificationPayload({
      tournamentId: args.tournamentId,
      userId,
      type: 'schedule_updated',
      title: 'Tournament schedule updated',
      body: `${existing.title} now starts at ${nextStart.toISOString()}.`,
      dedupeKey: `schedule:${args.tournamentId}:${userId}:${nextStart.toISOString()}`,
    })));
  }
}

export async function publishTournamentBracket(tournamentId: string): Promise<void> {
  const tournamentRows = await rest<TournamentRow[]>(`tournaments?id=eq.${tournamentId}&select=*&limit=1`, {}, 'Could not load tournament');
  const tournament = tournamentRows[0];
  if (!tournament) throw new Error('Tournament not found.');
  if (tournament.bracket_published_at) return;
  const { teams, members } = await loadTeamRows(tournamentId);
  const confirmed = teams.filter((team) => team.status === 'confirmed').sort((a, b) =>
    String(a.confirmed_at || a.created_at).localeCompare(String(b.confirmed_at || b.created_at)),
  );
  if (confirmed.length < 2) throw new Error('At least two confirmed teams are required to publish a bracket.');
  if (confirmed.length > tournament.max_teams) throw new Error('The confirmed team count exceeds the tournament limit.');

  const seeded = confirmed.map((team, index) => ({ id: team.id, seed: index + 1 }));
  const { bracketSize, matches } = buildTournamentBracket(tournamentId, seeded);
  await rest<void>(`tournament_teams?tournament_id=eq.${tournamentId}&status=eq.confirmed`, {
    method: 'PATCH', body: JSON.stringify({ seed: null, updated_at: new Date().toISOString() }),
  }, 'Could not reset tournament seeds');
  for (const team of seeded) {
    await rest<void>(`tournament_teams?id=eq.${team.id}`, {
      method: 'PATCH', body: JSON.stringify({ seed: team.seed, updated_at: new Date().toISOString() }),
    }, 'Could not seed tournament team');
  }
  await rest<void>('tournament_matches', {
    method: 'POST',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify(matches),
  }, 'Could not create tournament bracket');
  const publishedAt = new Date().toISOString();
  await rest<void>(`tournaments?id=eq.${tournamentId}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'bracket', bracket_size: bracketSize, bracket_published_at: publishedAt, updated_at: publishedAt }),
  }, 'Could not publish tournament bracket');

  const userIds = [...new Set(members.filter((member) => confirmed.some((team) => team.id === member.team_id)).map((member) => member.player_id))];
  await createNotifications(userIds.map((userId) => notificationPayload({
    tournamentId,
    userId,
    type: 'bracket_published',
    title: 'Tournament bracket published',
    body: `Your bracket for ${tournament.title} is ready.`,
    dedupeKey: `bracket:${tournamentId}:${userId}`,
  })));
}

export async function setTournamentMatchWinner(args: {
  matchId: string;
  winnerTeamId: string;
  roomCode?: unknown;
}): Promise<void> {
  const rows = await rest<MatchRow[]>(`tournament_matches?id=eq.${args.matchId}&select=*&limit=1`, {}, 'Could not load tournament match');
  const match = rows[0];
  if (!match) throw new Error('Tournament match not found.');
  if (![match.team1_id, match.team2_id].includes(args.winnerTeamId)) throw new Error('Winner must be one of the teams in this match.');
  const now = new Date().toISOString();
  const roomCode = safeText(args.roomCode, 8).toUpperCase().replace(/[^A-Z0-9]/g, '');
  await rest<void>(`tournament_matches?id=eq.${match.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ winner_team_id: args.winnerTeamId, status: 'completed', completed_at: now, updated_at: now, room_code: roomCode || match.room_code }),
  }, 'Could not record tournament winner');

  if (match.next_match_id && match.next_slot) {
    const field = match.next_slot === 1 ? 'team1_id' : 'team2_id';
    await rest<void>(`tournament_matches?id=eq.${match.next_match_id}`, {
      method: 'PATCH', body: JSON.stringify({ [field]: args.winnerTeamId, updated_at: now }),
    }, 'Could not advance tournament winner');
    const nextRows = await rest<MatchRow[]>(`tournament_matches?id=eq.${match.next_match_id}&select=*&limit=1`, {}, 'Could not load next tournament match');
    const next = nextRows[0];
    if (next?.team1_id && next.team2_id) {
      await rest<void>(`tournament_matches?id=eq.${next.id}`, {
        method: 'PATCH', body: JSON.stringify({ status: 'ready', updated_at: now }),
      }, 'Could not ready the next tournament match');
      const members = await rest<MemberRow[]>(
        `tournament_team_members?team_id=in.(${next.team1_id},${next.team2_id})&select=*`,
        {},
        'Could not load next-match players',
      );
      await createNotifications(members.map((member) => notificationPayload({
        tournamentId: match.tournament_id,
        userId: member.player_id,
        type: 'match_ready',
        title: `${next.round_label} matchup ready`,
        body: 'Open the tournament bracket to see your next opponent.',
        dedupeKey: `match-ready:${next.id}:${member.player_id}`,
      })));
    }
    return;
  }

  await rest<void>(`tournaments?id=eq.${match.tournament_id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed', champion_team_id: args.winnerTeamId, updated_at: now }),
  }, 'Could not complete tournament');
  const members = await rest<MemberRow[]>(
    `tournament_team_members?tournament_id=eq.${match.tournament_id}&select=*`,
    {},
    'Could not load tournament players',
  );
  await createNotifications(members.map((member) => notificationPayload({
    tournamentId: match.tournament_id,
    userId: member.player_id,
    type: 'tournament_completed',
    title: 'Tournament complete',
    body: 'The final result is now available in the Brasta tournament bracket.',
    dedupeKey: `tournament-complete:${match.tournament_id}:${member.player_id}`,
  })));
}

export function tournamentRequestId(): string {
  return crypto.randomUUID();
}
