import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  MEMORY_CLASS_RULES,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalEventPayload,
  type CanonicalTurnEventPayload,
  type DirectorSpec,
  type MemoryCandidate,
  type Player,
  type QuestSpec,
  type TurnResult
} from "../core/types.js";
import { SYSTEM_PROMPT } from "../ai/prompt.js";
import { TURN_RESPONSE_SCHEMA, validateTurnResponseSchemaContract } from "../ai/turn-schema.js";
import { validateCanonicalTurnEvent, validateMemoryCandidate } from "../rules/validator.js";
import { createCommittedTurnEventPayload } from "../server/http-contract.js";
import { createTurnService } from "./turn.js";

function getTurnResolutionEvent(event: CanonicalEventPayload): CanonicalTurnEventPayload | null {
  return event.event_kind === "turn-resolution" ? event : null;
}

function createPlayer(): Player {
  return {
    id: "player-123",
    name: "Avery",
    created_at: "2026-03-08T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "You arrived at the market.",
    inventory: ["signal shard"],
    flags: ["market_seen"],
    quests: [
      {
        id: "intro-signal",
        status: "active",
        summary: "You noticed the first signal marker."
      }
    ],
    director_state: {
      end_goal: "Reach the tower",
      current_act_id: "act-1",
      current_act: "Arrival",
      current_beat_id: "beat-1",
      current_beat_label: "Find the signal",
      story_beats_remaining: 3,
      end_goal_progress: "You have started the search.",
      completed_beats: []
    }
  };
}

function createDirectorSpec(): DirectorSpec {
  return {
    end_goal: "Reach the tower",
    acts: [
      {
        id: "act-1",
        name: "Arrival",
        beats: [
          {
            id: "beat-1",
            label: "Find the signal",
            unlock_flags: ["signal_seen"]
          }
        ]
      }
    ]
  };
}

function createQuestSpec(): QuestSpec {
  return {
    quests: [
      {
        id: "intro-signal",
        title: "Follow the signal",
        stages: [
          {
            id: "stage-1",
            label: "Notice the marker"
          }
        ]
      }
    ]
  };
}

test("system prompt frames model-emitted consequences as proposals instead of committed truth", () => {
  assert.match(SYSTEM_PROMPT, /propos/i);
  assert.match(SYSTEM_PROMPT, /do not present .* committed/i);
});

test("system prompt separates intent, simulation plausibility, and pacing guidance", () => {
  assert.match(SYSTEM_PROMPT, /interpret what the player is trying to do/i);
  assert.match(SYSTEM_PROMPT, /plausible off-beat actions may succeed|off-beat actions may succeed/i);
  assert.match(SYSTEM_PROMPT, /implausible actions may fail .* simulation|simulation reasons/i);
  assert.match(SYSTEM_PROMPT, /current beat .* framing|pacing/i);
  assert.doesNotMatch(SYSTEM_PROMPT, /beat appears achieved, you may propose the beat's unlock flag/i);
});

test("turn response schema contract stays compact and proposal-oriented", () => {
  assert.deepEqual(validateTurnResponseSchemaContract(), { ok: true, errors: [] });
});

test("turn response schema descriptions keep simulation and pacing responsibilities distinct", () => {
  const stateUpdatesDescription = TURN_RESPONSE_SCHEMA.schema.properties.state_updates.description;
  const directorUpdatesDescription = TURN_RESPONSE_SCHEMA.schema.properties.director_updates.description;
  const narrativeDescription = TURN_RESPONSE_SCHEMA.schema.properties.narrative.description;

  assert.match(stateUpdatesDescription, /simulation|world consequence/i);
  assert.match(stateUpdatesDescription, /not .* beat|not .* pacing/i);
  assert.match(directorUpdatesDescription, /pacing|framing/i);
  assert.match(directorUpdatesDescription, /not .* plausibility|not .* permission/i);
  assert.match(narrativeDescription, /plausible|accepted outcome/i);
});

test("turn response schema guardrails reject scene and mixed-authority field creep", () => {
  const schema = JSON.parse(JSON.stringify(TURN_RESPONSE_SCHEMA)) as typeof TURN_RESPONSE_SCHEMA & {
    schema: { properties: Record<string, unknown> };
  };

  schema.schema.properties.scene = {
    type: "object",
    additionalProperties: false,
    properties: {
      weather: { type: "string" }
    }
  };
  (schema.schema.properties.state_updates as { properties: Record<string, unknown> }).properties.world_state = {
    type: "object"
  };
  (schema.schema.properties.director_updates as { properties: Record<string, unknown> }).properties.current_beat_id = {
    type: "string"
  };

  const result = validateTurnResponseSchemaContract(schema);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /scene/i);
  assert.match(result.errors.join(" "), /state_updates\.world_state/i);
  assert.match(result.errors.join(" "), /director_updates\.current_beat_id/i);
});

