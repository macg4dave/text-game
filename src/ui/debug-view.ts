import type { PlayerState, SessionDebugPayload, SetupStatus, TurnDebugPayload } from "./contracts.js";
import type { FatalUiErrorState } from "./global-error.js";

export interface DebugViewElements {
  connectionDebugEl: HTMLElement;
  stateDebugEl: HTMLElement;
  turnDebugEl: HTMLElement;
}

export interface DebugViewState {
  setupStatus: SetupStatus | null;
  sessionDebug: SessionDebugPayload | null;
  lastTurnDebug: TurnDebugPayload | null;
  player: PlayerState | null;
  fatalError: FatalUiErrorState | null;
  activeFatalUiError: FatalUiErrorState | null;
}

export interface DebugSnapshot {
  connectionSnapshot: {
    setup: SetupStatus | null;
    runtime: Record<string, unknown> | null;
    session: Record<string, unknown> | null;
    last_request_id: string | null;
    fatal_error: FatalUiErrorState | null;
  };
  player: PlayerState | null;
  turn: TurnDebugPayload | null;
}

export function renderDebugPanels(elements: DebugViewElements, state: DebugViewState): void {
  const snapshot = createDebugSnapshot(state);

  elements.connectionDebugEl.textContent = formatJson(snapshot.connectionSnapshot, "Session data will appear here.");
  elements.stateDebugEl.textContent = formatJson(snapshot.player, "Player state will appear here.");
  elements.turnDebugEl.textContent = formatJson(snapshot.turn, "Turn debug will appear here after the first request.");
}

export function createDebugSnapshot(state: DebugViewState): DebugSnapshot {
  return {
    connectionSnapshot: {
      setup: state.setupStatus || null,
      runtime: state.sessionDebug?.runtime || state.lastTurnDebug?.runtime || null,
      session: state.sessionDebug?.session || state.lastTurnDebug?.session || null,
      last_request_id: state.lastTurnDebug?.request_id || null,
      fatal_error: state.fatalError || state.activeFatalUiError
    },
    player: state.player,
    turn: state.lastTurnDebug
  };
}

export function formatJson(value: unknown, fallbackMessage: string): string {
  if (value === null || value === undefined) {
    return JSON.stringify({ message: fallbackMessage }, null, 2);
  }

  return JSON.stringify(value, null, 2);
}
