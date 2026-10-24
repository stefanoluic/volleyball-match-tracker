import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());

for (const setId of [null, 'set-id']) {
  test('statistics GET is scoped, cancellable and session-based: ' + (setId ?? 'whole match'), async () => {
    const controller = new AbortController();
    const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ matchId: 'match', setId }));
    assert.deepEqual(await api.matchStatistics('match', setId, controller.signal), { matchId: 'match', setId });
    const [path, options] = fetch.mock.calls[0].arguments;
    assert.equal(path, '/api/matches/match/statistics' + (setId ? '?setId=set-id' : ''));
    assert.equal(options.credentials, 'same-origin');
    assert.ok(options.signal instanceof AbortSignal);
    assert.equal(options.method, undefined);
    assert.equal(fetch.mock.callCount(), 1); // No CSRF request or mutation for a read.
  });
}

test('statistics propagates missing-set errors without retrying or altering scope', async () => {
  const fetch = mock.method(globalThis, 'fetch', async () => Response.json({ message: 'Set nije pronađen.' }, { status: 404 }));
  await assert.rejects(api.matchStatistics('match', 'other-set'), /Set nije pronađen/);
  assert.equal(fetch.mock.callCount(), 1);
});