test("memory admission rules keep soft flavor outside authoritative truth", () => {
  const flavorCandidate: MemoryCandidate = {
    content: "The market air smelled electric.",
    memory_class: "soft_flavor",
    authority: MEMORY_CLASS_RULES.soft_flavor.authority,
    source: "narration"
  };

  const result = validateMemoryCandidate({
    ...flavorCandidate,
    authority: "authoritative",
    source: "server_commit"
  });

  assert.deepEqual(validateMemoryCandidate(flavorCandidate), { ok: true, errors: [] });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /soft_flavor/i);
  assert.match(result.errors.join(" "), /narration-only/i);
});

test("turn service executes the gameplay pipeline outside the server layer", async () => {
  const events: Array<{ playerId: string; role: string; content: string }> = [];
  const committedEvents: string[] = [];
  const memoriesAdded: Array<{ playerId: string; content: string; embedding?: number[] }> = [];
  const persistedPlayers: Player[] = [];
  let capturedModel = "";
  let capturedInput = "";
  let capturedShortHistory: string[] = [];
  let capturedMemories: string[] = [];

  const player = createPlayer();
  const refreshedPlayer: Player = {
    ...player,
    summary: "You arrived at the market.\nThe signal lantern hummed when touched."
  };

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent.outcome.status);
      }
    },
    addEvent(playerId, role, content) {
      events.push({ playerId, role, content });
    },
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        memoriesAdded.push({ playerId, content: memory.content, embedding: memory.embedding });
      });
    },
    applyDirectorRules({ directorState }) {
      return {
        ...directorState,
        story_beats_remaining: 2
      };
    },
    async generateTurn(params): Promise<TurnResult> {
      capturedModel = params.model;
      capturedInput = params.input;
      capturedShortHistory = params.shortHistory;
      capturedMemories = params.memories;
      return {
        narrative: "The signal lantern hummed when touched.",
        player_options: ["Inspect the lantern"],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: ["signal_seen"],
          flags_remove: [],
          quests: [
            {
              id: "intro-signal",
              status: "active",
              summary: "You reached the lantern."
            }
          ]
        },
        director_updates: {
          end_goal_progress: "The signal now points toward the tower."
        },
        memory_updates: ["The signal lantern hummed when touched."]
      };
    },
    async getEmbedding() {
      return [0.25, 0.5];
    },
    async getEmbeddings() {
      return [[0.1, 0.2]];
    },
    getOrCreatePlayer() {
      return refreshedPlayer;
    },
    getRelevantMemories() {
      return ["You heard the market signal last night."];
    },
    getShortHistory() {
      return ["PLAYER: look around"];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    },
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    validateStateUpdates() {
      return { ok: true, errors: [] };
    },
    validateTurnOutput() {
      return { ok: true, errors: [] };
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "touch the lantern",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.equal(outcome.turnOutput.schema_version, TURN_OUTPUT_SCHEMA_VERSION);
  assert.equal(outcome.trace.player?.id, player.id);
  assert.equal(outcome.trace.refreshedPlayer?.id, refreshedPlayer.id);
  assert.equal(capturedModel, "game-chat");
  assert.equal(capturedInput, "touch the lantern");
  assert.deepEqual(capturedShortHistory, ["PLAYER: look around"]);
  assert.deepEqual(capturedMemories, ["You heard the market signal last night."]);
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((event) => event.role),
    ["player", "narrator"]
  );
  assert.equal(persistedPlayers.length, 1);
  assert.equal(
    persistedPlayers[0]?.summary,
    "You arrived at the market.\nThe signal lantern hummed when touched."
  );
  assert.deepEqual(persistedPlayers[0]?.flags, ["market_seen", "signal_seen"]);
  assert.equal(persistedPlayers[0]?.director_state.story_beats_remaining, 2);
  assert.equal(
    persistedPlayers[0]?.director_state.end_goal_progress,
    "The signal now points toward the tower."
  );
  assert.deepEqual(committedEvents, ["accepted"]);
  assert.deepEqual(memoriesAdded, [
    {
      playerId: player.id,
      content: "The signal lantern hummed when touched.",
      embedding: [0.1, 0.2]
    }
  ]);
});

