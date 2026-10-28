import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateMatchInput, toMatchInput, toLocalDateTime, matchStatusLabels } from '../src/matches/validation.ts';

process.env.TZ = 'Europe/Belgrade';
const input = { homeTeamId: 'home', awayTeamId: 'away', localDateTime: '2026-10-15T18:30' };

test('requires both participants and a date', () => {
  assert.deepEqual(Object.keys(validateMatchInput({ homeTeamId: '', awayTeamId: '', localDateTime: '' })),
    ['homeTeamId', 'awayTeamId', 'scheduledAt']);
});
test('rejects the same team on both sides', () => {
  assert.ok(validateMatchInput({ ...input, awayTeamId: 'home' }).awayTeamId);
  assert.throws(() => toMatchInput({ ...input, awayTeamId: 'home' }));
});
test('converts local Serbian summer and winter times to UTC', () => {
  assert.equal(toMatchInput(input).scheduledAt, '2026-10-15T16:30:00.000Z');
  assert.equal(toMatchInput({ ...input, localDateTime: '2026-12-15T18:30' }).scheduledAt, '2026-12-15T17:30:00.000Z');
});
test('editing round-trips dates and preserves seconds', () => {
  for (const instant of ['2026-10-15T16:30:12Z', '2026-12-15T17:30:00Z']) {
    assert.equal(toMatchInput({ ...input, localDateTime: toLocalDateTime(instant) }).scheduledAt,
      new Date(instant).toISOString());
  }
});

for (const original of ['2026-10-25T00:30:00Z', '2026-10-25T01:30:00Z', '2026-10-25T02:30:00+01:00']) {
  test('unchanged editing preserves the exact autumn instant: ' + original, () => {
    const localDateTime = toLocalDateTime(original);
    assert.equal(localDateTime, '2026-10-25T02:30:00');
    assert.equal(toMatchInput({ ...input, localDateTime }, original).scheduledAt, original);
    // Browsers may omit the optional :00 seconds in datetime-local controls.
    assert.equal(toMatchInput({ ...input, localDateTime: localDateTime.slice(0, 16) }, original).scheduledAt, original);
  });
}

test('unchanged editing also retains fractional timestamp precision', () => {
  const original = '2026-10-25T01:30:12.123456Z';
  assert.equal(toMatchInput({ ...input, localDateTime: toLocalDateTime(original) }, original).scheduledAt, original);
});

test('actually changing the local time uses the new value instead of the old instant', () => {
  assert.equal(toMatchInput({ ...input, localDateTime: '2026-10-25T03:30' }, '2026-10-25T01:30:00Z').scheduledAt,
    '2026-10-25T02:30:00.000Z');
});

test('a new ambiguous autumn time still uses the earlier occurrence', () => {
  assert.equal(toMatchInput({ ...input, localDateTime: '2026-10-25T02:30' }).scheduledAt, '2026-10-25T00:30:00.000Z');
});

test('providing an original instant never bypasses form validation', () => {
  const original = '2026-10-25T01:30:00Z';
  assert.throws(() => toMatchInput({ ...input, localDateTime: '' }, original));
  assert.throws(() => toMatchInput({ ...input, awayTeamId: 'home' }, original));
  assert.throws(() => toMatchInput({ ...input, localDateTime: '2026-03-29T02:30' }, original));
  assert.equal(toMatchInput(input, 'not-a-date').scheduledAt, toMatchInput(input).scheduledAt);
});
for (const localDateTime of ['bad', '2026-02-30T18:30', '2026-13-01T18:30', '2026-10-15T25:00',
  '2026-10-15T18:99', '2026-10-15', '2026-10-15T18:00Z', '0000-01-01T18:30', '2026-03-29T02:30']) {
  test('rejects invalid or skipped local time: ' + localDateTime, () => {
    assert.ok(validateMatchInput({ ...input, localDateTime }).scheduledAt);
    assert.throws(() => toMatchInput({ ...input, localDateTime }));
  });
}
test('past scheduled dates are allowed for entering historical fixtures', () => {
  assert.deepEqual(validateMatchInput({ ...input, localDateTime: '2020-01-15T18:30' }), {});
});
test('provides consistent Serbian status labels', () => {
  assert.deepEqual(matchStatusLabels, { SCHEDULED: 'Zakazana', LIVE: 'U toku', FINISHED: 'Završena' });
});
