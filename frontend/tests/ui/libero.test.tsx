import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchSet, type SetScore, type Team } from '../../src/api/client';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';
const home:Team={id:'home',name:'Vojvodina',city:'Novi Sad',createdAt:'2026-10-15T12:00:00Z'};
const away:Team={...home,id:'away',name:'Partizan'};
const match:Match={id:'match',homeTeam:home,awayTeam:away,status:'LIVE',scheduledAt:home.createdAt,createdAt:home.createdAt};
function player(team:Team,n:number):MatchPlayer {
  return {id:team.id+'-'+n,playerId:team.id+'-player-'+n,teamId:team.id,firstName:'Marko',lastName:'Marković',jerseyNumber:n,
    position:n>=10 ? 'LIBERO':'SETTER',isLibero:n>=10};
}
const hp=Array.from({length:11},(_,i)=>player(home,i+1)),ap=Array.from({length:11},(_,i)=>player(away,i+1));
const set:MatchSet={id:'set',number:1,status:'LIVE',homeScore:0,awayScore:0,firstServingTeamId:home.id,startedAt:home.createdAt,
  homeLineup:hp.slice(0,6).map((participant,i)=>({participant,rotationPosition:i+1})),
  awayLineup:ap.slice(0,6).map((participant,i)=>({participant,rotationPosition:i+1})),scoreVersion:0,finishedAt:null,winnerTeamId:null};
const initial:SetScore={setId:set.id,version:0,homeScore:0,awayScore:0,matchStatus:'LIVE',setStatus:'LIVE',canRecord:true,
  lastActivePoint:null,points:[],canUndo:false,canFinish:false,winnerTeamId:null,
  court:{servingTeamId:home.id,server:hp[0],homeLineup:set.homeLineup,awayLineup:set.awayLineup},
  substitutions:{homeUsed:0,awayUsed:0,options:[{teamId:home.id,startingPosition:1,outgoing:hp[0],incoming:[hp[6]]}],history:[],undoableId:null,pointUndoBlocked:false},
  libero:{active:[],options:[{teamId:home.id,startingPosition:5,regularParticipantId:hp[4].id,outgoing:hp[4],incoming:[hp[9],hp[10]]}],
    history:[],undoableId:null,mustExit:false}};
const entry={id:'replacement',teamId:home.id,outgoing:hp[4],incoming:hp[9],homeScore:0,awayScore:0,createdAt:home.createdAt,cancelledAt:null};
const entered:SetScore={...initial,version:1,court:{...initial.court!,homeLineup:set.homeLineup.map(row=>row.rotationPosition===5 ? {...row,participant:hp[9]}:row)},
  libero:{active:[{teamId:home.id,libero:hp[9],regular:hp[4],rotationPosition:5,mustExit:false}],options:[],history:[entry],undoableId:entry.id,mustExit:false}};
const waiting:SetScore={...entered,version:3,homeScore:1,awayScore:1,canRecord:false,canUndo:true,
  court:{...entered.court!,servingTeamId:null,server:null,homeLineup:entered.court!.homeLineup.map(row=>({...row,rotationPosition:(row.rotationPosition+4)%6+1})).sort((a,b)=>a.rotationPosition-b.rotationPosition)},
  substitutions:{...initial.substitutions!,options:[]},
  libero:{...entered.libero!,active:[{...entered.libero!.active[0],rotationPosition:4,mustExit:true}],mustExit:true,undoableId:null,
    options:[{teamId:home.id,startingPosition:5,regularParticipantId:hp[4].id,outgoing:hp[9],incoming:[hp[4]]}]}};
const exited:SetScore={...waiting,version:4,canRecord:true,court:{...waiting.court!,servingTeamId:home.id,server:hp[1],
  homeLineup:waiting.court!.homeLineup.map(row=>row.participant.id===hp[9].id ? {...row,participant:hp[4]}:row)},
  libero:{active:[],options:[],history:[{...entry,id:'exit',outgoing:hp[9],incoming:hp[4]},entry],undoableId:'exit',mustExit:false}};
