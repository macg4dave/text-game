import type { PlayerState, SaveSlotSummary, SessionDebugPayload, SetupStatus, TurnDebugPayload } from "./contracts.js";
import type { FatalUiErrorState } from "./global-error.js";

export interface AppState {
  playerId: string;
  playerName: string;
  player: PlayerState | null;
  sessionDebug: SessionDebugPayload | null;
  lastTurnDebug: TurnDebugPayload | null;
  setupStatus: SetupStatus | null;
  setupError: string | null;
  saveSlots: SaveSlotSummary[];
  saveSlotsError: string | null;
  currentSaveSlotId: string | null;
  assistTimer: number | null;
  hasEnteredFlow: boolean;
  pending: boolean;
  fatalError: FatalUiErrorState | null;
}

export function createInitialAppState(params: {
  playerId: string;
  playerName: string;
  fatalError: FatalUiErrorState | null;
}): AppState {
  return {
    playerId: params.playerId,
    playerName: params.playerName,
    player: null,
    sessionDebug: null,
    lastTurnDebug: null,
    setupStatus: null,
    setupError: null,
    saveSlots: [],
    saveSlotsError: null,
    currentSaveSlotId: null,
    assistTimer: null,
    hasEnteredFlow: false,
    pending: false,
    fatalError: params.fatalError
  };
}

export function hasSavedSession(state: Pick<AppState, "playerId">): boolean {
  return Boolean(state.playerId);
}

export function isSetupReady(state: Pick<AppState, "setupStatus">): boolean {
  return state.setupStatus?.status === "ready";
}
