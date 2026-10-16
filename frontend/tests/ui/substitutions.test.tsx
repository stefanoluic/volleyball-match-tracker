import { MantineProvider } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { api, ApiError, type Match, type MatchPlayer, type MatchSet, type SetScore, type Team } from '../../src/api/client';
import { MatchScoreboard } from '../../src/matches/MatchScoreboard';
import { theme } from '../../src/theme';

const home: Team = { id:'home',name:'Vojvodina',city:'Novi Sad',createdAt:'2026-10-15T12:00:00Z' };
const away: Team = { ...home,id:'away',name:'Partizan' };
const match: Match = { id:'match',homeTeam:home,awayTeam:away,status:'LIVE',scheduledAt:home.createdAt,createdAt:home.createdAt };
function player(team: Team, n: number): MatchPlayer {
  return { id:team.id+'-'+n,playerId:team.id+'-player-'+n,teamId:team.id,firstName:'Marko',lastName:'Marković',jerseyNumber:n,position:'SETTER',isLibero:false };
}
const hp = Array.from({length:8},(_,i)=>player(home,i+1)), ap=Array.from({length:8},(_,i)=>player(away,i+1));
const set: MatchSet = { id:'set',number:1,status:'LIVE',homeScore:0,awayScore:0,firstServingTeamId:home.id,
  startedAt:home.createdAt,homeLineup:hp.slice(0,6).map((participant,i)=>({participant,rotationPosition:i+1})),
  awayLineup:ap.slice(0,6).map((participant,i)=>({participant,rotationPosition:i+1})),scoreVersion:0,finishedAt:null,winnerTeamId:null };
const initial: SetScore = { setId:set.id,version:0,homeScore:0,awayScore:0,matchStatus:'LIVE',setStatus:'LIVE',
  canRecord:true,lastActivePoint:null,points:[],canUndo:false,canFinish:false,winnerTeamId:null,libero:null,
  court:{servingTeamId:home.id,server:hp[0],homeLineup:set.homeLineup,awayLineup:set.awayLineup},
  substitutions:{homeUsed:0,awayUsed:0,options:[{teamId:home.id,startingPosition:1,outgoing:hp[0],incoming:[hp[6]]}],history:[],undoableId:null,pointUndoBlocked:false} };
const entry = { id:'sub',teamId:home.id,outgoing:hp[0],incoming:hp[6],homeScore:0,awayScore:0,createdAt:home.createdAt,cancelledAt:null };
const changed: SetScore = { ...initial,version:1,court:{...initial.court!,server:hp[6],
  homeLineup:initial.court!.homeLineup.map(row=>row.rotationPosition===1 ? {...row,participant:hp[6]}:row)},
  substitutions:{...initial.substitutions!,homeUsed:1,options:[],history:[entry],undoableId:entry.id} };
