import { getSafeConfigDiagnostics } from "../core/config.js";
import type { AppConfig, Player, RuntimePreflightReport, TurnResult } from "../core/types.js";

export interface TurnDebugParams {
  config: AppConfig;
  runtimePreflight: RuntimePreflightReport;
  requestId: string;
  startedAt: number;
  input: string;
  player: Player | null;
  refreshedPlayer: Player | null;
  shortHistory: string[];
  memories: string[];
  statePack: unknown;
  inputEmbedding: number[];
  inputEmbeddingError: string | null;
  rawResult: unknown;
  result: TurnResult | null;
  updateValidation: { ok: boolean; errors: string[] };
  memoryEmbeddings: number[][];
  memoryEmbeddingError: string | null;
  error?: string | null;
}

export function buildRuntimeDebug(config: AppConfig, runtimePreflight: RuntimePreflightReport) {
  return {
    ...config.runtime,
    config_diagnostics: getSafeConfigDiagnostics(config),
    preflight: runtimePreflight,
    server_time: new Date().toISOString()
  };
}

export function buildSessionDebug(player: Player | null) {
  if (!player) {
    return null;
  }

  return {
    player_id: player.id,
    name: player.name,
    created_at: player.created_at,
    location: player.location
  };
}

export function buildTurnDebug({
  config,
  runtimePreflight,
  requestId,
  startedAt,
  input,
  player,
  refreshedPlayer,
  shortHistory,
  memories,
  statePack,
  inputEmbedding,
  inputEmbeddingError,
  rawResult,
  result,
  updateValidation,
  memoryEmbeddings,
  memoryEmbeddingError,
  error = null
}: TurnDebugParams) {
  return {
    request_id: requestId,
    runtime: buildRuntimeDebug(config, runtimePreflight),
    session: buildSessionDebug(refreshedPlayer || player),
    turn: {
      input: input || null,
      latency_ms: Date.now() - startedAt,
      prompt_preview: buildPromptPreview(statePack, shortHistory, memories),
      embeddings: {
        input_dimensions: inputEmbedding.length,
        input_status: inputEmbedding.length ? "ok" : "fallback",
        input_error: inputEmbeddingError,
        memory_vectors_generated: memoryEmbeddings.length,
        memory_error: memoryEmbeddingError
      },
      validation: {
        ok: Boolean(updateValidation.ok),
        errors: updateValidation.errors || []
      },
      raw_model_output: rawResult,
      sanitized_output: result,
      state_before_turn: buildPlayerSnapshot(player),
      state_after_turn: buildPlayerSnapshot(refreshedPlayer),
      error
    }
  };
}

function buildPlayerSnapshot(player: Player | null) {
  if (!player) {
    return null;
  }

  return {
    id: player.id,
    name: player.name,
    created_at: player.created_at,
    location: player.location,
    inventory: player.inventory,
    flags: player.flags,
    quests: player.quests,
    summary: player.summary,
    director_state: player.director_state
  };
}

function buildPromptPreview(statePack: unknown, shortHistory: string[], memories: string[]) {
  if (!statePack || typeof statePack !== "object") {
    return null;
  }

  const typedPack = statePack as {
    player: unknown;
    summary: unknown;
    director: unknown;
    director_spec?: { current_beat?: unknown };
  };

  return {
    short_history: shortHistory,
    retrieved_memories: memories,
    player_state: typedPack.player,
    summary: typedPack.summary,
    director_state: typedPack.director,
    current_beat: typedPack.director_spec?.current_beat || null
  };
}
