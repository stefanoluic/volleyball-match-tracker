import assert from 'node:assert/strict';
import { afterEach, beforeEach, mock, test } from 'node:test';
import { api, ApiError } from '../src/api/client.ts';

const originalWindow = globalThis.window;
const csrfResponse = () => Response.json({ headerName: 'X-CSRF-TOKEN', token: 'test-token' });

beforeEach(() => { globalThis.window = new EventTarget(); });
afterEach(() => {
  globalThis.window = originalWindow;
  mock.restoreAll();
});

test('deletion sends DELETE with session cookie and a fresh CSRF token', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (path, options) => {
    requests.push({ path, options });
    return path === '/api/auth/csrf' ? csrfResponse() : new Response(null, { status: 204 });
  });
  assert.equal(await api.deleteUser('blocked-user-id'), undefined);
  assert.equal(requests.length, 2);
  assert.equal(requests[0].path, '/api/auth/csrf');
  assert.equal(requests[1].path, '/api/admin/users/blocked-user-id');
  assert.equal(requests[1].options.method, 'DELETE');
  assert.equal(requests[1].options.credentials, 'same-origin');
  assert.equal(requests[1].options.headers['X-CSRF-TOKEN'], 'test-token');
  assert.equal(requests[1].options.body, undefined);
});

for (const status of [403, 409]) {
  test('deletion reports backend rejection without expiring the session: ' + status, async () => {
    let expired = false;
    window.addEventListener('session-expired', () => { expired = true; });
    mock.method(globalThis, 'fetch', async (path) => path === '/api/auth/csrf'
      ? csrfResponse() : Response.json({ message: 'Brisanje nije dozvoljeno.' }, { status }));
    await assert.rejects(api.deleteUser('user-id'), (error) =>
      error instanceof ApiError && error.status === status && error.message === 'Brisanje nije dozvoljeno.');
    assert.equal(expired, false);
  });
}

test('deletion notifies the app when the session has expired', async () => {
  let expired = false;
  window.addEventListener('session-expired', () => { expired = true; });
  mock.method(globalThis, 'fetch', async (path) => path === '/api/auth/csrf'
    ? csrfResponse() : Response.json({ message: 'Potrebna je prijava.' }, { status: 401 }));
  await assert.rejects(api.deleteUser('user-id'), (error) => error instanceof ApiError && error.status === 401);
  assert.equal(expired, true);
});

test('deletion is not sent if obtaining the CSRF token fails', async () => {
  const requests = [];
  mock.method(globalThis, 'fetch', async (path) => {
    requests.push(path);
    return Response.json({ message: 'Zahtev nije dozvoljen.' }, { status: 403 });
  });
  await assert.rejects(api.deleteUser('user-id'), ApiError);
  assert.deepEqual(requests, ['/api/auth/csrf']);
});

test('existing login still uses a form-encoded POST and does not expire the session on bad credentials', async () => {
  let expired = false;
  window.addEventListener('session-expired', () => { expired = true; });
  let loginRequest;
  mock.method(globalThis, 'fetch', async (path, options) => {
    if (path === '/api/auth/csrf') return csrfResponse();
    loginRequest = options;
    return Response.json({ message: 'Pogrešan mejl ili lozinka.' }, { status: 401 });
  });
  await assert.rejects(api.login(' user@example.com ', 'wrong-password'), ApiError);
  assert.equal(loginRequest.method, 'POST');
  assert.equal(loginRequest.headers['Content-Type'], 'application/x-www-form-urlencoded');
  assert.equal(new URLSearchParams(loginRequest.body).get('email'), 'user@example.com');
  assert.equal(expired, false);
});
