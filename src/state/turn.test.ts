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
import { buildTurnPromptSections } from "../ai/service.js";
import { TURN_RESPONSE_SCHEMA, validateTurnResponseSchemaContract } from "../ai/turn-schema.js";
import { validateCanonicalTurnEvent, validateMemoryCandidate } from "../rules/validator.js";
import { createCommittedTurnEventPayload } from "../server/http-contract.js";
import { DRIFT_RECONCILED_PLAYER_OPTIONS } from "./presentation.js";
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

function createStorySampleDirectorSpec(): DirectorSpec {
  return {
    end_goal: "Quiet the Ghostlight Relay before it empties the district.",
    acts: [
      {
        id: "act-1",
        name: "Market Rumors",
        beats: [
          {
            id: "beat-1",
            label: "Confirm the relay is real",
            unlock_flags: ["beacon_inspected"]
          },
          {
            id: "beat-2",
            label: "Find the way into the relay route",
            required_flags: ["beacon_inspected"],
            unlock_flags: ["nila_guidance"]
          }
        ]
      }
    ]
  };
}

function createStorySampleQuestSpec(): QuestSpec {
  return {
    quests: [
      {
        id: "ghostlight_relay",
        title: "Quiet the Ghostlight Relay",
        stages: [
          {
            id: "stage-1",
            label: "Inspect the sparking market beacon in Rooftop Market",
            unlock_flags: ["beacon_inspected"]
          },
          {
            id: "stage-2",
            label: "Ask Nila Vale where the relay draws power",
            required_flags: ["beacon_inspected"],
            unlock_flags: ["nila_guidance"]
          },
          {
            id: "stage-3",
            label: "Recover the tuning fork from the Closed Stacks",
            required_flags: ["nila_guidance"],
            unlock_flags: ["tuning_fork_taken"]
          },
          {
            id: "stage-4",
            label: "Carry the tuning fork through Stormglass Causeway",
            required_flags: ["tuning_fork_taken"],
            unlock_flags: ["causeway_crossed"]
          },
          {
            id: "stage-5",
            label: "Use the tuning fork to open the Relay Vault",
            required_flags: ["causeway_crossed"],
            unlock_flags: ["vault_opened"]
          }
        ]
      }
    ]
  };
}

function createStorySamplePlayer(): Player {
  return {
    id: "player-ghostlight",
    name: "Avery",
    created_at: "2026-03-13T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "The relay keeps barking fake evacuation orders.",
    inventory: [],
    flags: [],
    quests: [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Inspect the sparking market beacon in Rooftop Market"
      }
    ],
    director_state: {
      end_goal: "Quiet the Ghostlight Relay before it empties the district.",
      current_act_id: "act-1",
      current_act: "Market Rumors",
      current_beat_id: "beat-1",
      current_beat_label: "Confirm the relay is real",
      story_beats_remaining: 4,
      end_goal_progress: "No one has proved the relay is more than panic.",
      completed_beats: []
    }
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

test("system prompt treats clarification questions and raw internal tokens as non-progress inputs", () => {
  assert.match(SYSTEM_PROMPT, /clarification|explain|what is|tell me about/i);
  assert.match(SYSTEM_PROMPT, /do not .* auto-inspect|do not .* auto-use|do not .* unlock/i);
  assert.match(SYSTEM_PROMPT, /raw internal tokens|snake_case|flag names/i);
});

test("turn prompt sections include clarification guidance for informational questions", () => {
  const promptSections = buildTurnPromptSections({
    statePack: {
      player: {
        location: "Rooftop Market",
        flags: [],
        inventory: [],
        quests: []
      }
    },
    shortHistory: ["PLAYER: hello?"],
    memories: [],
    input: "what is the market beacon?"
  });

  assert.match(promptSections, /TURN_INPUT_CLASSIFICATION/i);
  assert.match(promptSections, /clarification/i);
  assert.match(promptSections, /do not .* advance|do not .* unlock|do not .* inspect/i);
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
      return result as Record<string, unknown>;
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
      return result as Record<string, unknown>;
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
    (outcome.trace.proposedResult as { schema_version?: string } | null)?.schema_version,
    TURN_OUTPUT_SCHEMA_VERSION
  );
});

