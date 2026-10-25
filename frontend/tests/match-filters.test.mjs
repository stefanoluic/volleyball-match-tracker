import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../src/api/client.ts';
import { emptyMatchFilters, toMatchListFilters, validateMatchFilters } from '../src/matches/filters.ts';
import { mock } from 'node:test';

process.env.TZ = 'Europe/Budapest';

test('empty filters omit all optional parameters; text is trimmed and Unicode-normalized', () => {
  assert.deepEqual(toMatchListFilters(emptyMatchFilters), {});
  assert.deepEqual(toMatchListFilters({ ...emptyMatchFilters, q: ' Z\u030Celezničar ', status: 'LIVE' }), { q: 'Železničar', status: 'LIVE' });
});
test('both local dates are inclusive, while the API upper bound is exclusive', () => {
  assert.deepEqual(toMatchListFilters({ ...emptyMatchFilters, fromDate: '2026-10-24', toDate: '2026-10-24' }),
    { from: '2026-10-23T22:00:00.000Z', until: '2026-10-24T22:00:00.000Z' });
});
for (const [day, hours] of [['2026-03-29', 23], ['2026-10-25', 25]]) {
  test('calendar filtering handles the ' + hours + '-hour daylight-saving day', () => {
    const range = toMatchListFilters({ ...emptyMatchFilters, fromDate: day, toDate: day });
    assert.equal((new Date(range.until) - new Date(range.from)) / 3_600_000, hours);
  });
}
test('one-sided ranges and a leap day are accepted', () => {
  assert.deepEqual(toMatchListFilters({ ...emptyMatchFilters, fromDate: '2026-10-24' }), { from: '2026-10-23T22:00:00.000Z' });
  assert.deepEqual(toMatchListFilters({ ...emptyMatchFilters, toDate: '2026-10-24' }), { until: '2026-10-24T22:00:00.000Z' });
  assert.deepEqual(validateMatchFilters({ ...emptyMatchFilters, fromDate: '2028-02-29' }), {});
});
for (const value of ['2026-02-29', '2026-04-31', '2026-13-01', '0000-01-01', '24.10.2026', 'invalid']) {
  test('invalid calendar date is rejected: ' + value, () => {
    assert.ok(validateMatchFilters({ ...emptyMatchFilters, fromDate: value }).fromDate);
    assert.throws(() => toMatchListFilters({ ...emptyMatchFilters, toDate: value }));
  });
}
test('reversed ranges, unknown statuses and excessive search text are rejected', () => {
  assert.ok(validateMatchFilters({ ...emptyMatchFilters, fromDate: '2026-10-25', toDate: '2026-10-24' }).toDate);
  for (const status of ['OTHER', 'toString', '__proto__']) assert.ok(validateMatchFilters({ ...emptyMatchFilters, status }).status);
  assert.ok(validateMatchFilters({ ...emptyMatchFilters, q: 'x'.repeat(101) }).q);
  assert.deepEqual(validateMatchFilters({ ...emptyMatchFilters, q: 'x'.repeat(100) }), {});
});
test('API combines and safely encodes filters without losing pagination or cancellation', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ content: [] }));
  try {
    await api.matches(2, controller.signal, { q: 'A&B 100%_', status: 'FINISHED',
      from: '2026-10-23T22:00:00.000Z', until: '2026-10-24T22:00:00.000Z' });
    const [path, options] = fetch.mock.calls[0].arguments;
    const url = new URL(path, 'http://localhost');
    assert.deepEqual(Object.fromEntries(url.searchParams), { page: '2', size: '20', q: 'A&B 100%_', status: 'FINISHED',
      from: '2026-10-23T22:00:00.000Z', until: '2026-10-24T22:00:00.000Z' });
    assert.ok(options.signal instanceof AbortSignal); assert.equal(options.credentials, 'same-origin');
  } finally { mock.restoreAll(); }
});
