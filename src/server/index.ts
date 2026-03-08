import "dotenv/config";
import crypto from "node:crypto";
import http, { type Server as HttpServer } from "node:http";
import path from "node:path";
import process from "node:process";
import express, { type NextFunction, type Request, type Response } from "express";
import { config, formatConfigErrors, getSafeConfigDiagnostics } from "../core/config.js";
import { initDb } from "../core/db.js";
import { createLogger } from "../core/logging.js";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type AuthoritativePlayerState,
  type Player,
  type QuestSpec,
  type RuntimePreflightIssue,
  type RuntimePreflightReport,
  type TurnOutputPayload
} from "../core/types.js";
import {
  addEvent,
  addMemories,
  getOrCreatePlayer,
  getRecentText,
  getRelevantMemories,
  getShortHistory,
  updateDirectorState,
  updatePlayerState,
  updateSummary
} from "../state/game.js";
import { assistText } from "../utils/assist.js";
import { applyDirectorRules, getCurrentBeat, loadDirectorSpec, reloadDirectorSpec } from "../story/director.js";
import {
  parseTurnInput,
  validateAuthoritativePlayerState,
  validateDirectorSpec,
  validateQuestSpec,
  validateStateUpdates,
  validateTurnOutput
} from "../rules/validator.js";
import { loadQuestSpec, reloadQuestSpec } from "../story/quest.js";
import { generateTurn, getEmbedding, getEmbeddings } from "../ai/service.js";
import { buildRuntimeDebug, buildSessionDebug, buildTurnDebug, type TurnDebugParams } from "./debug.js";
import { buildStorageStartupIssue } from "./host-preflight.js";
import { normalizeDirectorState } from "./player-state.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createRuntimePreflightService } from "./runtime-preflight.js";
import { sanitizeTurnResult } from "./turn-result.js";
import { createGlobalProcessHandler } from "./global-handler.js";

type ServerTurnDebugParams = Omit<TurnDebugParams, "config" | "runtimePreflight">;

const app = express();
const port = config.port;
const model = config.ai.chatModel;
const embeddingModel = config.ai.embeddingModel;
const logger = createLogger({ level: config.logging.level }).child({ component: "server" });
let directorSpec = loadDirectorSpec();
let questSpec: QuestSpec = loadQuestSpec();
let dbStartupIssue: RuntimePreflightIssue | null = null;
let dbInitialized = false;
const runtimePreflight = createRuntimePreflightService(config, undefined, () => (dbStartupIssue ? [dbStartupIssue] : []));

app.use(express.json());
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = readRequestIdHeader(req.headers["x-request-id"]) || crypto.randomUUID();
  const startedAt = Date.now();
  const requestLogger = logger.child({
    requestId,
    method: req.method,
    route: req.path
  });

  res.setHeader("x-request-id", requestId);
  res.locals.requestId = requestId;
  res.locals.requestLogger = requestLogger;

  requestLogger.debug("request started");
  res.on("finish", () => {
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    requestLogger[level]("request finished", {
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt
    });
  });

  next();
});
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/state", async (req: Request, res: Response) => {
  let preflight = await runtimePreflight.ensureReport();
  if (!hasStorageBlocker(preflight)) {
    const dbIssue = ensureDatabaseReady();
    if (dbIssue) {
      preflight = await runtimePreflight.ensureReport({ force: true });
    }
  }

  if (hasStorageBlocker(preflight)) {
    return res.json({
      player: null,
      debug: {
        runtime: buildRuntimeDebug(config, preflight),
        session: null
      }
    });
  }

  const playerId = readQueryValue(req.query.playerId);
  const name = readQueryValue(req.query.name);
  const player = getOrCreatePlayer({ playerId, name });
  const normalized = normalizeDirectorState(player, directorSpec);
  if (normalized.changed) {
    updateDirectorState(player.id, normalized.director);
    player.director_state = normalized.director;
  }

  const authoritativePlayer = createAuthoritativePlayerState(player);
  const authoritativeStateValidation = validateAuthoritativePlayerState(authoritativePlayer);
  if (!authoritativeStateValidation.ok) {
    getRequestLogger(res).error("state request produced invalid authoritative player state", {
      validationErrors: authoritativeStateValidation.errors
    });
    return res.status(500).json({
      error: "Invalid authoritative state",
      detail: authoritativeStateValidation.errors,
      debug: {
        runtime: buildRuntimeDebugPayload(),
        session: null
      }
    });
  }

  res.json({
    player: authoritativePlayer,
    debug: {
      runtime: buildRuntimeDebugPayload(),
      session: buildSessionDebug(authoritativePlayer)
    }
  });
});