test("turn service rejects malformed raw model output instead of sanitizing it into validity", async () => {
  const player = createPlayer();
  const committedEvents: string[] = [];
  let persisted = false;

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent.outcome.status);
      }
    },
    addEvent() {},
    addMemories() {},
    async generateTurn() {
      return {
        narrative: "   ",
        player_options: ["Inspect the lantern", 7],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: "signal shard",
          inventory_remove: [],
          flags_add: [],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Still broken.",
          current_beat_id: "beat-2"
        },
        memory_updates: [],
        scene: {
          weather: "storm"
        }
      } as unknown as TurnResult;
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
      persisted = true;
      return null;
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

  assert.equal(outcome.statusCode, 400);
  assert.equal(outcome.reason, "turn_output_validation");
  assert.equal(persisted, false);
  assert.deepEqual(committedEvents, ["rejected"]);
  assert.match(String(outcome.detail), /narrative must be a non-empty string/i);
  assert.match(String(outcome.detail), /player_options/i);
  assert.match(String(outcome.detail), /state_updates\.inventory_add/i);
  assert.match(String(outcome.detail), /director_updates\.current_beat_id/i);
  assert.match(String(outcome.detail), /scene/i);
});

test("turn service trims valid raw narrative and options without changing their meaning", async () => {
  const player = createPlayer();

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
    async generateTurn() {
      return {
        narrative: "  The signal lantern hummed when touched.  ",
        player_options: ["  Inspect the lantern  ", " Leave quietly "],
        state_updates: {
          location: "  Rooftop Market  ",
          inventory_add: [],
          inventory_remove: [],
          flags_add: [" signal_seen "],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: " The signal now points toward the tower. "
        },
        memory_updates: [" The signal lantern hummed when touched. "]
      } as unknown as TurnResult;
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
    persistPlayerState(nextPlayer) {
      return nextPlayer;
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

  assert.equal(outcome.turnOutput.narrative, "The signal lantern hummed when touched.");
  assert.deepEqual(outcome.turnOutput.player_options, ["Inspect the lantern", "Leave quietly"]);
  assert.equal(outcome.turnOutput.state_updates.location, "Rooftop Market");
  assert.deepEqual(outcome.turnOutput.state_updates.inventory_add, []);
  assert.deepEqual(outcome.turnOutput.state_updates.flags_add, ["signal_seen"]);
  assert.deepEqual(outcome.turnOutput.state_updates.quests, []);
  assert.equal(outcome.turnOutput.director_updates.end_goal_progress, "The signal now points toward the tower.");
  assert.deepEqual(outcome.turnOutput.memory_updates, ["The signal lantern hummed when touched."]);
});

test("turn service rejects unearned quest and memory proposals before persistence while leaving raw turn output intact", async () => {
  const player = createPlayer();
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];
  const storedMemories: Array<{ playerId: string; content: string }> = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent() {},
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        storedMemories.push({ playerId, content: memory.content });
      });
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You declare the signal quest complete and claim the city already trusts you.",
        player_options: ["Press onward"],
        state_updates: {
          location: player.location,
          inventory_add: [],
          inventory_remove: [],
          flags_add: [],
          flags_remove: [],
          quests: [
            {
              id: "intro-signal",
              status: "complete",
              summary: "The quest is apparently finished."
            }
          ]
        },
        director_updates: {
          end_goal_progress: "The tower is basically won already."
        },
        memory_updates: ["Everyone in the city trusts the player now."]
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
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "declare victory",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createDirectorSpec(),
    questSpec: createQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.equal(outcome.turnOutput.state_updates.quests[0]?.status, "complete");
  assert.equal(outcome.turnOutput.director_updates.end_goal_progress, "The tower is basically won already.");
  assert.deepEqual(outcome.turnOutput.memory_updates, ["Everyone in the city trusts the player now."]);
  assert.equal(
    outcome.turnOutput.narrative,
    "You pause in Rooftop Market and take stock. The clearest lead is still to find the signal."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected adjudicated player state to be persisted");
  }

  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.equal(persistedPlayer.director_state.end_goal_progress, player.director_state.end_goal_progress);
  assert.equal(persistedPlayer.summary, player.summary);
  assert.deepEqual(storedMemories, []);

  assert.equal(committedEvents.length, 1);
  assert.equal(committedEvents[0]?.committed.state_updates, null);
  assert.deepEqual(committedEvents[0]?.committed.memory_updates, []);
  assert.equal(committedEvents[0]?.committed.director_updates, null);
  assert.equal(committedEvents[0]?.supplemental?.presentation?.narrative, outcome.turnOutput.narrative);
  assert.deepEqual(committedEvents[0]?.supplemental?.presentation?.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);
  assert.equal(
    committedEvents[0]?.supplemental?.proposal_presentation?.narrative,
    "You declare the signal quest complete and claim the city already trusts you."
  );
  assert.deepEqual(committedEvents[0]?.supplemental?.proposal_presentation?.player_options, ["Press onward"]);
});

