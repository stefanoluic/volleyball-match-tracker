import type { MatchListFilters, MatchStatus } from '../api/client';

export interface MatchFilterInput {
  q: string;
  status: 'ALL' | MatchStatus;
  fromDate: string;
  toDate: string;
}

export const emptyMatchFilters: MatchFilterInput = { q: '', status: 'ALL', fromDate: '', toDate: '' };

function localDay(value: string): Date | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return null;
  const [year, month, day] = parts.slice(1).map(Number);
  const date = new Date(value + 'T00:00:00');
  if (year < 1 || !Number.isFinite(date.getTime()) || date.getFullYear() !== year
    || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date;
}

export function validateMatchFilters(input: MatchFilterInput): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.q.trim().normalize('NFC').length > 100) errors.q = 'Pretraga može imati najviše 100 znakova.';
  if (!['ALL', 'SCHEDULED', 'LIVE', 'FINISHED'].includes(input.status)) errors.status = 'Izaberite ispravan status.';
  if (input.fromDate && !localDay(input.fromDate)) errors.fromDate = 'Unesite ispravan početni datum.';
  if (input.toDate && !localDay(input.toDate)) errors.toDate = 'Unesite ispravan krajnji datum.';
  if (!errors.fromDate && !errors.toDate && input.fromDate && input.toDate && input.fromDate > input.toDate) {
    errors.toDate = 'Krajnji datum ne može biti pre početnog.';
  }
  return errors;
}

export function toMatchListFilters(input: MatchFilterInput): MatchListFilters {
  if (Object.keys(validateMatchFilters(input)).length) throw new Error('Neispravni filteri utakmica.');
  const result: MatchListFilters = {};
  const q = input.q.trim().normalize('NFC');
  if (q) result.q = q;
  if (input.status !== 'ALL') result.status = input.status;
  if (input.fromDate) result.from = localDay(input.fromDate)!.toISOString();
  if (input.toDate) {
    const until = localDay(input.toDate)!;
    // Advance one LOCAL calendar day, not 24 hours: DST days can have 23 or 25 hours.
    until.setDate(until.getDate() + 1);
    result.until = until.toISOString();
  }
  return result;
}
