import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';
import { hasStartDraft, initialStartInput, rotationLabels, validateStartInput } from '../src/matches/lineup.ts';

afterEach(() => mock.restoreAll());
const roster = {
  version: 3, match: { homeTeam: { id: 'h' }, awayTeam: { id: 'a' } },
  home: { selected: Array.from({ length: 7 }, (_, index) => ({ id: 'h' + index, isLibero: index === 6 })) },
  away: { selected: Array.from({ length: 6 }, (_, index) => ({ id: 'a' + index, isLibero: false })) },
};
const input = { rosterVersion: 3, homeLineup: roster.home.selected.slice(0, 6).map((p) => p.id),
  awayLineup: roster.away.selected.map((p) => p.id), firstServingTeamId: 'h' };
test('new preparation has six empty slots per side and no assumed first serve', () => {
  const initial = initialStartInput({ roster, firstSet: null });
  assert.deepEqual(initial, { rosterVersion: 3, homeLineup: Array(6).fill(''),
    awayLineup: Array(6).fill(''), firstServingTeamId: '' });
  assert.equal(hasStartDraft(initial), false);
  assert.equal(hasStartDraft({ ...initial, firstServingTeamId: 'h' }), true);
  assert.equal(hasStartDraft({ ...initial, homeLineup: ['h0', '', '', '', '', ''] }), true);
});
test('valid starting six use match participant IDs, in rotational order', () => {
  assert.deepEqual(validateStartInput(roster, input), {});
  assert.equal(rotationLabels.length, 6);
  assert.match(rotationLabels[0], /zadnja desna/);
});
test('requires all twelve slots and first-serving team', () => {
  const errors = validateStartInput(roster, initialStartInput({ roster, firstSet: null }));
  assert.deepEqual(Object.keys(errors), ['homeLineup', 'awayLineup', 'firstServingTeamId']);
});
test('requires exactly six different IDs on each side', () => {
  for (const homeLineup of [input.homeLineup.slice(0, 5), [...input.homeLineup, 'h6'], Array(6).fill('h0')]) {
    assert.ok(validateStartInput(roster, { ...input, homeLineup }).homeLineup);
  }
});
test('rejects registered liberos and participants from another team', () => {
  for (const id of ['h6', 'a0', 'unknown']) {
    assert.ok(validateStartInput(roster, { ...input, homeLineup: [id, ...input.homeLineup.slice(1)] }).homeLineup);
  }
});
test('serving side must be one of the two teams', () => {
  assert.ok(validateStartInput(roster, { ...input, firstServingTeamId: 'other' }).firstServingTeamId);
  assert.deepEqual(validateStartInput(roster, { ...input, firstServingTeamId: 'a' }), {});
});
test('GET preparation uses session credentials and supports abort', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ roster, firstSet: null }));
  await api.matchPreparation('match', controller.signal);
  const [path, options] = fetch.mock.calls[0].arguments;
  assert.equal(path, '/api/matches/match/preparation');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.signal, controller.signal);
});
test('POST start obtains fresh CSRF and submits version, ordered entries and serving team', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    return Response.json(path === '/api/auth/csrf' ? { headerName: 'X-CSRF-TOKEN', token: 'fresh' } : {});
  });
  await api.startMatch('match', input);
  assert.equal(requests[0].path, '/api/auth/csrf');
  assert.equal(requests[1].path, '/api/matches/match/start');
  assert.equal(requests[1].options.method, 'POST');
  assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'fresh');
  assert.deepEqual(JSON.parse(requests[1].options.body), input);
});
test('failed start surfaces conflict without silently retrying irreversible action', async () => {
  let writes = 0;
  mock.method(globalThis, 'fetch', async (path) => {
    if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh' });
    writes++;
    return Response.json({ message: 'Utakmica je već pokrenuta.' }, { status: 409 });
  });
  await assert.rejects(api.startMatch('match', input), /već pokrenuta/);
  assert.equal(writes, 1);
});
