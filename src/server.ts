import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import express, { type Request, type Response } from "express";
import { buildConfigPreflightIssues, config } from "./config.js";
import { initDb } from "./db.js";
import {
  getOrCreatePlayer,
  getShortHistory,
  getRecentText,
  getRelevantMemories,
  addEvent,
  addMemories,
  updatePlayerState,
  updateDirectorState,
  updateSummary
} from "./game.js";
import { assistText } from "./assist.js";
import {
  applyDirectorRules,
  getCurrentBeat,
  getInitialDirectorState,
  loadDirectorSpec,
  reloadDirectorSpec
} from "./director.js";
import { validateDirectorSpec, validateQuestSpec, validateStateUpdates } from "./validator.js";
import { loadQuestSpec, reloadQuestSpec } from "./quest.js";
import { generateTurn, getEmbedding, getEmbeddings } from "./ai.js";
import type { RuntimePreflightIssue } from "./config.js";
import type { DirectorSpec, DirectorState, Player, QuestSpec, QuestUpdate, StateUpdates, TurnResult } from "./types.js";

interface TurnDebugParams {
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

type LegacyDirectorState = Partial<DirectorState> & { current_act?: string };
type RuntimePreflightStatus = "ok" | "blocked" | "checking";

interface RuntimePreflight {
  ok: boolean;
  status: RuntimePreflightStatus;
  summary: string;
  issues: RuntimePreflightIssue[];
  checked_at: string | null;
}

const app = express();
const port = config.port;
const model = config.ai.chatModel;
const embeddingModel = config.ai.embeddingModel;
const PREFLIGHT_CACHE_MS = 15000;
let directorSpec = loadDirectorSpec();
let questSpec = loadQuestSpec();
let runtimePreflight = createInitialRuntimePreflight();
let runtimePreflightCheckStartedAt = 0;
let runtimePreflightPromise: Promise<RuntimePreflight> | null = null;

initDb();

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

const SYSTEM_PROMPT = `You are the Narrative Engine for a text-based adventure game.
- The player can attempt anything; never refuse. Adapt consequences instead.
- You must respect STATE_PACK facts, quest status, and director state.
- You are a director: guide toward the end goal in STATE_PACK.director.end_goal.
- Never change the end goal. Only update end_goal_progress.
- Use STATE_PACK.director_spec.current_beat to steer the scene.
- When a beat is achieved, add the beat's unlock flag via state_updates.flags_add.
- Keep outputs concise and vivid.
- Provide structured JSON only (no extra text).`;

app.get("/api/state", async (req: Request, res: Response) => {
  await ensureRuntimePreflight();
  const playerId = readQueryValue(req.query.playerId);
  const name = readQueryValue(req.query.name);
  const player = getOrCreatePlayer({ playerId, name });
  const normalized = normalizeDirectorState(player);
  if (normalized.changed) {
    updateDirectorState(player.id, normalized.director);
    player.director_state = normalized.director;
  }
  res.json({
    player,
    debug: {
      runtime: buildRuntimeDebug(),
      session: buildSessionDebug(player)
    }
  });
});

app.post("/api/assist", (req: Request, res: Response) => {
  const body = req.body as Partial<{ playerId: string; name: string; input: string }> | undefined;
  const input = typeof body?.input === "string" ? body.input : "";
  if (!input) {
    return res.status(400).json({ error: "Missing input" });
  }

  const player = getOrCreatePlayer({ playerId: body?.playerId, name: body?.name });
  const dynamicTexts = getRecentText(player.id, 120);
  const result = assistText({ text: input, dynamicTexts });

  return res.json(result);
});

app.get("/api/director/spec", (_req: Request, res: Response) => {
  res.json({ spec: directorSpec });
});

app.get("/api/quests/spec", (_req: Request, res: Response) => {
  res.json({ spec: questSpec });
});

app.post("/api/director/reload", (_req: Request, res: Response) => {
  try {
    directorSpec = reloadDirectorSpec();
    const validation = validateDirectorSpec(directorSpec);
    if (!validation.ok) {
      return res.status(400).json({ error: "Invalid director spec", detail: validation.errors });
    }
    return res.json({ ok: true, spec: directorSpec });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reload spec", detail: getErrorMessage(error) });
  }
});

app.post("/api/quests/reload", (_req: Request, res: Response) => {
  try {
    questSpec = reloadQuestSpec();
    const validation = validateQuestSpec(questSpec);
    if (!validation.ok) {
      return res.status(400).json({ error: "Invalid quest spec", detail: validation.errors });
    }
    return res.json({ ok: true, spec: questSpec });
  } catch (error) {
    return res.status(500).json({ error: "Failed to reload quest spec", detail: getErrorMessage(error) });
  }
});

app.post("/api/turn", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  let player: Player | null = null;
  let refreshedPlayer: Player | null = null;
  let input = "";
  let shortHistory: string[] = [];
  let memories: string[] = [];
  let statePack: unknown = null;
  let inputEmbedding: number[] = [];
  let inputEmbeddingError: string | null = null;
  let rawResult: unknown = null;
  let result: TurnResult | null = null;
  let updateValidation: { ok: boolean; errors: string[] } = { ok: true, errors: [] };
  let memoryEmbeddings: number[][] = [];
  let memoryEmbeddingError: string | null = null;

  res.setHeader("x-request-id", requestId);

  try {
    const body = req.body as Partial<{ playerId: string; name: string; input: string }> | undefined;
    const submittedInput = typeof body?.input === "string" ? body.input : "";
    input = submittedInput;
    if (!input) {
      return res.status(400).json({
        error: "Missing input",
        debug: buildTurnDebug({
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
          memoryEmbeddingError
        })
      });
    }

    const preflight = await ensureRuntimePreflight();
    if (!preflight.ok) {
      return res.status(503).json({
        error: "Setup required",
        detail: preflight.issues.map((issue) => `${issue.title}: ${issue.message}`),
        debug: buildTurnDebug({
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
          error: preflight.summary
        })
      });
    }

    player = getOrCreatePlayer({ playerId: body?.playerId, name: body?.name });
    const normalized = normalizeDirectorState(player);
    if (normalized.changed) {
      updateDirectorState(player.id, normalized.director);
      player.director_state = normalized.director;
    }

    addEvent(player.id, "player", input);

    shortHistory = getShortHistory(player.id, 6);
    try {
      inputEmbedding = await getEmbedding({ model: embeddingModel, input });
    } catch (error) {
      inputEmbedding = [];
      inputEmbeddingError = getErrorMessage(error);
    }
    memories = getRelevantMemories(player.id, inputEmbedding, 6);

    statePack = {
      player: {
        id: player.id,
        name: player.name,
        location: player.location,
        inventory: player.inventory,
        flags: player.flags,
        quests: player.quests
      },
      summary: player.summary,
      director: player.director_state,
      director_spec: {
        end_goal: directorSpec.end_goal,
        current_beat: getCurrentBeat(directorSpec, player.director_state),
        rules: directorSpec.rules
      },
      quest_spec: questSpec
    };

    rawResult = await generateTurn({
      model,
      systemPrompt: SYSTEM_PROMPT,
      statePack,
      shortHistory,
      memories,
      input
    });

    result = sanitizeTurnResult(rawResult, player);
    updateValidation = validateStateUpdates(result.state_updates);
    if (!updateValidation.ok) {
      return res.status(400).json({
        error: "Invalid state updates",
        detail: updateValidation.errors,
        debug: buildTurnDebug({
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
          memoryEmbeddingError
        })
      });
    }

    addEvent(player.id, "narrator", result.narrative);

    updatePlayerState(player.id, result.state_updates);
    const nextFlags = mergeList(player.flags, result.state_updates.flags_add, result.state_updates.flags_remove);
    const directorState = applyDirectorRules({
      spec: directorSpec,
      directorState: player.director_state,
      stateUpdates: result.state_updates,
      flags: nextFlags
    });
    directorState.end_goal_progress = result.director_updates.end_goal_progress;
    updateDirectorState(player.id, directorState);
    if (result.memory_updates.length) {
      try {
        memoryEmbeddings = await getEmbeddings({
          model: embeddingModel,
          inputs: result.memory_updates
        });
      } catch (error) {
        memoryEmbeddings = [];
        memoryEmbeddingError = getErrorMessage(error);
      }

      const memoryItems = result.memory_updates.map((content, index) => ({
        content,
        embedding: memoryEmbeddings[index]
      }));
      addMemories(player.id, memoryItems);
      updateSummary(player.id, result.memory_updates);
    }

    refreshedPlayer = getOrCreatePlayer({ playerId: player.id });

    res.json({
      narrative: result.narrative,
      player_options: result.player_options,
      state_updates: result.state_updates,
      director_updates: result.director_updates,
      player: refreshedPlayer,
      debug: buildTurnDebug({
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
        memoryEmbeddingError
      })
    });
  } catch (error) {
    res.status(500).json({
      error: "Turn failed",
      detail: getErrorMessage(error),
      debug: buildTurnDebug({
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
        error: getErrorMessage(error)
      })
    });
  }
});

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});