app.post("/api/assist", async (req: Request, res: Response) => {
  const dbIssue = ensureDatabaseReady();
  if (dbIssue) {
    const preflight = await runtimePreflight.ensureReport({ force: true });
    return res.status(503).json({
      error: "Setup required",
      detail: preflight.summary,
      debug: {
        runtime: buildRuntimeDebug(config, preflight),
        session: null
      }
    });
  }

  const body = req.body as Partial<{ playerId: string; name: string; input: string }> | undefined;
  const input = typeof body?.input === "string" ? body.input : "";
  if (!input) {
    getRequestLogger(res).warn("assist request rejected", { reason: "missing_input" });
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
      getRequestLogger(res).warn("director reload rejected", { reason: "invalid_spec", errorCount: validation.errors.length });
      return res.status(400).json({ error: "Invalid director spec", detail: validation.errors });
    }

    getRequestLogger(res).info("director spec reloaded");
    return res.json({ ok: true, spec: directorSpec });
  } catch (error) {
    getRequestLogger(res).error("director reload failed", { error });
    return res.status(500).json({ error: "Failed to reload spec", detail: getErrorMessage(error) });
  }
});

app.post("/api/quests/reload", (_req: Request, res: Response) => {
  try {
    questSpec = reloadQuestSpec();
    const validation = validateQuestSpec(questSpec);
    if (!validation.ok) {
      getRequestLogger(res).warn("quest reload rejected", { reason: "invalid_spec", errorCount: validation.errors.length });
      return res.status(400).json({ error: "Invalid quest spec", detail: validation.errors });
    }

    getRequestLogger(res).info("quest spec reloaded");
    return res.json({ ok: true, spec: questSpec });
  } catch (error) {
    getRequestLogger(res).error("quest reload failed", { error });
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
  let result: TurnOutputPayload | null = null;
  let updateValidation: { ok: boolean; errors: string[] } = { ok: true, errors: [] };
  let memoryEmbeddings: number[][] = [];
  let memoryEmbeddingError: string | null = null;

  const requestLogger = getRequestLogger(res).child({ turnRequestId: requestId });
  res.setHeader("x-request-id", requestId);

  try {
    const turnInput = parseTurnInput(req.body);
    if (!turnInput.ok || !turnInput.value) {
      requestLogger.warn("turn request rejected", { reason: "missing_input" });
      return res.status(400).json({
        error: "Invalid turn input",
        detail: turnInput.errors,
        debug: buildTurnDebugPayload({
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
    input = turnInput.value.input;

    const preflight = await runtimePreflight.ensureReport();
    if (!preflight.ok) {
      requestLogger.warn("turn blocked by startup preflight", {
        blockerCount: preflight.counts.blocker,
        warningCount: preflight.counts.warning
      });
      return res.status(503).json({
        error: "Setup required",
        detail: preflight.issues.map((issue) => `${issue.title}: ${issue.message}`),
        debug: buildTurnDebugPayload({
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

    const dbIssue = ensureDatabaseReady();
    if (dbIssue) {
      const refreshedPreflight = await runtimePreflight.ensureReport({ force: true });
      requestLogger.warn("turn blocked by storage startup preflight", {
        blockerCount: refreshedPreflight.counts.blocker,
        warningCount: refreshedPreflight.counts.warning
      });
      return res.status(503).json({
        error: "Setup required",
        detail: refreshedPreflight.issues.map((issue) => `${issue.title}: ${issue.message}`),
        debug: buildTurnDebugPayload({
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
          error: refreshedPreflight.summary
        })
      });
    }

    player = getOrCreatePlayer({ playerId: turnInput.value.player_id, name: turnInput.value.player_name });
    const normalized = normalizeDirectorState(player, directorSpec);
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

    result = {
      schema_version: TURN_OUTPUT_SCHEMA_VERSION,
      ...sanitizeTurnResult(rawResult, player)
    };
    const turnOutputValidation = validateTurnOutput(result);
    if (!turnOutputValidation.ok) {
      requestLogger.warn("turn rejected after output schema validation", {
        validationErrors: turnOutputValidation.errors
      });
      return res.status(400).json({
        error: "Invalid turn output",
        detail: turnOutputValidation.errors,
        debug: buildTurnDebugPayload({
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

    updateValidation = validateStateUpdates(result.state_updates);
    if (!updateValidation.ok) {
      requestLogger.warn("turn rejected after validation", {
        validationErrors: updateValidation.errors
      });
      return res.status(400).json({
        error: "Invalid state updates",
        detail: updateValidation.errors,
        debug: buildTurnDebugPayload({
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

      addMemories(
        player.id,
        result.memory_updates.map((content, index) => ({
          content,
          embedding: memoryEmbeddings[index]
        }))
      );
      updateSummary(player.id, result.memory_updates);
    }

    refreshedPlayer = getOrCreatePlayer({ playerId: player.id });
    const authoritativePlayer = createAuthoritativePlayerState(refreshedPlayer);
    const authoritativeStateValidation = validateAuthoritativePlayerState(authoritativePlayer);
    if (!authoritativeStateValidation.ok) {
      requestLogger.error("turn produced invalid authoritative player state", {
        validationErrors: authoritativeStateValidation.errors
      });
      return res.status(500).json({
        error: "Invalid authoritative state",
        detail: authoritativeStateValidation.errors,
        debug: buildTurnDebugPayload({
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

    requestLogger.info("turn completed", {
      durationMs: Date.now() - startedAt,
      inputEmbeddingFallback: Boolean(inputEmbeddingError),
      memoryEmbeddingFallback: Boolean(memoryEmbeddingError),
      suggestedOptionCount: result.player_options.length,
      memoryUpdateCount: result.memory_updates.length
    });

    return res.json({
      schema_version: result.schema_version,
      narrative: result.narrative,
      player_options: result.player_options,
      state_updates: result.state_updates,
      director_updates: result.director_updates,
      player: authoritativePlayer,
      debug: buildTurnDebugPayload({
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
    requestLogger.error("turn failed", { error, durationMs: Date.now() - startedAt });
    return res.status(500).json({
      error: "Turn failed",
      detail: getErrorMessage(error),
      debug: buildTurnDebugPayload({
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

const server = http.createServer(app);
createGlobalProcessHandler({
  logger,
  shutdown: async () => {
    await closeServer(server);
  },
  exit: (code) => {
    process.exit(code);
  }
}).register();

server.listen(port, () => {
  logStartupConfigState();
  logger.info("server listening", { url: `http://localhost:${port}` });
});

void runtimePreflight.ensureReport({ force: true }).catch((error) => {
  logger.warn("initial runtime preflight failed", { error });
});

function buildRuntimeDebugPayload() {
  return buildRuntimeDebug(config, runtimePreflight.getCurrentReport());
}

function buildTurnDebugPayload(params: ServerTurnDebugParams) {
  return buildTurnDebug({
    ...params,
    config,
    runtimePreflight: runtimePreflight.getCurrentReport()
  });
}

function createAuthoritativePlayerState(player: Player): AuthoritativePlayerState {
  return {
    schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
    ...player
  };
}

function mergeList(existing: string[], addList: string[] = [], removeList: string[] = []): string[] {
  const set = new Set(existing);
  addList.forEach((item) => set.add(item));
  removeList.forEach((item) => set.delete(item));
  return Array.from(set);
}

function readQueryValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (Array.isArray(value)) {
    return typeof value[0] === "string" ? value[0] : undefined;
  }

  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function logStartupConfigState() {
  const diagnostics = getSafeConfigDiagnostics(config);
  const baseUrl = config.ai.baseUrl || "(provider default)";

  if (!config.validation.ok) {
    logger.warn("configuration needs attention; app will stay in setup-required mode", {
      validationErrors: formatConfigErrors(config.validation.errors)
    });
  } else {
    logger.info("configuration ready", {
      provider: config.ai.provider,
      chatModel: config.ai.chatModel,
      embeddingModel: config.ai.embeddingModel,
      baseUrl
    });
  }

  logger.info("config sources resolved", {
    providerSource: diagnostics.provider.source,
    portSource: diagnostics.port.source,
    logLevelSource: diagnostics.logging.level.source,
    apiKeySource: diagnostics.ai.api_key.source,
    baseUrlSource: diagnostics.ai.base_url.source,
    chatModelSource: diagnostics.ai.chat_model.source,
    embeddingModelSource: diagnostics.ai.embedding_model.source,
    logLevel: config.logging.level
  });
}

function getRequestLogger(res: Response) {
  return (res.locals.requestLogger as ReturnType<typeof createLogger> | undefined) ?? logger;
}

function readRequestIdHeader(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (Array.isArray(value) && typeof value[0] === "string" && value[0].trim()) {
    return value[0].trim();
  }

  return null;
}

function ensureDatabaseReady(): RuntimePreflightIssue | null {
  if (dbInitialized) {
    return null;
  }

  try {
    initDb();
    dbInitialized = true;
    dbStartupIssue = null;
    return null;
  } catch (error) {
    dbInitialized = false;
    dbStartupIssue = buildStorageStartupIssue(error);
    logger.warn("database startup check failed", { error });
    return dbStartupIssue;
  }
}

function hasStorageBlocker(preflight: RuntimePreflightReport): boolean {
  return preflight.issues.some((issue) => issue.severity === "blocker" && issue.area === "storage");
}

function closeServer(serverToClose: HttpServer): Promise<void> {
  return new Promise((resolve) => {
    serverToClose.close((error) => {
      if (error && error.message !== "Server is not running.") {
        logger.error("http server close failed after fatal error", { error });
      } else {
        logger.info("http server closed after fatal error");
      }
      resolve();
    });
  });
}
