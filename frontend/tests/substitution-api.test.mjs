import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());
for (const undo of [false, true]) {
  test((undo ? 'undo substitution' : 'substitution') + ' sends scoped IDs, version, session and fresh CSRF', async () => {
    const requests = [];
    const input = { requestId: 'original-id', version: 12, ...(undo ? {} : { outgoingParticipantId: 'out', incomingParticipantId: 'in' }) };
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      return Response.json(path === '/api/auth/csrf' ? { headerName: 'X-CSRF', token: 'fresh' } : { version: 13 });
    });
    const result = undo ? await api.undoSubstitution('match','set','sub',input) : await api.substitute('match','set',input);
    assert.deepEqual(result, { version: 13 });
    assert.equal(requests[0].path, '/api/auth/csrf');
    assert.equal(requests[1].path, '/api/matches/match/sets/set/substitutions' + (undo ? '/sub/undo' : ''));
    assert.equal(requests[1].options.method, 'POST');
    assert.equal(requests[1].options.credentials, 'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF'], 'fresh');
    assert.deepEqual(JSON.parse(requests[1].options.body), input);
  });
}
test('substitution conflict is shown without automatically repeating the write', async () => {
  let writes = 0;
  mock.method(globalThis, 'fetch', async (path) => {
    if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF', token: 'fresh' });
    writes++; return Response.json({ message: 'Izmena nije dozvoljena.' }, { status: 409 });
  });
  await assert.rejects(api.substitute('match','set',{ requestId:'command',version:0,outgoingParticipantId:'out',incomingParticipantId:'in' }), /nije dozvoljena/);
  assert.equal(writes, 1);
});
