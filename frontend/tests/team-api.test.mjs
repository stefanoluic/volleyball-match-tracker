import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';

afterEach(() => mock.restoreAll());

for (const [method, call] of [
  ['POST', () => api.createTeam({ name: 'Team', city: 'Novi Sad' })],
  ['PUT', () => api.updateTeam('team-id', { name: 'Team', city: 'Novi Sad' })],
  ['DELETE', () => api.deleteTeam('team-id')],
]) {
  test('team mutation sends ' + method + ' with a fresh CSRF token', async () => {
    const requests = [];
    mock.method(globalThis, 'fetch', async (path, options) => {
      requests.push({ path, options });
      if (path === '/api/auth/csrf') return Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });
      return method === 'DELETE' ? new Response(null, { status: 204 }) : Response.json({ id: 'team-id' });
    });
    await call();
    assert.equal(requests.length, 2);
    assert.equal(requests[1].path, method === 'POST' ? '/api/teams' : '/api/teams/team-id');
    assert.equal(requests[1].options.method, method);
    assert.equal(requests[1].options.credentials, 'same-origin');
    assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'test-token');
    if (method !== 'DELETE') {
      assert.equal(requests[1].options.headers['Content-Type'], 'application/json');
      assert.deepEqual(JSON.parse(requests[1].options.body), { name: 'Team', city: 'Novi Sad' });
    } else assert.equal(requests[1].options.body, undefined);
  });
}

test('team list uses pagination and supports cancelling stale requests', async () => {
  const controller = new AbortController();
  let request;
  mock.method(globalThis, 'fetch', async (path, options) => {
    request = { path, options };
    return Response.json({ content: [], totalElements: 0 });
  });
  await api.teams(2, controller.signal);
  assert.equal(request.path, '/api/teams?page=2&size=20');
  assert.ok(request.options.signal instanceof AbortSignal);
  assert.equal(request.options.credentials, 'same-origin');
});
