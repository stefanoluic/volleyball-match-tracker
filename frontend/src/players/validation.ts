import type { PlayerInput, PlayerPosition } from '../api/client';
import { normalizeName, validateName } from '../auth/validation.ts';

export const positionLabels: Record<PlayerPosition, string> = {
  SETTER: 'Tehničar',
  OUTSIDE_HITTER: 'Primač servisa',
  OPPOSITE: 'Korektor',
  MIDDLE_BLOCKER: 'Srednji bloker',
  LIBERO: 'Libero',
};

export const positionOptions = Object.entries(positionLabels).map(([value, label]) => ({ value, label }));

export interface PlayerFormInput {
  firstName: string;
  lastName: string;
  jerseyNumber: number | string;
  position: string;
}

export function validatePlayerInput(input: PlayerFormInput): Record<string, string> {
  const errors: Record<string, string> = {};
  const first = validateName(input.firstName, 'Ime');
  const last = validateName(input.lastName, 'Prezime');
  if (first) errors.firstName = first;
  if (last) errors.lastName = last;
  const number = String(input.jerseyNumber);
  if (!number.trim()) errors.jerseyNumber = 'Unesite broj dresa.';
  else if (!/^\d+$/.test(number) || Number(number) < 1 || Number(number) > 99) {
    errors.jerseyNumber = 'Broj dresa mora biti ceo broj između 1 i 99.';
  }
  if (!Object.hasOwn(positionLabels, input.position)) errors.position = 'Izaberite poziciju.';
  return errors;
}

export function normalizePlayerInput(input: PlayerFormInput): PlayerInput {
  if (Object.keys(validatePlayerInput(input)).length > 0) throw new Error('Neispravni podaci igrača.');
  return {
    firstName: normalizeName(input.firstName),
    lastName: normalizeName(input.lastName),
    jerseyNumber: Number(input.jerseyNumber),
    position: input.position as PlayerPosition,
  };
}
