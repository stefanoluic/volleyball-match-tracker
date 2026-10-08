import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeTeamInput, validateTeamInput } from '../src/teams/validation.ts';

test('requires team name and city after trimming', () => {
  assert.deepEqual(validateTeamInput({ name: ' ', city: '' }), {
    name: 'Unesite naziv tima.', city: 'Unesite grad.',
  });
});

test('limits both team fields to 100 characters', () => {
  assert.ok(validateTeamInput({ name: 'a'.repeat(101), city: 'Novi Sad' }).name);
  assert.ok(validateTeamInput({ name: 'Team', city: 'a'.repeat(101) }).city);
  assert.deepEqual(validateTeamInput({ name: 'a'.repeat(100), city: 'a'.repeat(100) }), {});
});

test('accepts Serbian letters, numbers, spaces and punctuation in team names', () => {
  assert.deepEqual(validateTeamInput({ name: 'Železničar 2026 (U-21)', city: 'Čačak' }), {});
});

test('normalizes whitespace and decomposed accents before submitting', () => {
  assert.deepEqual(normalizeTeamInput({ name: ' Z\u030Celezničar ', city: ' Čačak ' }),
    { name: 'Železničar', city: 'Čačak' });
});
