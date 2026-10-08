import type { TeamInput } from '../api/client';

export function normalizeTeamInput(input: TeamInput): TeamInput {
  return { name: input.name.trim().normalize('NFC'), city: input.city.trim().normalize('NFC') };
}

export function validateTeamInput(input: TeamInput): Record<string, string> {
  const normalized = normalizeTeamInput(input);
  const errors: Record<string, string> = {};
  if (!normalized.name) errors.name = 'Unesite naziv tima.';
  else if (normalized.name.length > 100) errors.name = 'Naziv može imati najviše 100 znakova.';
  if (!normalized.city) errors.city = 'Unesite grad.';
  else if (normalized.city.length > 100) errors.city = 'Grad može imati najviše 100 znakova.';
  return errors;
}
