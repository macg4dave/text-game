import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type DirectorSpec,
  type Player,
  type QuestSpec,
  type StateUpdates,
  type TurnResult
} from "../core/types.js";
import { SYSTEM_PROMPT } from "../ai/prompt.js";
import { validateCanonicalTurnEvent } from "../rules/validator.js";
import { createCommittedTurnEventPayload } from "../server/http-contract.js";
import { createTurnService } from "./turn.js";

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

test("turn service executes the gameplay pipeline outside the server layer", async () => {
  const events: Array<{ playerId: string; role: string; content: string }> = [];
  const memoriesAdded: Array<{ playerId: string; content: string; embedding?: number[] }> = [];
  const updatedDirectorStates: string[] = [];
  const summaryUpdates: string[][] = [];
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
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    updateDirectorState(playerId) {
      updatedDirectorStates.push(playerId);
      return null;
    },
    updatePlayerState() {
      return null;
    },
    updateSummary(_playerId, memoryUpdates) {
      summaryUpdates.push(memoryUpdates);
      return null;
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
  assert.deepEqual(summaryUpdates, [["The signal lantern hummed when touched."]]);
  assert.equal(updatedDirectorStates.length, 1);
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
  const service = createTurnService({
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
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    updateDirectorState() {
      return null;
    },
    updatePlayerState() {
      return null;
    },
    updateSummary() {
      return null;
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
  assert.equal(
    (outcome.trace.result as { schema_version?: string } | null)?.schema_version,
    TURN_OUTPUT_SCHEMA_VERSION
  );
});

test("turn service commits only server-accepted state changes before storing narrator text", async () => {
  const player = createPlayer();
  const refreshedPlayer: Player = {
    ...player,
    location: "Sky Bridge",
    inventory: ["bridge pass"],
    flags: ["signal_seen"],
    quests: player.quests
  };
  const callOrder: string[] = [];
  let committedUpdates: StateUpdates | null = null;

  const service = createTurnService({
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
    updateDirectorState() {
      callOrder.push("updateDirectorState");
      return null;
    },
    updatePlayerState(_playerId, updates) {
      callOrder.push("updatePlayerState");
      committedUpdates = updates;
      return null;
    },
    updateSummary() {
      return null;
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

  assert.deepEqual(committedUpdates, {
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
  });
  assert.deepEqual(outcome.turnOutput.state_updates, committedUpdates);
  assert.deepEqual(callOrder, ["event:player", "event:narrator", "updatePlayerState", "updateDirectorState"]);
});

test("turn output can be translated into a canonical replay event without treating narrative as canonical state", async () => {
  const player = createPlayer();
  const service = createTurnService({
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
    sanitizeTurnResult(result) {
      return result as TurnResult;
    },
    updateDirectorState() {
      return null;
    },
    updatePlayerState() {
      return null;
    },
    updateSummary() {
      return null;
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