test("turn service persists only adjudicated state changes when proposals include impossible removals and duplicate progress", async () => {
  const player = createPlayer();
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];
  const storedMemories: Array<{ playerId: string; content: string }> = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent() {},
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        storedMemories.push({ playerId, content: memory.content });
      });
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You cross onto the bridge, lose the shard, and somehow also finish the quest instantly.",
        player_options: ["Study the tower lights"],
        state_updates: {
          location: "Sky Bridge",
          inventory_add: ["bridge pass", "signal shard"],
          inventory_remove: ["signal shard", "imaginary token"],
          flags_add: ["signal_seen", "market_seen"],
          flags_remove: ["market_seen", "unknown-flag"],
          quests: [
            {
              id: "intro-signal",
              status: "complete",
              summary: "The bridge crossing ended the quest."
            }
          ]
        },
        director_updates: {
          end_goal_progress: "The signal now points toward the tower."
        },
        memory_updates: ["The player reached the bridge.", "The player reached the bridge."]
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
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
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

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected adjudicated player state to be persisted");
  }

  assert.deepEqual(persistedPlayer.inventory, ["bridge pass"]);
  assert.deepEqual(persistedPlayer.flags, ["signal_seen"]);
  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.equal(persistedPlayer.location, "Sky Bridge");
  assert.equal(persistedPlayer.director_state.story_beats_remaining, 2);
  assert.equal(
    outcome.turnOutput.narrative,
    "You make it to Sky Bridge. You gain bridge pass. You lose signal shard. The signal now points toward the tower."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);

  assert.equal(committedEvents.length, 1);
  assert.deepEqual(committedEvents[0]?.committed.state_updates, {
    location: "Sky Bridge",
    inventory_add: ["bridge pass"],
    inventory_remove: ["signal shard"],
    flags_add: ["signal_seen"],
    flags_remove: ["market_seen"],
    quests: []
  });
  assert.deepEqual(committedEvents[0]?.committed.memory_updates, ["The player reached the bridge."]);
  assert.equal(storedMemories.length, 1);
  assert.equal(storedMemories[0]?.content, "The player reached the bridge.");
  assert.equal(committedEvents[0]?.supplemental?.presentation?.narrative, outcome.turnOutput.narrative);
  assert.deepEqual(committedEvents[0]?.supplemental?.proposal_presentation?.player_options, ["Study the tower lights"]);
});