const cancelled: SetScore = { ...initial,version:2,substitutions:{...initial.substitutions!,history:[{...entry,cancelledAt:home.createdAt}]} };
beforeEach(()=>{
  vi.spyOn(api,'setScore').mockResolvedValue(initial);
  vi.spyOn(notifications,'show').mockReturnValue('notice');
});
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
async function openAndSelect() {
  fireEvent.click(await enabledButton('Unesi izmenu'));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji izlazi/}));
  fireEvent.click(await screen.findByRole('option',{name:'#1 Marko Marković'}));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji ulazi/}));
  fireEvent.click(await screen.findByRole('option',{name:'#7 Marko Marković'}));
  fireEvent.click(screen.getByRole('button',{name:'Pregledaj izmenu'}));
}
test('inline substitution validates selection and does not write until confirmed',async()=>{
  const write=vi.spyOn(api,'substitute').mockResolvedValue(changed);
  const busy=renderBoard();
  fireEvent.click(await enabledButton('Unesi izmenu'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect((screen.getByRole('button',{name:'Poen za domaćina'}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Osveži rezultat'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Pregledaj izmenu'}));
  expect(await screen.findByText('Izaberite igrača koji izlazi i dozvoljenog igrača koji ulazi.')).toBeTruthy();
  expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Odustani od izmene'}));
  await openAndSelect(); expect(write).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi izmenu'}));
  await screen.findByText('Na servisu: Vojvodina · #7 Marko Marković');
  expect(write).toHaveBeenCalledExactlyOnceWith(match.id,set.id,{requestId:expect.any(String),version:0,outgoingParticipantId:hp[0].id,incomingParticipantId:hp[6].id});
  expect(screen.getByText('Vojvodina: 1/6')).toBeTruthy();
  expect(screen.getByText('Vojvodina 0 : 0 Partizan')).toBeTruthy();
  expect(screen.queryByRole('form',{name:'Nova izmena'})).toBeNull();
  await waitFor(()=>expect(busy).toHaveBeenLastCalledWith(false));
});
test('incoming selection contains only replacements allowed by backend',async()=>{
  renderBoard();
  fireEvent.click(await enabledButton('Unesi izmenu'));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji izlazi/}));
  fireEvent.click(await screen.findByRole('option',{name:'#1 Marko Marković'}));
  fireEvent.click(screen.getByRole('combobox',{name:/^Igrač koji ulazi/}));
  expect(await screen.findByRole('option',{name:'#7 Marko Marković'})).toBeTruthy();
  expect(screen.queryByRole('option',{name:'#8 Marko Marković'})).toBeNull();
});
test('uncertain substitution retries the identical command without enabling point entry',async()=>{
  const write=vi.spyOn(api,'substitute').mockRejectedValueOnce(new Error('lost')).mockResolvedValue(changed);
  renderBoard(); await openAndSelect();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi izmenu'}));
  fireEvent.click(await screen.findByRole('button',{name:'Ponovi isti zahtev'}));
  await screen.findByText('Na servisu: Vojvodina · #7 Marko Marković');
  expect(write.mock.calls[1]).toEqual(write.mock.calls[0]);
  expect(write).toHaveBeenCalledTimes(2);
});
test('stale write keeps entered selections and requires cancel plus refresh before new changes',async()=>{
  const write=vi.spyOn(api,'substitute').mockRejectedValue(new ApiError('Stanje seta je promenjeno.',409));
  renderBoard(); await openAndSelect();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi izmenu'}));
  await screen.findByText('Stanje seta je promenjeno.');
  expect((screen.getByRole('combobox',{name:/^Igrač koji ulazi/}) as HTMLInputElement).value).toBe('#7 Marko Marković');
  expect(screen.queryByRole('button',{name:'Ponovi isti zahtev'})).toBeNull();
  fireEvent.click(screen.getByRole('button',{name:'Odustani od izmene'}));
  fireEvent.click(screen.getByRole('button',{name:'Osveži rezultat'}));
  await waitFor(()=>expect(screen.queryByText('Stanje seta je promenjeno.')).toBeNull());
  expect(write).toHaveBeenCalledTimes(1);
});
test('pending substitution prevents double submission and disables cancellation',async()=>{
  let resolve!:(score:SetScore)=>void;
  const write=vi.spyOn(api,'substitute').mockReturnValue(new Promise(done=>{resolve=done;}));
  renderBoard(); await openAndSelect();
  const submit=screen.getByRole('button',{name:'Potvrdi izmenu'});
  fireEvent.click(submit); fireEvent.click(submit);
  await waitFor(()=>expect(write).toHaveBeenCalledTimes(1));
  expect((screen.getByRole('button',{name:'Odustani od izmene'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>resolve(changed));
  await screen.findByText('Na servisu: Vojvodina · #7 Marko Marković');
});
test('undo needs confirmation, restores player and keeps cancelled entry visible',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(changed);
  const undo=vi.spyOn(api,'undoSubstitution').mockResolvedValue(cancelled);
  renderBoard(); fireEvent.click(await enabledButton('Poništi poslednju izmenu'));
  expect(undo).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi poništavanje izmene'}));
  await screen.findByText('Na servisu: Vojvodina · #1 Marko Marković');
  expect(screen.getByText('Poništena izmena')).toBeTruthy();
  expect(undo).toHaveBeenCalledExactlyOnceWith(match.id,set.id,entry.id,{requestId:expect.any(String),version:1});
});
test('uncertain undo retries the same substitution ID and version',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(changed);
  const undo=vi.spyOn(api,'undoSubstitution').mockRejectedValueOnce(new Error('lost')).mockResolvedValue(cancelled);
  renderBoard(); fireEvent.click(await enabledButton('Poništi poslednju izmenu'));
  fireEvent.click(screen.getByRole('button',{name:'Potvrdi poništavanje izmene'}));
  fireEvent.click(await screen.findByRole('button',{name:'Ponovi isti zahtev'}));
  await screen.findByText('Na servisu: Vojvodina · #1 Marko Marković');
  expect(undo.mock.calls[1]).toEqual(undo.mock.calls[0]);
});
test('coach reads counts and history without substitution controls',async()=>{
  vi.mocked(api.setScore).mockResolvedValue(changed);
  renderBoard(false); await screen.findByText('Vojvodina: 1/6');
  expect(screen.getByText('Vojvodina · #1 Marko Marković → #7 Marko Marković')).toBeTruthy();
  expect(screen.queryByRole('button',{name:'Unesi izmenu'})).toBeNull();
  expect(screen.queryByRole('button',{name:'Poništi poslednju izmenu'})).toBeNull();
});
test('finished set only displays history and no substitution actions',async()=>{
  vi.mocked(api.setScore).mockResolvedValue({...changed,setStatus:'FINISHED',canRecord:false,canUndo:false});
  renderBoard(); await screen.findByText('Vojvodina: 1/6');
  expect(screen.queryByRole('button',{name:'Unesi izmenu'})).toBeNull();
});