const cancelled:SetScore={...initial,version:2,libero:{...initial.libero!,history:[{...entry,cancelledAt:home.createdAt}]}};
beforeEach(()=>{vi.spyOn(api,'setScore').mockResolvedValue(initial);vi.spyOn(notifications,'show').mockReturnValue('notice');});
afterEach(()=>vi.restoreAllMocks());
function renderBoard(canManage=true) {
  const busy=vi.fn();
  render(<MantineProvider theme={theme} env="test"><MatchScoreboard match={match} set={set} canManage={canManage} onBusyChange={busy}/></MantineProvider>);
  return busy;
}
async function enabledButton(name:string) {
  const button=await screen.findByRole('button',{name});
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
  return button;
}
async function choose(out=5,incoming=10) {
  fireEvent.click(await enabledButton('Ulazak / izlazak libera'));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji izlazi zbog/}));
  fireEvent.click(await screen.findByRole('option',{name:'Vojvodina · #'+out+' Marko Marković'}));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji ulazi zbog/}));
  fireEvent.click(await screen.findByRole('option',{name:'#'+incoming+' Marko Marković'}));
  fireEvent.click(screen.getByRole('button',{name:'Pregledaj zamenu libera'}));
}
test('entry is inline, requires selection and confirmation, and does not consume ordinary count',async()=>{
  const write=vi.spyOn(api,'replaceLibero').mockResolvedValue(entered);
  const busy=renderBoard();
  fireEvent.click(await enabledButton('Ulazak / izlazak libera'));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Pregledaj zamenu libera'}));
  expect(await screen.findByText('Izaberite dozvoljeni par igrača za zamenu libera.')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Unesi izmenu'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Poen za domaćina'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Osveži rezultat'}) as HTMLButtonElement).disabled).toBe(true);
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Odustani od zamene libera'}));
  await choose();expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi zamenu libera'}));
  await screen.findByText('Vojvodina: libero #10 Marko Marković umesto #5 Marko Marković · pozicija 5');
  expect(screen.getByText('Vojvodina: 0/6')).toBeTruthy();expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  expect(write).toHaveBeenCalledExactlyOnceWith(match.id,set.id,{requestId:expect.any(String),version:0,outgoingParticipantId:hp[4].id,incomingParticipantId:hp[9].id});
  await waitFor(()=>expect(busy).toHaveBeenLastCalledWith(false));
});
test('mandatory exit blocks next point and only offers covered player, not second libero',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(waiting);vi.spyOn(api,'replaceLibero').mockResolvedValue(exited);
  renderBoard();await screen.findByText('Obavezan izlazak libera');
  expect(screen.getByText('Pre narednog servisa potreban je izlazak libera.')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Poen za domaćina'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Unesi izmenu'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(await enabledButton('Ulazak / izlazak libera'));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji izlazi zbog/}));
  fireEvent.click(await screen.findByRole('option',{name:'Vojvodina · #10 Marko Marković'}));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji ulazi zbog/}));
  expect(screen.queryByRole('option',{name:'#11 Marko Marković'})).toBeNull();
  fireEvent.click(await screen.findByRole('option',{name:'#5 Marko Marković'}));
  fireEvent.click(screen.getByRole('button',{name:'Pregledaj zamenu libera'}));fireEvent.click(screen.getByRole('button',{name:'Potvrdi zamenu libera'}));
  await screen.findByText('Na servisu: Vojvodina · #2 Marko Marković');
  expect(screen.queryByText('Obavezan izlazak libera')).toBeNull();
  await enabledButton('Poen za domaćina');
});
test('uncertain entry retries identical command and preserves version and player IDs',async()=>{
  const write=vi.spyOn(api,'replaceLibero').mockRejectedValueOnce(new Error('lost')).mockResolvedValue(entered);
  renderBoard();await choose();fireEvent.click(screen.getByRole('button',{name:'Potvrdi zamenu libera'}));
  fireEvent.click(await screen.findByRole('button',{name:'Ponovi isti zahtev'}));
  await screen.findByText('Vojvodina: libero #10 Marko Marković umesto #5 Marko Marković · pozicija 5');
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
});
test('pending entry cannot be submitted twice or cancelled',async()=>{
  let resolve!:(score:SetScore)=>void;
  const write=vi.spyOn(api,'replaceLibero').mockReturnValue(new Promise(done=>{resolve=done;}));
  renderBoard();await choose();const submit=screen.getByRole('button',{name:'Potvrdi zamenu libera'});
  fireEvent.click(submit);fireEvent.click(submit);await waitFor(()=>expect(write).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('button',{name:'Odustani od zamene libera'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>resolve(entered));await screen.findByText('Vojvodina: libero #10 Marko Marković umesto #5 Marko Marković · pozicija 5');
});
test('stale request keeps selection until cancel and explicit refresh',async()=>{
  vi.spyOn(api,'replaceLibero').mockRejectedValue(new ApiError('Stanje seta je promenjeno.',409));
  renderBoard();await choose();fireEvent.click(screen.getByRole('button',{name:'Potvrdi zamenu libera'}));
  await screen.findByText('Stanje seta je promenjeno.');
  expect((screen.getByRole('combobox',{name:/^Igrač koji ulazi zbog/}) as HTMLInputElement).value).toBe('#10 Marko Marković');
  fireEvent.click(screen.getByRole('button',{name:'Odustani od zamene libera'}));
  fireEvent.click(screen.getByRole('button',{name:'Osveži rezultat'}));
  await waitFor(()=>expect(screen.queryByText('Stanje seta je promenjeno.')).toBeNull());
});
test('undo restores previous court and leaves cancelled history entry',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(entered);const undo=vi.spyOn(api,'undoLiberoReplacement').mockResolvedValue(cancelled);
  renderBoard();fireEvent.click(await enabledButton('Poništi zamenu libera'));
  expect(undo).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button',{name:'Potvrdi poništavanje zamene libera'}));
  await screen.findByText('Poništena zamena libera');expect(screen.getByText('Nema libera u prikazanim šestorkama.')).toBeTruthy();
  expect(undo).toHaveBeenCalledExactlyOnceWith(match.id,set.id,entry.id,{requestId:expect.any(String),version:1});
});
test('uncertain undo retries original replacement and version',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(entered);
  const undo=vi.spyOn(api,'undoLiberoReplacement').mockRejectedValueOnce(new Error('lost')).mockResolvedValue(cancelled);
  renderBoard();fireEvent.click(await enabledButton('Poništi zamenu libera'));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi poništavanje zamene libera'}));
  fireEvent.click(await screen.findByRole('button',{name:'Ponovi isti zahtev'}));
  await screen.findByText('Poništena zamena libera');expect(undo.mock.calls[1]).toEqual(undo.mock.calls[0]);
});
test('coach sees pending exit and active libero without replacement controls',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(waiting);renderBoard(false);await screen.findByText('Obavezan izlazak libera');
  expect(screen.queryByRole('button',{name:'Ulazak / izlazak libera'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Poništi zamenu libera'})).toBeNull();
});
test('finished set shows historical libero without write controls',async()=>{
  vi.mocked(api.setScore).mockResolvedValue({...entered,setStatus:'FINISHED',canRecord:false});
  renderBoard();await screen.findByText('Vojvodina: libero #10 Marko Marković umesto #5 Marko Marković · pozicija 5');
  expect(screen.queryByRole('button',{name:'Ulazak / izlazak libera'})).toBeNull();
});
