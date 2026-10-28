import assert from 'node:assert/strict';
import { test } from 'node:test';
import { api } from '../src/api/client.ts';
import { executeMatchCommand } from '../src/matches/commands.ts';

const revision = { requestId: 'same-request', version: 12 };
const players = { outgoingParticipantId: 'outgoing', incomingParticipantId: 'incoming' };
const cases = [
  { command: { kind: 'add', scoringTeamId: 'home' }, method: 'addPoint', args: [{ ...revision, scoringTeamId: 'home' }] },
  { command: { kind: 'undo', pointId: 'point' }, method: 'undoPoint', args: ['point', revision] },
  { command: { kind: 'substitute', ...players }, method: 'substitute', args: [{ ...revision, ...players }] },
  { command: { kind: 'undoSubstitution', substitutionId: 'substitution' }, method: 'undoSubstitution', args: ['substitution', revision] },
  { command: { kind: 'libero', ...players }, method: 'replaceLibero', args: [{ ...revision, ...players }] },
  { command: { kind: 'undoLibero', replacementId: 'replacement' }, method: 'undoLiberoReplacement', args: ['replacement', revision] },
  { command: { kind: 'finish' }, method: 'finishSet', args: [revision] },
];

for (const entry of cases) {
  test(entry.command.kind + ' sends only its API payload and preserves the command when retrying', async (t) => {
    const command = Object.freeze({ ...entry.command, ...revision });
    const response = Object.freeze({ marker: 'server response' });
    const failure = new Error('Response lost after write');
    let fail = false;
    const calls = new Map(cases.map(({ method }) => [method, t.mock.method(api, method, async () => {
      if (method !== entry.method) assert.fail('Unexpected API call: ' + method);
      if (fail) throw failure;
      return response;
    })]));
    const expected = command.kind === 'finish'
      ? { kind: 'finish', preparation: response }
      : { kind: 'score', score: response };

    assert.deepEqual(await executeMatchCommand('match', 'set', command), expected);
    fail = true;
    await assert.rejects(executeMatchCommand('match', 'set', command), (error) => error === failure);
    assert.equal(calls.get(entry.method).mock.callCount(), 2, 'failure must not trigger an automatic retry');
    fail = false;
    assert.deepEqual(await executeMatchCommand('match', 'set', command), expected);

    for (const [method, stub] of calls) {
      assert.equal(stub.mock.callCount(), method === entry.method ? 3 : 0);
      for (const call of stub.mock.calls) assert.deepEqual(call.arguments, ['match', 'set', ...entry.args]);
    }
    assert.deepEqual(command, { ...entry.command, ...revision });
  });
}

for (const participantId of ['player', null, undefined]) {
  test('detailed points preserve the action and normalize participant: ' + participantId, async (t) => {
    const response = { version: 13 };
    const stub = t.mock.method(api, 'addPoint', async () => response);
    const command = Object.freeze({ kind: 'add', ...revision, scoringTeamId: 'home', actionType: 'ATTACK', participantId });
    assert.deepEqual(await executeMatchCommand('match', 'set', command), { kind: 'score', score: response });
    assert.deepEqual(stub.mock.calls[0].arguments, ['match', 'set', {
      ...revision, scoringTeamId: 'home', actionType: 'ATTACK', participantId: participantId ?? null,
    }]);
  });
}
