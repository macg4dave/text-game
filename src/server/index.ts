import "dotenv/config";
import crypto from "node:crypto";
import http, { type Server as HttpServer } from "node:http";
import path from "node:path";
import process from "node:process";
import express, { type NextFunction, type Request, type Response } from "express";
import { config, formatConfigErrors, getSafeConfigDiagnostics } from "../core/config.js";
import { initDb } from "../core/db.js";
import { createLogger } from "../core/logging.js";
import { type QuestSpec, type RuntimePreflightIssue, type RuntimePreflightReport } from "../core/types.js";
import { getOrCreatePlayer, getRecentText } from "../state/game.js";
import { assistText } from "../utils/assist.js";
import { loadDirectorSpec, reloadDirectorSpec } from "../story/director.js";
import { validateDirectorSpec, validateQuestSpec } from "../rules/validator.js";
import { loadQuestSpec, reloadQuestSpec } from "../story/quest.js";
import { buildRuntimeDebug, buildSessionDebug, buildTurnDebug, type TurnDebugParams } from "./debug.js";
import { buildStorageStartupIssue } from "./host-preflight.js";
import { createRuntimePreflightService } from "./runtime-preflight.js";
import { createGlobalProcessHandler } from "./global-handler.js";
import { getErrorMessage, readRequestIdHeader } from "./request-utils.js";
import { createSetupStatusHandler } from "./setup-route.js";
import { createListSaveSlotsHandler, createLoadSaveSlotHandler, createSaveToSlotHandler } from "./save-slots-route.js";
import { createStateHandler } from "./state-route.js";
import { createTurnHandler } from "./turn-route.js";

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

app.get(
  "/api/setup/status",
  createSetupStatusHandler({
    config,
    runtimePreflight,
    ensureDatabaseReady,
    hasStorageBlocker,
    getRequestLogger
  })
);

app.get(
  "/api/state",
  createStateHandler({
    runtimePreflight,
    ensureDatabaseReady,
    hasStorageBlocker,
    buildRuntimeDebug: buildRuntimeDebugPayload,
    buildSessionDebug,
    getRequestLogger,
    getDirectorSpec: () => directorSpec
  })
);

app.get(
  "/api/save-slots",
  createListSaveSlotsHandler({
    runtimePreflight,
    ensureDatabaseReady,
    hasStorageBlocker,
    getRequestLogger
  })
);

app.post(
  "/api/save-slots",
  createSaveToSlotHandler({
    runtimePreflight,
    ensureDatabaseReady,
    hasStorageBlocker,
    getRequestLogger
  })
);

app.post(
  "/api/save-slots/load",
  createLoadSaveSlotHandler({
    runtimePreflight,
    ensureDatabaseReady,
    hasStorageBlocker,
    getRequestLogger
  })
);

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

app.post(
  "/api/turn",
  createTurnHandler({
    runtimePreflight,
    ensureDatabaseReady,
    getRequestLogger,
    buildTurnDebugPayload,
    model,
    embeddingModel,
    getDirectorSpec: () => directorSpec,
    getQuestSpec: () => questSpec
  })
);

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

function buildRuntimeDebugPayload(preflight = runtimePreflight.getCurrentReport()) {
  return buildRuntimeDebug(config, preflight);
}

function buildTurnDebugPayload(params: ServerTurnDebugParams) {
  return buildTurnDebug({
    ...params,
    config,
    runtimePreflight: runtimePreflight.getCurrentReport()
  });
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
