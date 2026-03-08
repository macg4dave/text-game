import "dotenv/config";
import crypto from "node:crypto";
import path from "node:path";
import process from "node:process";
import express, { type Request, type Response } from "express";
import { config, formatConfigErrors, getSafeConfigDiagnostics } from "../core/config.js";
import { initDb } from "../core/db.js";
import type { Player, QuestSpec } from "../core/types.js";
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
import { validateDirectorSpec, validateQuestSpec, validateStateUpdates } from "../rules/validator.js";
import { loadQuestSpec, reloadQuestSpec } from "../story/quest.js";
import { generateTurn, getEmbedding, getEmbeddings } from "../ai/service.js";
import { buildRuntimeDebug, buildSessionDebug, buildTurnDebug, type TurnDebugParams } from "./debug.js";
import { normalizeDirectorState } from "./player-state.js";
import { SYSTEM_PROMPT } from "./prompt.js";
import { createRuntimePreflightService } from "./runtime-preflight.js";
import { sanitizeTurnResult } from "./turn-result.js";

type ServerTurnDebugParams = Omit<TurnDebugParams, "config" | "runtimePreflight">;

const app = express();
const port = config.port;
const model = config.ai.chatModel;
const embeddingModel = config.ai.embeddingModel;
let directorSpec = loadDirectorSpec();
let questSpec: QuestSpec = loadQuestSpec();
const runtimePreflight = createRuntimePreflightService(config);

initDb();

app.use(express.json());
app.use(express.static(path.resolve(process.cwd(), "public")));

app.get("/api/state", async (req: Request, res: Response) => {
  await runtimePreflight.ensureReport();
  const playerId = readQueryValue(req.query.playerId);
  const name = readQueryValue(req.query.name);
  const player = getOrCreatePlayer({ playerId, name });
  const normalized = normalizeDirectorState(player, directorSpec);
  if (normalized.changed) {
    updateDirectorState(player.id, normalized.director);
    player.director_state = normalized.director;
  }

  res.json({
    player,
    debug: {
      runtime: buildRuntimeDebugPayload(),
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
  let result = null;
  let updateValidation: { ok: boolean; errors: string[] } = { ok: true, errors: [] };
  let memoryEmbeddings: number[][] = [];
  let memoryEmbeddingError: string | null = null;

  res.setHeader("x-request-id", requestId);

  try {
    const body = req.body as Partial<{ playerId: string; name: string; input: string }> | undefined;
    input = typeof body?.input === "string" ? body.input : "";
    if (!input) {
      return res.status(400).json({
        error: "Missing input",
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

    const preflight = await runtimePreflight.ensureReport();
    if (!preflight.ok) {
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

    player = getOrCreatePlayer({ playerId: body?.playerId, name: body?.name });
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

    result = sanitizeTurnResult(rawResult, player);
    updateValidation = validateStateUpdates(result.state_updates);
    if (!updateValidation.ok) {
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

    return res.json({
      narrative: result.narrative,
      player_options: result.player_options,
      state_updates: result.state_updates,
      director_updates: result.director_updates,
      player: refreshedPlayer,
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

app.listen(port, () => {
  logStartupConfigState();
  console.log(`Server listening on http://localhost:${port}`);
});

void runtimePreflight.ensureReport({ force: true }).catch(() => {
  // The latest failure is reflected through the runtime preflight payload.
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
    console.warn("[startup] Configuration needs attention; the app will stay in setup-required mode.");
    console.warn(formatConfigErrors(config.validation.errors));
  } else {
    console.log(
      `[startup] Configuration ready: provider=${config.ai.provider}, chat=${config.ai.chatModel}, embedding=${config.ai.embeddingModel}, baseUrl=${baseUrl}`
    );
  }

  console.log(
    `[startup] Config sources: provider=${diagnostics.provider.source}, port=${diagnostics.port.source}, apiKey=${diagnostics.ai.api_key.source}, baseUrl=${diagnostics.ai.base_url.source}, chatModel=${diagnostics.ai.chat_model.source}, embeddingModel=${diagnostics.ai.embedding_model.source}`
  );
}