void ensureRuntimePreflight({ force: true }).catch(() => {
  // The latest failure is reflected through the runtime preflight payload.
});

function sanitizeTurnResult(result: unknown, player: Player): TurnResult {
  const candidate = (result && typeof result === "object" ? result : {}) as Partial<TurnResult> & {
    state_updates?: Partial<StateUpdates>;
    director_updates?: Partial<TurnResult["director_updates"]>;
  };

  return {
    narrative: typeof candidate.narrative === "string" ? candidate.narrative : "The world holds its breath.",
    player_options: ensureStringArray(candidate.player_options, 6),
    state_updates: {
      location: ensureString(candidate.state_updates?.location, player.location),
      inventory_add: ensureStringArray(candidate.state_updates?.inventory_add),
      inventory_remove: ensureStringArray(candidate.state_updates?.inventory_remove),
      flags_add: ensureStringArray(candidate.state_updates?.flags_add),
      flags_remove: ensureStringArray(candidate.state_updates?.flags_remove),
      quests: ensureQuestArray(candidate.state_updates?.quests)
    },
    director_updates: {
      end_goal_progress: ensureString(candidate.director_updates?.end_goal_progress, player.director_state.end_goal_progress)
    },
    memory_updates: ensureStringArray(candidate.memory_updates, 8)
  };
}

