import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());
test('score read is match/set scoped, session-based and cancellable', async () => {
  const controller = new AbortController();
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ version: 2 }));
  assert.deepEqual(await api.setScore('match', 'set', controller.signal), { version: 2 });
  const [path, options] = fetch.mock.calls[0].arguments;
  assert.equal(path, '/api/matches/match/sets/set/score');
  assert.equal(options.credentials, 'same-origin');
  assert.ok(options.signal instanceof AbortSignal);
});
for (const kind of ['add', 'undo']) {
  test(kind + ' point sends version and unchanged command ID with fresh CSRF', async () => {
    const input = { requestId: 'command-id', version: 3, ...(kind === 'add' ? { scoringTeamId: 'home' } : {}) };
    const requests = [];
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      return Response.json(path === '/api/auth/csrf' ? { headerName: 'X-CSRF-TOKEN', token: 'fresh' } : { version: 4 });
    });
    if (kind === 'add') await api.addPoint('match', 'set', input);
    else await api.undoPoint('match', 'set', 'point', input);
    assert.equal(requests[0].path, '/api/auth/csrf');
    assert.equal(requests[1].path, '/api/matches/match/sets/set/points' + (kind === 'undo' ? '/point/undo' : ''));
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.credentials, 'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'fresh');
    assert.deepEqual(JSON.parse(requests[1].options.body), input);
  });
}
test('score conflict is surfaced without an implicit retry', async () => {
  let writes = 0;
  mock.method(globalThis, 'fetch', async (path) => {
    if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh' });
    writes++; return Response.json({ message: 'Rezultat je promenjen.' }, { status: 409 });
  });
  await assert.rejects(api.addPoint('match', 'set', { requestId: 'id', version: 0, scoringTeamId: 'home' }), /promenjen/);
  assert.equal(writes, 1);
});

test('detailed point sends action and match participant unchanged, including unattributed team errors', async () => {
  const sent = [];
  mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh' });
    sent.push(JSON.parse(options.body)); return Response.json({ version: 1 });
  });
  for (const details of [{ actionType: 'ATTACK', participantId: 'match-player' }, { actionType: 'OPPONENT_ERROR', participantId: null }]) {
    const input = { requestId: 'id', version: 0, scoringTeamId: 'home', ...details };
    await api.addPoint('match', 'set', input);
    assert.deepEqual(sent.at(-1), input);
  }
});