test("turn service accepts authored off-beat travel from quest prerequisites even when the director beat is stale", async () => {
  const player: Player = {
    id: "player-ghostlight",
    name: "Avery",
    created_at: "2026-03-13T00:00:00.000Z",
    location: "Lantern Walk",
    summary: "Nila already pointed you toward the Closed Stacks.",
    inventory: [],
    flags: ["beacon_inspected", "nila_guidance"],
    quests: [
      {
        id: "ghostlight_relay",
        status: "active",
        summary: "Recover the tuning fork from the Closed Stacks"
      }
    ],
    director_state: {
      end_goal: "Quiet the Ghostlight Relay before it empties the district.",
      current_act_id: "act-1",
      current_act: "Market Rumors",
      current_beat_id: "beat-1",
      current_beat_label: "Confirm the relay is real",
      story_beats_remaining: 4,
      end_goal_progress: "No one has proved the relay is more than panic.",
      completed_beats: []
    }
  };

  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You push past the panic and head straight into the Closed Stacks.",
        player_options: ["Search for the tuning fork"],
        state_updates: {
          location: "Closed Stacks",
          inventory_add: ["tuning_fork"],
          inventory_remove: [],
          flags_add: ["tuning_fork_taken"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Next step: Carry the tuning fork through Stormglass Causeway."
        },
        memory_updates: ["The player reached the Closed Stacks and secured the tuning fork."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "head for the Closed Stacks before anyone stops you",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the off-beat but authored move to persist");
  }

  assert.equal(persistedPlayer.location, "Closed Stacks");
  assert.deepEqual(persistedPlayer.flags, ["beacon_inspected", "nila_guidance", "tuning_fork_taken"]);
  assert.deepEqual(persistedPlayer.inventory, ["tuning_fork"]);
  assert.deepEqual(persistedPlayer.quests, [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Carry the tuning fork through Stormglass Causeway"
    }
  ]);
});

test("turn service blocks clarification-style inputs from unlocking quest progression", async () => {
  const player = createStorySamplePlayer();
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent() {},
    addMemories() {},
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "The market beacon is the sparking loudspeaker throwing false evacuation orders across the stalls.",
        player_options: ["Inspect the market beacon", "Ask who wired it"],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: ["beacon_inspected"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Next step: Ask Nila Vale where the relay draws power."
        },
        memory_updates: ["The beacon is tied to the Ghostlight Relay."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "what is the market beacon?",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the turn pipeline to persist the adjudicated state");
  }

  assert.deepEqual(persistedPlayer.flags, []);
  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.equal(persistedPlayer.director_state.end_goal_progress, player.director_state.end_goal_progress);
  assert.equal(
    outcome.turnOutput.narrative,
    "You pause in Rooftop Market and take stock. The clearest lead is still to confirm the relay is real."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);
  assert.equal(committedEvents[0]?.committed.state_updates, null);
  assert.equal(committedEvents[0]?.committed.director_updates, null);
  assert.deepEqual(committedEvents[0]?.committed.memory_updates, []);
});

test("turn service blocks raw internal tokens from acting like valid story commands", async () => {
  const player = createStorySamplePlayer();
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent() {},
    addMemories() {},
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "The recessed panel clicks open beneath the beacon housing.",
        player_options: ["Reach into the panel"],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: ["beacon_inspected"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Next step: Ask Nila Vale where the relay draws power."
        },
        memory_updates: ["The raw token somehow triggered the beacon."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "beacon_inspected",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the turn pipeline to persist the adjudicated state");
  }

  assert.deepEqual(persistedPlayer.flags, []);
  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.equal(
    outcome.turnOutput.narrative,
    "You pause in Rooftop Market and take stock. The clearest lead is still to confirm the relay is real."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);
  assert.equal(committedEvents[0]?.committed.state_updates, null);
  assert.equal(committedEvents[0]?.committed.director_updates, null);
  assert.deepEqual(committedEvents[0]?.committed.memory_updates, []);
});

