import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';
import { initialStartInput, hasStartDraft } from '../src/matches/lineup.ts';
afterEach(() => mock.restoreAll());
const state = { roster: { version: 2, match: { homeTeam: { id: 'home' }, awayTeam: { id: 'away' } } },
  sets: [{ id: 'previous', firstServingTeamId: 'home', scoreVersion: 26 }], nextSetNumber: 2 };
test('next sets 2–4 preselect the opposite first-serving team without marking a fresh draft dirty', () => {
  const input = initialStartInput(state);
  assert.equal(input.firstServingTeamId, 'away');
  assert.equal(hasStartDraft(input, input.firstServingTeamId), false);
});
test('fifth-set preparation requires a new first-serving choice', () => {
  assert.equal(initialStartInput({ ...state, nextSetNumber: 5 }).firstServingTeamId, '');
});
for (const kind of ['start', 'finish']) {
  test(kind + ' set sends a scoped POST, expected state and fresh CSRF', async () => {
    const requests = [];
    const input = kind === 'finish' ? { requestId: 'id', version: 25 } : {
      number: 2, previousSetId: 'previous', previousSetVersion: 26, rosterVersion: 2,
      homeLineup: ['h1','h2','h3','h4','h5','h6'], awayLineup: ['a1','a2','a3','a4','a5','a6'], firstServingTeamId: 'away',
    };
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      return Response.json(path === '/api/auth/csrf' ? { headerName: 'X-CSRF-TOKEN', token: 'fresh' } : {});
    });
    if (kind === 'finish') await api.finishSet('match', 'set', input);
    else await api.startNextSet('match', input);
    assert.equal(requests[1].path, '/api/matches/match/sets' + (kind === 'finish' ? '/set/finish' : ''));
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'fresh');
    assert.deepEqual(JSON.parse(requests[1].options.body), input);
  });
}
