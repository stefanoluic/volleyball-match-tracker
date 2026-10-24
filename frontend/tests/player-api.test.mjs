import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());
const input = { firstName: 'Marko', lastName: 'Marković', jerseyNumber: 7, position: 'SETTER' };
for (const [method, call] of [
  ['POST', () => api.createPlayer('team-id', input)],
  ['PUT', () => api.updatePlayer('team-id', 'player-id', input)],
  ['DELETE', () => api.deletePlayer('team-id', 'player-id')],
]) {
  test('player write uses ' + method + ' and a fresh CSRF token', async () => {
    const requests = [];
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });
      return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 'player-id' });
    });
    await call();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].path, '/api/teams/team-id/players' + (method === 'POST' ? '' : '/player-id'));
    assert.equal(requests[1].options.method, method);
    assert.equal(requests[1].options.credentials, 'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'test-token');
    if (method !== 'DELETE') assert.deepEqual(JSON.parse(requests[1].options.body), input);
    else assert.equal(requests[1].options.body, undefined);
  });
}
test('roster is scoped to a team, paginated and cancellable', async () => {
  const controller = new AbortController();
  let request;
  mock.method(globalThis, 'fetch', async (path, options) => {
    request = { path, options };
    return Response.json({ content: [] });
  });
  await api.players('team-id', 2, controller.signal);
  assert.equal(request.path, '/api/teams/team-id/players?page=2&size=20');
  assert.ok(request.options.signal instanceof AbortSignal);
});
test('single team read supports aborting stale navigation', async () => {
  const controller = new AbortController();
  let request;
  mock.method(globalThis, 'fetch', async (path, options) => {
    request = { path, options };
    return Response.json({ id: 'team-id' });
  });
  await api.team('team-id', controller.signal);
  assert.equal(request.path, '/api/teams/team-id');
  assert.ok(request.options.signal instanceof AbortSignal);
});
