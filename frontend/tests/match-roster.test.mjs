import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';
import { initialRosterInput, rosterRows, sameSelection, validateRosterInput } from '../src/matches/roster.ts';

afterEach(() => mock.restoreAll());
const player = { id: 'p1', teamId: 'home', firstName: 'Marko', lastName: 'Marković',
  jerseyNumber: 7, position: 'SETTER', createdAt: '2026-10-01T12:00:00Z' };
const saved = { ...player, id: 'entry', playerId: player.id, isLibero: false };
const team = { team: { id: 'home' }, available: [player], selected: [saved] };
const roster = { version: 3, home: team, away: { team: { id: 'away' }, available: [], selected: [] } };

test('initial input sends IDs and libero flags, never editable snapshots', () => {
  assert.deepEqual(initialRosterInput(roster), { version: 3,
    homePlayers: [{ playerId: 'p1', isLibero: false }], awayPlayers: [] });
});
test('saved snapshots override current player data and include transferred players', () => {
  const data = { ...team, available: [{ ...player, firstName: 'Novo', jerseyNumber: 99 }] };
  assert.equal(rosterRows(data)[0].firstName, 'Marko');
  assert.equal(rosterRows(data)[0].jerseyNumber, 7);
  assert.equal(rosterRows({ ...team, available: [] })[0].playerId, 'p1');
});
test('read-only rows contain only saved participants, ordered by jersey number', () => {
  const other = { ...player, id: 'p2', jerseyNumber: 1 };
  assert.equal(rosterRows({ ...team, available: [other, player] }).length, 2);
  assert.equal(rosterRows({ ...team, available: [other, player] }, true).length, 1);
  assert.equal(rosterRows({ ...team, available: [other, player] })[0].playerId, 'p2');
});
test('empty and partial drafts are valid', () => {
  assert.deepEqual(validateRosterInput(roster, { version: 3, homePlayers: [], awayPlayers: [] }), {});
  assert.deepEqual(validateRosterInput(roster, initialRosterInput(roster)), {});
});
test('unknown players and repeated IDs are rejected', () => {
  const input = initialRosterInput(roster);
  assert.ok(validateRosterInput(roster, { ...input, homePlayers: [{ playerId: 'unknown', isLibero: false }] }).homePlayers);
  assert.ok(validateRosterInput(roster, { ...input, homePlayers: [...input.homePlayers, ...input.homePlayers] }).homePlayers);
  const both = { ...roster, away: { ...roster.away, available: [player] } };
  assert.ok(validateRosterInput(both, { ...input, awayPlayers: input.homePlayers }).awayPlayers);
});
test('duplicate snapshot jerseys are rejected even when current jerseys are unique', () => {
  const other = { ...player, id: 'p2' };
  const data = { ...roster, home: { ...team, available: [{ ...player, jerseyNumber: 8 }, other] } };
  assert.ok(validateRosterInput(data, { version: 3, homePlayers: [
    { playerId: 'p1', isLibero: false }, { playerId: 'p2', isLibero: false }], awayPlayers: [] }).homePlayers);
});
test('at most two designated liberos per side', () => {
  const players = [1, 2, 3].map((n) => ({ ...player, id: 'p' + n, jerseyNumber: n }));
  const data = { ...roster, home: { ...team, available: players, selected: [] } };
  const input = { version: 3, homePlayers: players.map((p) => ({ playerId: p.id, isLibero: true })), awayPlayers: [] };
  assert.ok(validateRosterInput(data, input).homePlayers);
  assert.deepEqual(validateRosterInput(data, { ...input, homePlayers: input.homePlayers.slice(0, 2) }), {});
});
test('dirty tracking ignores order but detects IDs, flags and removals', () => {
  const a = [{ playerId: 'a', isLibero: false }, { playerId: 'b', isLibero: true }];
  assert.equal(sameSelection(a, [...a].reverse()), true);
  assert.equal(sameSelection(a, [{ ...a[0], isLibero: true }, a[1]]), false);
  assert.equal(sameSelection(a, a.slice(0, 1)), false);
  assert.equal(sameSelection(a, [a[0], { ...a[1], playerId: 'c' }]), false);
});
test('roster GET supports abort and same-origin session credentials', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json(roster));
  assert.deepEqual(await api.matchRoster('match-id', controller.signal), roster);
  const [path, options] = fetch.mock.calls[0].arguments;
  assert.equal(path, '/api/matches/match-id/roster');
  assert.ok(options.signal instanceof AbortSignal);
  assert.equal(options.credentials, 'same-origin');
});
test('roster PUT sends version and both selections with fresh CSRF', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    return Response.json(path === '/api/auth/csrf' ? { headerName: 'X-CSRF-TOKEN', token: 'fresh' } : roster);
  });
  const input = initialRosterInput(roster);
  await api.saveMatchRoster('match-id', input);
  assert.equal(requests[0].path, '/api/auth/csrf');
  assert.equal(requests[1].path, '/api/matches/match-id/roster');
  assert.equal(requests[1].options.method, 'PUT');
  assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'fresh');
  assert.deepEqual(JSON.parse(requests[1].options.body), input);
});