test("turn service rejects stage-skipping travel and progression before director framing can treat it as truth", async () => {
  const player = createStorySamplePlayer();

  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent() {},
    addMemories() {},
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You somehow appear inside the Relay Vault and wrench the final switch.",
        player_options: ["Retune the relay"],
        state_updates: {
          location: "Relay Vault",
          inventory_add: [],
          inventory_remove: [],
          flags_add: ["vault_opened"],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "The relay route is solved already."
        },
        memory_updates: ["The player was suddenly in the Relay Vault."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings() {
      return [];
    },
    getOrCreatePlayer() {
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "skip straight into the Relay Vault",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the adjudicated player state to persist");
  }

  assert.equal(persistedPlayer.location, "Rooftop Market");
  assert.deepEqual(persistedPlayer.flags, []);
  assert.equal(persistedPlayer.director_state.end_goal_progress, player.director_state.end_goal_progress);
  assert.equal(
    outcome.turnOutput.narrative,
    "You pause in Rooftop Market and take stock. The clearest lead is still to confirm the relay is real."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);
  assert.equal(committedEvents[0]?.committed.state_updates, null);
  assert.equal(committedEvents[0]?.committed.director_updates, null);
  assert.deepEqual(committedEvents[0]?.committed.memory_updates, []);
});

test("turn service returns a 500 outcome when model execution throws unexpectedly", async () => {
  const player = createPlayer();
  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
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
      return result as Record<string, unknown>;
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
    quests: player.quests,
    director_state: {
      ...player.director_state,
      story_beats_remaining: 2,
      end_goal_progress: "You now have a clear route toward the tower.",
      completed_beats: ["beat-1"]
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
      return result as Record<string, unknown>;
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

  const canonicalEvent = outcome.trace.committedEvent;

  assert.ok(canonicalEvent);
  assert.equal(canonicalEvent.schema_version, COMMITTED_EVENT_SCHEMA_VERSION);
  assert.equal(canonicalEvent.contract_versions.authoritative_state, AUTHORITATIVE_STATE_SCHEMA_VERSION);
  assert.equal(canonicalEvent.outcome.status, "accepted");
  assert.equal(canonicalEvent.supplemental?.transcript?.narrator_text, outcome.turnOutput.narrative);
  assert.deepEqual(canonicalEvent.committed.state_updates, {
    location: "Rooftop Market",
    inventory_add: [],
    inventory_remove: [],
    flags_add: ["signal_seen"],
    flags_remove: [],
    quests: []
  });
  assert.deepEqual(validateCanonicalTurnEvent(canonicalEvent), { ok: true, errors: [] });
});

test("turn service stores accepted presentation separately from raw proposal presentation when authority drift is reconciled", async () => {
  const player = createPlayer();
  const events: Array<{ role: string; content: string }> = [];
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent(event) {
      const turnEvent = getTurnResolutionEvent(event);
      if (turnEvent) {
        committedEvents.push(turnEvent);
      }
    },
    addEvent(_playerId, role, content) {
      events.push({ role, content });
    },
    addMemories() {},
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "You stride onto the bridge and the quest is complete.",
        player_options: ["Celebrate the finished quest"],
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
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return [];
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
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

  assert.equal(
    outcome.turnOutput.narrative,
    "You make it to Sky Bridge. You gain bridge pass. You lose signal shard. You now have a clear route toward the tower."
  );
  assert.deepEqual(outcome.turnOutput.player_options, [...DRIFT_RECONCILED_PLAYER_OPTIONS]);
  assert.equal(outcome.trace.proposedResult?.narrative, "You stride onto the bridge and the quest is complete.");
  assert.equal(events[1]?.content, outcome.turnOutput.narrative);
  assert.equal(committedEvents[0]?.supplemental?.presentation?.narrative, outcome.turnOutput.narrative);
  assert.equal(
    committedEvents[0]?.supplemental?.proposal_presentation?.narrative,
    "You stride onto the bridge and the quest is complete."
  );
  assert.deepEqual(
    committedEvents[0]?.supplemental?.proposal_presentation?.player_options,
    ["Celebrate the finished quest"]
  );
});
