import { api, type AddPointInput, type MatchPreparation, type SetScore, type SubstituteInput, type UndoPointInput } from '../api/client.ts';

export type AddPointCommand = AddPointInput & { kind: 'add' };
export type SubstitutionCommand =
  | (SubstituteInput & { kind: 'substitute' })
  | (UndoPointInput & { kind: 'undoSubstitution'; substitutionId: string });
export type LiberoCommand =
  | (SubstituteInput & { kind: 'libero' })
  | (UndoPointInput & { kind: 'undoLibero'; replacementId: string });
export type MatchCommand = AddPointCommand | SubstitutionCommand | LiberoCommand
  | (UndoPointInput & { kind: 'undo'; pointId: string })
  | (UndoPointInput & { kind: 'finish' });

type CommandResult =
  | { kind: 'score'; score: SetScore }
  | { kind: 'finish'; preparation: MatchPreparation };

export async function executeMatchCommand(matchId: string, setId: string, command: MatchCommand): Promise<CommandResult> {
  const revision = { requestId: command.requestId, version: command.version };
  switch (command.kind) {
    case 'add':
      return { kind: 'score', score: await api.addPoint(matchId, setId, {
        ...revision, scoringTeamId: command.scoringTeamId,
        ...(command.actionType !== undefined ? { actionType: command.actionType, participantId: command.participantId ?? null } : {}),
      }) };
    case 'undo':
      return { kind: 'score', score: await api.undoPoint(matchId, setId, command.pointId, revision) };
    case 'substitute':
      return { kind: 'score', score: await api.substitute(matchId, setId, {
        ...revision, outgoingParticipantId: command.outgoingParticipantId, incomingParticipantId: command.incomingParticipantId,
      }) };
    case 'undoSubstitution':
      return { kind: 'score', score: await api.undoSubstitution(matchId, setId, command.substitutionId, revision) };
    case 'libero':
      return { kind: 'score', score: await api.replaceLibero(matchId, setId, {
        ...revision, outgoingParticipantId: command.outgoingParticipantId, incomingParticipantId: command.incomingParticipantId,
      }) };
    case 'undoLibero':
      return { kind: 'score', score: await api.undoLiberoReplacement(matchId, setId, command.replacementId, revision) };
    case 'finish':
      return { kind: 'finish', preparation: await api.finishSet(matchId, setId, revision) };
    default:
      return unsupportedCommand(command);
  }
}

function unsupportedCommand(_command: never): never {
  throw new Error('Nepoznata komanda za utakmicu.');
}
