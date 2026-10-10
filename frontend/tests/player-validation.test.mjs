import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizePlayerInput, positionLabels, positionOptions, validatePlayerInput } from '../src/players/validation.ts';

const valid = { firstName: 'Marko', lastName: 'Marković', jerseyNumber: 7, position: 'SETTER' };

test('exactly five standard positions have Serbian labels', () => {
  assert.deepEqual(Object.keys(positionLabels), ['SETTER', 'OUTSIDE_HITTER', 'OPPOSITE', 'MIDDLE_BLOCKER', 'LIBERO']);
  assert.equal(positionOptions.length, 5);
});
for (const position of Object.keys(positionLabels)) {
  test('accepts primary position ' + position, () => assert.deepEqual(validatePlayerInput({ ...valid, position }), {}));
}
test('names allow Serbian letters, Cyrillic, spaces and hyphens and normalize Unicode', () => {
  assert.deepEqual(normalizePlayerInput({ ...valid, firstName: '  Z\u030celjko-Marko ', lastName: ' Ђорђе Петровић ', jerseyNumber: '12' }),
    { ...valid, firstName: 'Željko-Marko', lastName: 'Ђорђе Петровић', jerseyNumber: 12 });
});
test('rejects blank, overlong or invalid player names', () => {
  for (const field of ['firstName', 'lastName']) {
    for (const value of ['', ' ', 'a'.repeat(101), 'Marko1', 'Marko!', '-Marko', 'Marko--Petar']) {
      assert.ok(validatePlayerInput({ ...valid, [field]: value })[field]);
    }
  }
});
test('jersey must be an integer in the application range 1–99', () => {
  for (const jerseyNumber of ['', ' ', 0, -1, 100, 1.5, '2.5', 'abc', '1e1']) {
    assert.ok(validatePlayerInput({ ...valid, jerseyNumber }).jerseyNumber);
  }
  for (const jerseyNumber of [1, 99, '12']) assert.deepEqual(validatePlayerInput({ ...valid, jerseyNumber }), {});
});
test('requires a known position and rejects inherited property names', () => {
  for (const position of ['', 'UNKNOWN', 'constructor', 'toString']) assert.ok(validatePlayerInput({ ...valid, position }).position);
});
test('normalization cannot silently turn invalid form values into an API payload', () => {
  assert.throws(() => normalizePlayerInput({ ...valid, jerseyNumber: '' }));
});
