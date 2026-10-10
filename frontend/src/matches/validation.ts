import type { MatchInput, MatchStatus } from '../api/client';

export interface MatchFormInput {
  homeTeamId: string;
  awayTeamId: string;
  localDateTime: string;
}

export const matchStatusLabels: Record<MatchStatus, string> = {
  SCHEDULED: 'Zakazana', LIVE: 'U toku', FINISHED: 'Završena',
};

// Reject impossible dates and local times skipped by a daylight-saving change.
function parseLocalDateTime(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!parts) return null;
  const [year, month, day, hour, minute, second] = parts.slice(1).map((part) => Number(part ?? '0'));
  if (year < 1 || month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() !== year || date.getMonth() !== month - 1
    || date.getDate() !== day || date.getHours() !== hour || date.getMinutes() !== minute
    || date.getSeconds() !== second) return null;
  return date;
}

export function validateMatchInput(input: MatchFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.homeTeamId) errors.homeTeamId = 'Izaberite domaći tim.';
  if (!input.awayTeamId) errors.awayTeamId = 'Izaberite gostujući tim.';
  if (input.homeTeamId && input.homeTeamId === input.awayTeamId) {
    errors.awayTeamId = 'Domaćin i gost moraju biti različiti timovi.';
  }
  if (!input.localDateTime) errors.scheduledAt = 'Unesite datum i vreme utakmice.';
  else if (!parseLocalDateTime(input.localDateTime)) errors.scheduledAt = 'Unesite ispravan datum i vreme.';
  return errors;
}

export function toMatchInput(input: MatchFormInput): MatchInput {
  const date = parseLocalDateTime(input.localDateTime);
  if (Object.keys(validateMatchInput(input)).length || !date) throw new Error('Neispravni podaci utakmice.');
  return { homeTeamId: input.homeTeamId, awayTeamId: input.awayTeamId, scheduledAt: date.toISOString() };
}

export function toLocalDateTime(instant: string): string {
  const date = new Date(instant);
  const pad = (value: number) => String(value).padStart(2, '0');
  return String(date.getFullYear()).padStart(4, '0') + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds());
}

export function formatMatchTime(instant: string): string {
  return new Intl.DateTimeFormat('sr-Latn-RS', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(instant));
}