test("turn service returns a 400 outcome when turn output validation fails", async () => {
  const player = createPlayer();
  const committedEvents: string[] = [];
  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent.outcome.status);
      }
    },
    addEvent() {},
    addMemories() {},
    applyDirectorRules({ directorState }) {
      return directorState;
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "Broken",
        player_options: [],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: [],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Still broken."
        },
        memory_updates: []
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState() {
      return null;
    },
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    validateStateUpdates() {
      return { ok: true, errors: [] };
    },
    validateTurnOutput() {
      return { ok: false, errors: ["narrative must be a string."] };
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "touch the lantern",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }

  assert.equal(outcome.statusCode, 400);
  assert.equal(outcome.error, "Invalid turn output");
  assert.deepEqual(outcome.detail, ["narrative must be a string."]);
  assert.equal(outcome.reason, "turn_output_validation");
  assert.equal(outcome.trace.input, "touch the lantern");
  assert.equal(outcome.trace.player?.id, player.id);
  assert.deepEqual(outcome.trace.shortHistory, []);
  assert.deepEqual(outcome.trace.memories, []);
  assert.deepEqual(outcome.trace.inputEmbedding, []);
  assert.deepEqual(outcome.trace.updateValidation, { ok: true, errors: [] });
  assert.deepEqual(committedEvents, ["rejected"]);
  assert.equal(
    (outcome.trace.result as { schema_version?: string } | null)?.schema_version,
    TURN_OUTPUT_SCHEMA_VERSION
  );
});

