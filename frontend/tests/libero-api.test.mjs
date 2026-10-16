import assert from 'node:assert/strict';
import { afterEach, mock, test } from 'node:test';
import { api } from '../src/api/client.ts';
afterEach(() => mock.restoreAll());
for (const undo of [false,true]) test((undo ? 'undo libero replacement':'libero replacement')+' sends scoped command with session and fresh CSRF',async()=>{
  const requests=[];
  const input={requestId:'same-id',version:8,...(undo ? {}:{outgoingParticipantId:'out',incomingParticipantId:'in'})};
  mock.method(globalThis,'fetch',async(path,options)=>{
    requests.push({path,options});
    return Response.json(path==='/api/auth/csrf' ? {headerName:'X-CSRF',token:'fresh'}:{version:9});
  });
  const result=undo ? await api.undoLiberoReplacement('match','set','replacement',input):await api.replaceLibero('match','set',input);
  assert.deepEqual(result,{version:9});
  assert.equal(requests[0].path,'/api/auth/csrf');
  assert.equal(requests[1].path,'/api/matches/match/sets/set/libero-replacements'+(undo ? '/replacement/undo':''));
  assert.equal(requests[1].options.credentials,'same-origin');
  assert.equal(requests[1].options.method,'POST'); assert.equal(requests[1].options.headers['X-CSRF'],'fresh');
  assert.deepEqual(JSON.parse(requests[1].options.body),input);
});
test('libero conflict is reported without an implicit retry',async()=>{
  let writes=0;
  mock.method(globalThis,'fetch',async(path)=>{
    if(path==='/api/auth/csrf')return Response.json({headerName:'X-CSRF',token:'fresh'});
    writes++; return Response.json({message:'Zamena libera nije dozvoljena.'},{status:409});
  });
  await assert.rejects(api.replaceLibero('match','set',{requestId:'id',version:0,outgoingParticipantId:'out',incomingParticipantId:'in'}),/nije dozvoljena/);
  assert.equal(writes,1);
});