function ensureString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function ensureStringArray(value: unknown, max = 20): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, max);
}

function ensureQuestArray(value: unknown): QuestUpdate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is { id: string; status?: string; summary?: string } => Boolean(item) && typeof item === "object" && "id" in item && typeof item.id === "string")
    .map((item) => ({
      id: item.id,
      status: typeof item.status === "string" ? item.status : "unknown",
      summary: typeof item.summary === "string" ? item.summary : ""
    }));
}

function mergeList(existing: string[], addList: string[] = [], removeList: string[] = []): string[] {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function normalizeDirectorState(player: Player): { director: DirectorState; changed: boolean } {
  const initial = getInitialDirectorState(directorSpec);
  const director = (player.director_state || initial) as LegacyDirectorState;
  const missingFields = !director.current_act_id || !director.current_beat_id || !director.current_beat_label;
  if (!missingFields) return { director: director as DirectorState, changed: false };

  const fallback: DirectorState = {
    ...initial,
    end_goal_progress: director.end_goal_progress || initial.end_goal_progress
  };
  if (director.current_act && director.current_act_id === undefined) {
    const act = directorSpec.acts.find((item) => item.name === director.current_act);
    if (act) {
      fallback.current_act_id = act.id;
      fallback.current_act = act.name;
      fallback.current_beat_id = act.beats[0]?.id || fallback.current_beat_id;
      fallback.current_beat_label = act.beats[0]?.label || fallback.current_beat_label;
    }
  }

  return { director: fallback, changed: true };
}

function buildRuntimeDebug() {
  return {
    ...config.runtime,
    preflight: runtimePreflight,
    server_time: new Date().toISOString()
  };
}

function buildSessionDebug(player: Player | null) {
  if (!player) return null;

  return {
    player_id: player.id,
    name: player.name,
    created_at: player.created_at,
    location: player.location
  };
}

function buildPlayerSnapshot(player: Player | null) {
  if (!player) return null;

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
  if (!statePack || typeof statePack !== "object") return null;

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

function buildTurnDebug({
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
    runtime: buildRuntimeDebug(),
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

function readQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : undefined;
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function createInitialRuntimePreflight(): RuntimePreflight {
  const issues = buildConfigPreflightIssues(config);
  if (issues.length) {
    return buildRuntimePreflightReport(issues);
  }

  return {
    ok: false,
    status: "checking",
    summary: "Checking AI connection before the first turn.",
    issues: [],
    checked_at: null
  };
}

function buildRuntimePreflightReport(issues: RuntimePreflightIssue[]): RuntimePreflight {
  return {
    ok: issues.length === 0,
    status: issues.length ? "blocked" : "ok",
    summary: issues.length
      ? "Setup needs attention before the first turn can run."
      : "AI setup looks ready.",
    issues,
    checked_at: new Date().toISOString()
  };
}

async function ensureRuntimePreflight({ force = false }: { force?: boolean } = {}): Promise<RuntimePreflight> {
  if (
    !force &&
    runtimePreflight.checked_at &&
    Date.now() - runtimePreflightCheckStartedAt < PREFLIGHT_CACHE_MS
  ) {
    return runtimePreflight;
  }

  if (runtimePreflightPromise) {
    return runtimePreflightPromise;
  }

  runtimePreflightPromise = refreshRuntimePreflight();
  try {
    return await runtimePreflightPromise;
  } finally {
    runtimePreflightPromise = null;
  }
}

async function refreshRuntimePreflight(): Promise<RuntimePreflight> {
  runtimePreflightCheckStartedAt = Date.now();

  const configIssues = buildConfigPreflightIssues(config);
  if (configIssues.length) {
    runtimePreflight = buildRuntimePreflightReport(configIssues);
    return runtimePreflight;
  }

  const runtimeIssues = await probeRuntimeIssues();
  runtimePreflight = buildRuntimePreflightReport(runtimeIssues);
  return runtimePreflight;
}

async function probeRuntimeIssues(): Promise<RuntimePreflightIssue[]> {
  const modelsUrl = getModelsUrl();
  if (!modelsUrl) {
    return [];
  }

  let response: globalThis.Response;

  try {
    response = await fetch(modelsUrl, {
      headers: buildModelsRequestHeaders(),
      signal: AbortSignal.timeout(5000)
    });
  } catch {
    return [buildEndpointIssue("The app could not reach the configured AI service URL.")];
  }

  if (response.status === 401 || response.status === 403) {
    return [buildAuthIssue()];
  }

  if (response.status === 404) {
    return [buildEndpointIssue("The configured AI service URL did not expose a models list.")];
  }

  if (!response.ok) {
    return [
      buildEndpointIssue(`The AI service responded with HTTP ${response.status} during startup.`)
    ];
  }

  const modelIds = await readModelIds(response);
  if (!modelIds.length) {
    return [];
  }

  const issues: RuntimePreflightIssue[] = [];
  if (!modelIds.includes(config.ai.chatModel)) {
    issues.push(buildModelAliasIssue("chat", config.ai.chatModel, modelIds));
  }
  if (!modelIds.includes(config.ai.embeddingModel)) {
    issues.push(buildModelAliasIssue("embedding", config.ai.embeddingModel, modelIds));
  }
  return issues;
}

function buildModelsRequestHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json"
  };

  if (config.ai.apiKey) {
    headers.Authorization = `Bearer ${config.ai.apiKey}`;
  }

  return headers;
}

function getModelsUrl(): string | null {
  const baseUrl =
    config.ai.baseUrl || (config.ai.provider === "openai-compatible" ? "https://api.openai.com/v1" : "");
  if (!baseUrl) {
    return null;
  }

  const normalizedBaseUrl = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return new URL("models", normalizedBaseUrl).toString();
}

async function readModelIds(response: globalThis.Response): Promise<string[]> {
  const payload = (await response.json().catch(() => null)) as
    | { data?: Array<{ id?: unknown }> }
    | null;

  if (!Array.isArray(payload?.data)) {
    return [];
  }

  return payload.data
    .map((item) => (typeof item?.id === "string" ? item.id : ""))
    .filter((item): item is string => Boolean(item));
}

function buildEndpointIssue(message: string): RuntimePreflightIssue {
  return {
    code: "ai_endpoint_unreachable",
    severity: "error",
    title: "Start or fix the AI service",
    message,
    recovery: [
      `Check the configured base URL: ${config.ai.baseUrl || "https://api.openai.com/v1"}.`,
      config.ai.provider === "ollama"
        ? "Start Ollama and confirm OLLAMA_BASE_URL points at the running API."
        : config.ai.provider === "litellm"
          ? "Start LiteLLM and confirm LITELLM_PROXY_URL matches the running proxy."
          : "Confirm the provider URL is reachable and accepts OpenAI-compatible requests.",
      "If the app runs in Docker and the AI service runs on your PC, use host.docker.internal instead of localhost."
    ],
    env_vars:
      config.ai.provider === "ollama"
        ? ["OLLAMA_BASE_URL", "AI_BASE_URL"]
        : config.ai.provider === "litellm"
          ? ["LITELLM_PROXY_URL", "AI_BASE_URL"]
          : ["AI_BASE_URL", "OPENAI_BASE_URL"]
  };
}

function buildAuthIssue(): RuntimePreflightIssue {
  return {
    code: "ai_auth_rejected",
    severity: "error",
    title: "Fix the AI credentials",
    message: "The AI service rejected the configured credentials during startup.",
    recovery: [
      config.ai.provider === "litellm"
        ? "Check LITELLM_API_KEY or the upstream credentials configured behind LiteLLM."
        : "Check the API key in .env and confirm it still has access to the selected models.",
      "Restart the launcher after saving the updated credentials."
    ],
    env_vars:
      config.ai.provider === "litellm"
        ? ["LITELLM_API_KEY", "AI_API_KEY"]
        : config.ai.provider === "ollama"
          ? ["OLLAMA_API_KEY", "AI_API_KEY"]
          : ["AI_API_KEY", "OPENAI_API_KEY"]
  };
}

function buildModelAliasIssue(
  kind: "chat" | "embedding",
  configuredModel: string,
  availableModels: string[]
): RuntimePreflightIssue {
  const availablePreview = availableModels.slice(0, 5).join(", ");
  const envVars =
    kind === "chat"
      ? config.ai.provider === "litellm"
        ? ["LITELLM_CHAT_MODEL", "AI_CHAT_MODEL"]
        : config.ai.provider === "ollama"
          ? ["OLLAMA_CHAT_MODEL", "AI_CHAT_MODEL"]
          : ["AI_CHAT_MODEL", "OPENAI_MODEL"]
      : config.ai.provider === "litellm"
        ? ["LITELLM_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL"]
        : config.ai.provider === "ollama"
          ? ["OLLAMA_EMBEDDING_MODEL", "AI_EMBEDDING_MODEL"]
          : ["AI_EMBEDDING_MODEL", "OPENAI_EMBEDDING_MODEL"];

  const providerSpecificStep =
    config.ai.provider === "litellm"
      ? "Check the alias names in litellm.config.yaml and make sure this alias is exposed by the proxy."
      : config.ai.provider === "ollama"
        ? "Install the model in Ollama or update the configured model name to one returned by the local API."
        : "Update the configured model name to one returned by the provider's /models endpoint.";

  return {
    code: `${kind}_model_alias_missing`,
    severity: "error",
    title: `${kind === "chat" ? "Chat" : "Embedding"} model not found`,
    message: `The configured ${kind} model "${configuredModel}" was not listed by the AI service.`,
    recovery: [
      providerSpecificStep,
      availablePreview ? `Available models reported at startup: ${availablePreview}.` : "No model names were returned to compare against."
    ],
    env_vars: envVars
  };
}
