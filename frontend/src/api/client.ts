export type UserRole = 'ADMIN' | 'STATISTICIAN' | 'COACH';
export type UserStatus = 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'REJECTED';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

export interface UserPage {
  content: User[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export interface Registration {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  role: 'STATISTICIAN' | 'COACH';
}

export interface Team {
  id: string;
  name: string;
  city: string;
  createdAt: string;
}

export interface TeamInput {
  name: string;
  city: string;
}

export interface TeamPage {
  content: Team[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export type PlayerPosition = 'SETTER' | 'OUTSIDE_HITTER' | 'OPPOSITE' | 'MIDDLE_BLOCKER' | 'LIBERO';

export interface PlayerInput {
  firstName: string;
  lastName: string;
  jerseyNumber: number;
  position: PlayerPosition;
}

export interface Player extends PlayerInput {
  id: string;
  teamId: string;
  createdAt: string;
}

export interface PlayerPage {
  content: Player[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export type MatchStatus = 'SCHEDULED' | 'LIVE' | 'FINISHED';

export interface MatchInput {
  homeTeamId: string;
  awayTeamId: string;
  scheduledAt: string;
}

export interface Match {
  id: string;
  homeTeam: Team;
  awayTeam: Team;
  scheduledAt: string;
  status: MatchStatus;
  createdAt: string;
}

export interface MatchPage {
  content: Match[];
  page: number;
  totalPages: number;
  totalElements: number;
}

export interface RosterPlayerInput {
  playerId: string;
  isLibero: boolean;
}

export interface MatchPlayer extends PlayerInput {
  id: string;
  playerId: string;
  teamId: string;
  isLibero: boolean;
}

export interface TeamRoster {
  team: Team;
  selected: MatchPlayer[];
  available: Player[];
}

export interface MatchRoster {
  match: Match;
  version: number;
  home: TeamRoster;
  away: TeamRoster;
}

export interface MatchRosterInput {
  version: number;
  homePlayers: RosterPlayerInput[];
  awayPlayers: RosterPlayerInput[];
}

export interface LineupPlayer {
  rotationPosition: number;
  participant: MatchPlayer;
}

export interface MatchSet {
  id: string;
  number: number;
  status: 'LIVE' | 'FINISHED';
  homeScore: number;
  awayScore: number;
  firstServingTeamId: string;
  startedAt: string;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
  scoreVersion: number;
  finishedAt: string | null;
  winnerTeamId: string | null;
}

export interface MatchPreparation {
  roster: MatchRoster;
  firstSet: MatchSet | null;
  sets: MatchSet[];
  currentSet: MatchSet | null;
  nextSetNumber: number | null;
  homeSetsWon: number;
  awaySetsWon: number;
}

export interface StartMatchInput {
  rosterVersion: number;
  homeLineup: string[];
  awayLineup: string[];
  firstServingTeamId: string;
}

export interface StartNextSetInput extends StartMatchInput {
  number: number;
  previousSetId: string;
  previousSetVersion: number;
}

export type PointActionType = 'UNSPECIFIED' | 'ATTACK' | 'BLOCK' | 'SERVICE_ACE' | 'OPPONENT_ERROR';

export interface SetPoint {
  id: string;
  sequenceNumber: number;
  scoringTeamId: string;
  homeScoreAfter: number;
  awayScoreAfter: number;
  createdAt: string;
  cancelledAt: string | null;
  actionType: PointActionType;
  participant: MatchPlayer | null;
}

export interface SetCourt {
  servingTeamId: string | null;
  server: MatchPlayer | null;
  homeLineup: LineupPlayer[];
  awayLineup: LineupPlayer[];
}

export interface SetScore {
  setId: string;
  version: number;
  homeScore: number;
  awayScore: number;
  matchStatus: MatchStatus;
  setStatus: 'LIVE' | 'FINISHED';
  canRecord: boolean;
  lastActivePoint: SetPoint | null;
  points: SetPoint[];
  canUndo: boolean;
  canFinish: boolean;
  winnerTeamId: string | null;
  court: SetCourt | null;
  substitutions: SubstitutionState | null;
  libero: LiberoState | null;
}

export interface LiberoOption extends SubstitutionOption { regularParticipantId: string; }
export interface LiberoPresence {
  teamId: string;
  libero: MatchPlayer;
  regular: MatchPlayer;
  rotationPosition: number;
  mustExit: boolean;
}
export interface LiberoState {
  active: LiberoPresence[];
  options: LiberoOption[];
  history: SetSubstitution[];
  undoableId: string | null;
  mustExit: boolean;
}

export interface SubstitutionOption {
  teamId: string;
  startingPosition: number;
  outgoing: MatchPlayer;
  incoming: MatchPlayer[];
}
export interface SetSubstitution {
  id: string;
  teamId: string;
  outgoing: MatchPlayer;
  incoming: MatchPlayer;
  homeScore: number;
  awayScore: number;
  createdAt: string;
  cancelledAt: string | null;
}
export interface SubstitutionState {
  homeUsed: number;
  awayUsed: number;
  options: SubstitutionOption[];
  history: SetSubstitution[];
  undoableId: string | null;
  pointUndoBlocked: boolean;
}
export interface SubstituteInput extends UndoPointInput {
  outgoingParticipantId: string;
  incomingParticipantId: string;
}

export interface AddPointInput {
  requestId: string;
  version: number;
  scoringTeamId: string;
  actionType?: PointActionType;
  participantId?: string | null;
}

export interface UndoPointInput {
  requestId: string;
  version: number;
}

export interface PlayerStatistics {
  participant: MatchPlayer;
  attackPoints: number;
  blockPoints: number;
  serviceAces: number;
  scoringPoints: number;
  errors: number;
}

export interface TeamStatistics {
  teamId: string;
  name: string;
  totalPoints: number;
  attackPoints: number;
  blockPoints: number;
  serviceAces: number;
  opponentErrors: number;
  unspecifiedPoints: number;
  errors: number;
  unattributedErrors: number;
  players: PlayerStatistics[];
}

export interface StatisticsSet {
  id: string;
  number: number;
  status: 'LIVE' | 'FINISHED';
  scoreVersion: number;
}

export interface MatchStatistics {
  matchId: string;
  setId: string | null;
  matchStatus: MatchStatus;
  sets: StatisticsSet[];
  home: TeamStatistics;
  away: TeamStatistics;
  analysis: CoachingAnalysis;
}

export interface CoachingRecommendation {
  code: 'RECORDED_ERRORS' | 'OPPONENT_ACES' | 'CONCENTRATED_SCORING';
  title: string;
  observation: string;
  suggestion: string;
  participantId: string | null;
}

export interface CoachingAnalysis {
  availability: 'INSUFFICIENT_DATA' | 'INCOMPLETE_DETAILS' | 'AVAILABLE';
  totalRallies: number;
  unspecifiedRallies: number;
  minimumRallies: number;
  minimumDetailCoveragePercent: number;
  teams: { teamId: string; name: string; items: CoachingRecommendation[] }[];
}

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

export const READ_TIMEOUT_MS = 12_000;

async function readResponse<T>(response: Response, path: string, notifyOnUnauthorized = true, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted();
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    signal?.throwIfAborted();
    if (notifyOnUnauthorized && response.status === 401 && path !== '/api/auth/login') {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(body.message ?? 'Zahtev nije uspeo. Pokušajte ponovo.', response.status, body.errors ?? {});
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

async function get<T>(path: string, signal?: AbortSignal, notifyOnUnauthorized = true): Promise<T> {
  signal?.throwIfAborted();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  const interrupted = new Promise<never>((_resolve, reject) => {
    cancel = () => {
      reject(signal?.reason ?? new DOMException('Read cancelled', 'AbortError'));
      controller.abort(signal?.reason);
    };
    signal?.addEventListener('abort', cancel, { once: true });
    timer = setTimeout(() => {
      const failure = new ApiError('Server nije odgovorio na vreme. Pokušajte ponovo.', 504);
      reject(failure);
      controller.abort(failure);
    }, READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([(async () => {
      const response = await fetch(path, { credentials: 'same-origin', signal: controller.signal });
      controller.signal.throwIfAborted();
      const result = await readResponse<T>(response, path, notifyOnUnauthorized, controller.signal);
      controller.signal.throwIfAborted();
      return result;
    })(), interrupted]);
  } finally {
    clearTimeout(timer);
    if (cancel) signal?.removeEventListener('abort', cancel);
  }
}

async function mutate<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: object | URLSearchParams): Promise<T> {
  // Fetch a fresh masked CSRF token, including after login/logout token rotation.
  const csrf = await get<{ headerName: string; token: string }>('/api/auth/csrf');
  const form = body instanceof URLSearchParams;
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      [csrf.headerName]: csrf.token,
      ...(body ? { 'Content-Type': form ? 'application/x-www-form-urlencoded' : 'application/json' } : {}),
    },
    body: body ? (form ? body.toString() : JSON.stringify(body)) : undefined,
  });
  return readResponse<T>(response, path);
}

function post<T>(path: string, body?: object | URLSearchParams): Promise<T> {
  return mutate<T>('POST', path, body);
}

export const api = {
  me: (notifyOnUnauthorized = true, signal?: AbortSignal) => get<User>('/api/auth/me', signal, notifyOnUnauthorized),
  login: (email: string, password: string) =>
    post<User>('/api/auth/login', new URLSearchParams({ email: email.trim(), password })),
  register: (data: Registration) => post<User>('/api/auth/register', data),
  logout: () => post<void>('/api/auth/logout'),
  users: (status: string, page: number, signal?: AbortSignal) => {
    const query = new URLSearchParams({ page: String(page), size: '20' });
    if (status !== 'ALL') query.set('status', status);
    return get<UserPage>('/api/admin/users?' + query.toString(), signal);
  },
  approve: (id: string) => post<User>('/api/admin/users/' + id + '/approve'),
  block: (id: string) => post<User>('/api/admin/users/' + id + '/block'),
  deleteUser: (id: string) => mutate<void>('DELETE', '/api/admin/users/' + id),
  teams: (page: number, signal?: AbortSignal) =>
    get<TeamPage>('/api/teams?' + new URLSearchParams({ page: String(page), size: '20' }), signal),
  createTeam: (data: TeamInput) => post<Team>('/api/teams', data),
  updateTeam: (id: string, data: TeamInput) => mutate<Team>('PUT', '/api/teams/' + id, data),
  deleteTeam: (id: string) => mutate<void>('DELETE', '/api/teams/' + id),
  team: (id: string, signal?: AbortSignal) => get<Team>('/api/teams/' + id, signal),
  players: (teamId: string, page: number, signal?: AbortSignal) =>
    get<PlayerPage>('/api/teams/' + teamId + '/players?' + new URLSearchParams({ page: String(page), size: '20' }), signal),
  createPlayer: (teamId: string, data: PlayerInput) => post<Player>('/api/teams/' + teamId + '/players', data),
  updatePlayer: (teamId: string, id: string, data: PlayerInput) =>
    mutate<Player>('PUT', '/api/teams/' + teamId + '/players/' + id, data),
  deletePlayer: (teamId: string, id: string) => mutate<void>('DELETE', '/api/teams/' + teamId + '/players/' + id),
  matches: (page: number, signal?: AbortSignal) =>
    get<MatchPage>('/api/matches?' + new URLSearchParams({ page: String(page), size: '20' }), signal),
  match: (id: string, signal?: AbortSignal) => get<Match>('/api/matches/' + id, signal),
  createMatch: (data: MatchInput) => post<Match>('/api/matches', data),
  updateMatch: (id: string, data: MatchInput) => mutate<Match>('PUT', '/api/matches/' + id, data),
  deleteMatch: (id: string) => mutate<void>('DELETE', '/api/matches/' + id),
  matchRoster: (matchId: string, signal?: AbortSignal) => get<MatchRoster>('/api/matches/' + matchId + '/roster', signal),
  saveMatchRoster: (matchId: string, data: MatchRosterInput) => mutate<MatchRoster>('PUT', '/api/matches/' + matchId + '/roster', data),
  matchPreparation: (matchId: string, signal?: AbortSignal) =>
    get<MatchPreparation>('/api/matches/' + matchId + '/preparation', signal),
  matchStatistics: (matchId: string, setId: string | null, signal?: AbortSignal) =>
    get<MatchStatistics>('/api/matches/' + matchId + '/statistics'
      + (setId ? '?' + new URLSearchParams({ setId }) : ''), signal),
  startMatch: (matchId: string, data: StartMatchInput) =>
    post<MatchPreparation>('/api/matches/' + matchId + '/start', data),
  startNextSet: (matchId: string, data: StartNextSetInput) =>
    post<MatchPreparation>('/api/matches/' + matchId + '/sets', data),
  finishSet: (matchId: string, setId: string, data: UndoPointInput) =>
    post<MatchPreparation>('/api/matches/' + matchId + '/sets/' + setId + '/finish', data),
  setScore: (matchId: string, setId: string, signal?: AbortSignal) =>
    get<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/score', signal),
  addPoint: (matchId: string, setId: string, data: AddPointInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/points', data),
  undoPoint: (matchId: string, setId: string, pointId: string, data: UndoPointInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/points/' + pointId + '/undo', data),
  substitute: (matchId: string, setId: string, data: SubstituteInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/substitutions', data),
  undoSubstitution: (matchId: string, setId: string, substitutionId: string, data: UndoPointInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/substitutions/' + substitutionId + '/undo', data),
  replaceLibero: (matchId: string, setId: string, data: SubstituteInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/libero-replacements', data),
  undoLiberoReplacement: (matchId: string, setId: string, replacementId: string, data: UndoPointInput) =>
    post<SetScore>('/api/matches/' + matchId + '/sets/' + setId + '/libero-replacements/' + replacementId + '/undo', data),
  teamOptions: async (signal?: AbortSignal): Promise<Team[]> => {
    const teams: Team[] = [];
    let page = 0;
    let totalPages = 1;
    do {
      const result = await get<TeamPage>('/api/teams?' + new URLSearchParams({ page: String(page), size: '100' }), signal);
      teams.push(...result.content);
      totalPages = result.totalPages;
      page++;
    } while (page < totalPages);
    return [...new Map(teams.map((team) => [team.id, team])).values()];
  },
};

export function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : 'Veza sa serverom nije dostupna. Proverite da li je backend pokrenut.';
}

export const roleLabels: Record<UserRole, string> = {
  ADMIN: 'Administrator',
  STATISTICIAN: 'Statističar',
  COACH: 'Stručni štab',
};

export const statusLabels: Record<UserStatus, string> = {
  PENDING: 'Na čekanju',
  ACTIVE: 'Aktivan',
  BLOCKED: 'Blokiran',
  REJECTED: 'Odbijen',
};