test("turn service returns a 500 outcome when model execution throws unexpectedly", async () => {
  const player = createPlayer();
  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
    applyDirectorRules({ directorState }) {
      return directorState;
    },
    async generateTurn() {
      throw new Error("model gateway timeout");
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState() {
      return null;
    },
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    validateStateUpdates() {
      return { ok: true, errors: [] };
    },
    validateTurnOutput() {
      return { ok: true, errors: [] };
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "inspect the lantern",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, false);
  if (outcome.ok) {
    return;
  }

  assert.equal(outcome.statusCode, 500);
  assert.equal(outcome.error, "Turn failed");
  assert.equal(outcome.reason, "unexpected");
  assert.equal(outcome.detail, "model gateway timeout");
});

test("turn service persists only server-accepted state changes into the authoritative player snapshot", async () => {
  const player = createPlayer();
  const refreshedPlayer: Player = {
    ...player,
    location: "Sky Bridge",
    inventory: ["bridge pass"],
    flags: ["signal_seen"],
    quests: player.quests
  };
  const callOrder: string[] = [];
  let persistedPlayer: Player | null = null;
  const committedEventStatuses: string[] = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      callOrder.push("committedEvent");
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEventStatuses.push(turnEvent.outcome.status);
      }
    },
    addEvent(_playerId, role) {
      callOrder.push(`event:${role}`);
    },
    addMemories() {},
    applyDirectorRules({ directorState }) {
      return {
        ...directorState,
        story_beats_remaining: 2
      };
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You stride onto the bridge and the quest is complete.",
        player_options: ["Study the tower lights"],
        state_updates: {
          location: "Sky Bridge",
          inventory_add: ["signal shard", "bridge pass"],
          inventory_remove: ["signal shard"],
          flags_add: ["signal_seen"],
          flags_remove: ["market_seen"],
          quests: [
            {
              id: "intro-signal",
              status: "complete",
              summary: "The bridge crossing ended the quest."
            }
          ]
        },
        director_updates: {
          end_goal_progress: "You now have a clear route toward the tower."
        },
        memory_updates: []
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return refreshedPlayer;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      callOrder.push("persistPlayerState");
      persistedPlayer = nextPlayer;
      return nextPlayer;
    },
    validateStateUpdates() {
      return { ok: true, errors: [] };
    },
    validateTurnOutput() {
      return { ok: true, errors: [] };
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "cross onto the bridge",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.deepEqual(persistedPlayer, {
    ...player,
    location: "Sky Bridge",
    summary: "You arrived at the market.",
    inventory: ["bridge pass"],
    flags: ["signal_seen"],
    quests: [
      {
        id: "intro-signal",
        status: "complete",
        summary: "The bridge crossing ended the quest."
      }
    ],
    director_state: {
      ...player.director_state,
      story_beats_remaining: 2,
      end_goal_progress: "You now have a clear route toward the tower."
    }
  });
  assert.deepEqual(
    outcome.turnOutput.state_updates,
    {
      location: "Sky Bridge",
      inventory_add: ["signal shard", "bridge pass"],
      inventory_remove: ["signal shard"],
      flags_add: ["signal_seen"],
      flags_remove: ["market_seen"],
      quests: [
        {
          id: "intro-signal",
          status: "complete",
          summary: "The bridge crossing ended the quest."
        }
      ]
    }
  );
  assert.deepEqual(callOrder, ["event:player", "event:narrator", "persistPlayerState", "committedEvent"]);
  assert.deepEqual(committedEventStatuses, ["accepted"]);
});

test("turn output can be translated into a canonical replay event without treating narrative as canonical state", async () => {
  const player = createPlayer();
  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
    applyDirectorRules({ directorState }) {
      return directorState;
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "The signal lantern hummed when touched.",
        player_options: ["Inspect the lantern"],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: ["signal_seen"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "The signal now points toward the tower."
        },
        memory_updates: ["The signal lantern hummed when touched."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState() {
      return null;
    },
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    validateStateUpdates() {
      return { ok: true, errors: [] };
    },
    validateTurnOutput() {
      return { ok: true, errors: [] };
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "touch the lantern",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const canonicalEvent = createCommittedTurnEventPayload({
    eventId: "event-123",
    playerId: player.id,
    occurredAt: "2026-03-08T00:00:00.000Z",
    input: "touch the lantern",
    outcome: {
      status: "accepted",
      summary: "The player inspected the lantern and revealed the signal.",
      rejection_reason: null
    },
    committed: {
      state_updates: outcome.turnOutput.state_updates,
      director_updates: outcome.turnOutput.director_updates,
      memory_updates: outcome.turnOutput.memory_updates
    },
    rulesetVersion: "story-rules/v1",
    supplemental: {
      transcript: {
        player_text: "touch the lantern",
        narrator_text: outcome.turnOutput.narrative
      },
      presentation: {
        narrative: outcome.turnOutput.narrative,
        player_options: outcome.turnOutput.player_options
      }
    }
  });

  assert.equal(canonicalEvent.schema_version, COMMITTED_EVENT_SCHEMA_VERSION);
  assert.equal(canonicalEvent.contract_versions.authoritative_state, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.equal(canonicalEvent.outcome.status, "accepted");
  assert.equal(canonicalEvent.supplemental?.transcript?.narrator_text, outcome.turnOutput.narrative);
  assert.deepEqual(validateCanonicalTurnEvent(canonicalEvent), { ok: true, errors: [] });
});
