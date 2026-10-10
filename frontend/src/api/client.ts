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

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
  }
}

async function readResponse<T>(response: Response, path: string, notifyOnUnauthorized = true): Promise<T> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    if (notifyOnUnauthorized && response.status === 401 && path !== '/api/auth/login') {
      window.dispatchEvent(new Event('session-expired'));
    }
    throw new ApiError(body.message ?? 'Zahtev nije uspeo. Pokušajte ponovo.', response.status, body.errors ?? {});
  }
  return response.status === 204 ? (undefined as T) : response.json();
}

async function get<T>(path: string, signal?: AbortSignal, notifyOnUnauthorized = true): Promise<T> {
  return readResponse<T>(await fetch(path, { credentials: 'same-origin', signal }), path, notifyOnUnauthorized);
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
  me: (notifyOnUnauthorized = true) => get<User>('/api/auth/me', undefined, notifyOnUnauthorized),
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
