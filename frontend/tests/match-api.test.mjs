import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());
const input = { homeTeamId: 'home', awayTeamId: 'away', scheduledAt: '2026-10-15T16:30:00Z' };
for (const [method, call] of [
  ['POST', () => api.createMatch(input)],
  ['PUT', () => api.updateMatch('match-id', input)],
  ['DELETE', () => api.deleteMatch('match-id')],
]) {
  test('match write uses ' + method + ' with a fresh CSRF token', async () => {
    const requests = [];
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'fresh' });
      return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 'match-id' });
    });
    await call();
    assert.equal(requests[1].path, '/api/matches' + (method === 'POST' ? '' : '/match-id'));
    assert.equal(requests[1].options.method, method);
    assert.equal(requests[1].options.credentials, 'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'fresh');
    if (method !== 'DELETE') assert.deepEqual(JSON.parse(requests[1].options.body), input);
  });
}
test('match list and single match support cancelling requests', async () => {
  const requests = [];
  const controller = new AbortController();
  mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    return Response.json({});
  });
  await api.matches(2, controller.signal);
  await api.match('match-id', controller.signal);
  assert.equal(requests[0].path, '/api/matches?page=2&size=20');
  assert.equal(requests[1].path, '/api/matches/match-id');
  assert.ok(requests[0].options.signal instanceof AbortSignal);
});
test('team selection loads all pages, not just the first twenty teams', async () => {
  const paths = [];
  const controller = new AbortController();
  mock.method(globalThis, 'fetch', async (path, options) => {
    paths.push(path);
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ content: [{ id: String(paths.length) }], totalPages: 2 });
  });
  assert.deepEqual(await api.teamOptions(controller.signal), [{ id: '1' }, { id: '2' }]);
  assert.deepEqual(paths, ['/api/teams?page=0&size=100', '/api/teams?page=1&size=100']);
});
test('team selection does not silently use a partial list when another page fails', async () => {
  mock.method(globalThis, 'fetch', async (path) => path.includes('page=0')
    ? Response.json({ content: [{ id: '1' }], totalPages: 2 })
    : Response.json({ message: 'Nije dostupno.' }, { status: 503 }));
  await assert.rejects(api.teamOptions(), /Nije dostupno/);
});
