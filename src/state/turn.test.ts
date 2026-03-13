import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  COMMITTED_EVENT_SCHEMA_VERSION,
  LIVE_CONTEXT_BUCKET_LIMITS,
  MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION,
  MEMORY_CLASS_RULES,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalEventPayload,
  type CanonicalTurnEventPayload,
  type DirectorSpec,
  type LiveTurnContext,
  type MemoryCandidate,
  type MemorySummaryArtifact,
  type NpcEncounterFact,
  type NpcMemoryRecord,
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
import {
  buildNpcMemoryRecord,
  evaluateNpcEncounterSignificance,
  resolveNpcImportanceTier
} from "./encounter-facts.js";
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

function createGroundedTurnHarness({
  player,
  shortHistory = []
}: {
  player: Player;
  shortHistory?: string[];
}) {
  const committedEvents: CanonicalTurnEventPayload[] = [];
  const persistedPlayers: Player[] = [];
  let generateTurnCalls = 0;
  let embeddingCalls = 0;

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
      generateTurnCalls += 1;
      throw new Error("scene grounding should resolve before model generation");
    },
    async getEmbedding() {
      embeddingCalls += 1;
      throw new Error("scene grounding should not request embeddings");
    },
    async getEmbeddings() {
      embeddingCalls += 1;
      throw new Error("scene grounding should not request embeddings");
    },
    getOrCreatePlayer() {
      return persistedPlayers.at(-1) ?? player;
    },
    getRelevantMemories() {
      return [];
    },
    getShortHistory() {
      return shortHistory;
    },
    persistPlayerState(nextPlayer) {
      persistedPlayers.push(nextPlayer);
      return nextPlayer;
    }
  });

  return {
    service,
    committedEvents,
    persistedPlayers,
    getGenerateTurnCalls() {
      return generateTurnCalls;
    },
    getEmbeddingCalls() {
      return embeddingCalls;
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

test("turn prompt sections include explicit live-context budgets and keep cold history excluded by default", () => {
  const liveContext: LiveTurnContext = {
    budgets: {
      short_history: { bucket: "short_history", limit: LIVE_CONTEXT_BUCKET_LIMITS.short_history, include_by_default: true },
      quest_progress: { bucket: "quest_progress", limit: LIVE_CONTEXT_BUCKET_LIMITS.quest_progress, include_by_default: true },
      relationship_summaries: { bucket: "relationship_summaries", limit: LIVE_CONTEXT_BUCKET_LIMITS.relationship_summaries, include_by_default: true },
      world_facts: { bucket: "world_facts", limit: LIVE_CONTEXT_BUCKET_LIMITS.world_facts, include_by_default: true },
      cold_history: { bucket: "cold_history", limit: LIVE_CONTEXT_BUCKET_LIMITS.cold_history, include_by_default: false }
    },
    buckets: {
      short_history: ["PLAYER: ask about Nila", "NARRATOR: The beacon crackles overhead."],
      quest_progress: ["QUEST: Ask Nila Vale where the relay draws power.", "GOAL: Confirm the relay is real."],
      relationship_summaries: ["Nila Vale: now trusts the player with the causeway route."],
      world_facts: ["The beacon is tied to the Ghostlight Relay."],
      cold_history: []
    },
    recalled_facts: [
      "Nila Vale: now trusts the player with the causeway route.",
      "QUEST: Ask Nila Vale where the relay draws power.",
      "GOAL: Confirm the relay is real.",
      "The beacon is tied to the Ghostlight Relay."
    ]
  };

  const promptSections = buildTurnPromptSections({
    statePack: {
      player: {
        location: "Rooftop Market",
        flags: [],
        inventory: [],
        quests: []
      }
    },
    shortHistory: [],
    memories: [],
    liveContext,
    input: "ask Nila where the relay draws power"
  });

  assert.match(promptSections, /LIVE_CONTEXT_BUDGETS/i);
  assert.match(promptSections, /RELATIONSHIP_SUMMARIES/i);
  assert.match(promptSections, /WORLD_FACTS/i);
  assert.match(promptSections, /COLD_HISTORY\n\(excluded by default; budget 0\)/i);
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

test("npc encounter significance rises with stable identity, meaningful exchange, and voluntary return", () => {
  const firstEncounter: NpcEncounterFact = {
    npc_id: "npc-nila-vale",
    display_name: "Nila Vale",
    role: "relay mechanic",
    location: "Rooftop Market",
    topics: ["ghostlight relay"],
    promises: [],
    clues: [],
    mood: "hurried",
    relationship_change: null,
    last_seen_beat: "beat-1",
    encounter_count: 1,
    significance: 0,
    summary: "Nila Vale warns that the beacon is tied to the Ghostlight Relay.",
    source_event_id: "turn-evt-1",
    last_seen_at: "2026-03-13T12:00:00.000Z"
  };

  const returnedEncounter: NpcEncounterFact = {
    ...firstEncounter,
    topics: ["ghostlight relay", "causeway route"],
    promises: ["Meet the player at the causeway gate"],
    clues: ["The relay draws power through Stormglass Causeway"],
    relationship_change: "Nila now trusts the player with the relay route.",
    last_seen_beat: "beat-2",
    encounter_count: 2,
    summary: "Nila Vale shared the causeway route and promised to meet the player there.",
    source_event_id: "turn-evt-2",
    last_seen_at: "2026-03-13T12:05:00.000Z"
  };

  const firstResult = evaluateNpcEncounterSignificance({
    fact: firstEncounter,
    previousFacts: [],
    voluntaryReturn: false
  });
  const returnedResult = evaluateNpcEncounterSignificance({
    fact: returnedEncounter,
    previousFacts: [firstEncounter],
    voluntaryReturn: true
  });

  assert.ok(firstResult.score < returnedResult.score);
  assert.equal(firstResult.shouldPromoteToLongLivedMemory, false);
  assert.equal(returnedResult.shouldPromoteToLongLivedMemory, true);
  assert.ok(returnedResult.breakdown.stable_identity > 0);
  assert.ok(returnedResult.breakdown.repeated_meaningful_exchange > 0);
  assert.ok(returnedResult.breakdown.promises > 0);
  assert.ok(returnedResult.breakdown.clues > 0);
  assert.ok(returnedResult.breakdown.relationship_change > 0);
  assert.ok(returnedResult.breakdown.voluntary_return > 0);
});

test("npc importance tiers promote from known to important to anchor cast as significance and re-engagement accumulate", () => {
  assert.equal(resolveNpcImportanceTier({ cumulativeSignificance: 1, encounterCount: 1, voluntaryReturn: false }), "ambient");
  assert.equal(resolveNpcImportanceTier({ cumulativeSignificance: 3, encounterCount: 1, voluntaryReturn: false }), "known");
  assert.equal(resolveNpcImportanceTier({ cumulativeSignificance: 7, encounterCount: 2, voluntaryReturn: true }), "important");
  assert.equal(resolveNpcImportanceTier({ cumulativeSignificance: 10, encounterCount: 3, voluntaryReturn: true }), "anchor_cast");
});

test("npc memory records stay sparse by tier while preserving identity cheaply", () => {
  const knownRecord = buildNpcMemoryRecord({
    fact: {
      npc_id: "npc-nila-vale",
      display_name: "Nila Vale",
      role: "relay mechanic",
      location: "Rooftop Market",
      topics: ["ghostlight relay"],
      promises: [],
      clues: [],
      mood: "hurried",
      relationship_change: null,
      last_seen_beat: "beat-1",
      encounter_count: 1,
      significance: 3,
      summary: "Nila Vale warns that the beacon is tied to the Ghostlight Relay.",
      source_event_id: "turn-evt-1",
      last_seen_at: "2026-03-13T12:00:00.000Z",
      quest_hooks: []
    },
    previousRecord: null,
    previousFacts: [],
    voluntaryReturn: false
  });

  const anchorRecord = buildNpcMemoryRecord({
    fact: {
      npc_id: "npc-nila-vale",
      display_name: "Nila Vale",
      role: "relay mechanic",
      location: "Rooftop Market",
      topics: ["ghostlight relay", "causeway route", "relay vault"],
      promises: ["Meet the player at the causeway gate"],
      clues: ["The relay draws power through Stormglass Causeway"],
      mood: "steady",
      relationship_change: "Nila now trusts the player with the relay route.",
      last_seen_beat: "beat-3",
      encounter_count: 3,
      significance: 10,
      summary: "Nila Vale now trusts the player, shared the causeway route, and promised to meet at the gate.",
      source_event_id: "turn-evt-3",
      last_seen_at: "2026-03-13T12:10:00.000Z",
      quest_hooks: ["Open the Relay Vault"]
    },
    previousRecord: knownRecord,
    previousFacts: [],
    voluntaryReturn: true
  });

  assert.equal(knownRecord.tier, "known");
  assert.deepEqual(knownRecord.remembered_topics, ["ghostlight relay"]);
  assert.equal(knownRecord.relationship_state, null);
  assert.deepEqual(knownRecord.open_threads, []);

  assert.equal(anchorRecord.tier, "anchor_cast");
  assert.deepEqual(anchorRecord.remembered_topics, ["ghostlight relay", "causeway route", "relay vault"]);
  assert.equal(anchorRecord.relationship_state, "Nila now trusts the player with the relay route.");
  assert.deepEqual(anchorRecord.open_threads, ["Meet the player at the causeway gate", "Open the Relay Vault"]);
  assert.ok(anchorRecord.retrieval_priority > knownRecord.retrieval_priority);
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
  let capturedLiveContext: LiveTurnContext | undefined;

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
      capturedLiveContext = params.liveContext;
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
  assert.deepEqual(capturedMemories, [
    "QUEST: You noticed the first signal marker.",
    "GOAL: You have started the search.",
    "You heard the market signal last night."
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.short_history, ["PLAYER: look around"]);
  assert.deepEqual(capturedLiveContext?.buckets.quest_progress, [
    "QUEST: You noticed the first signal marker.",
    "GOAL: You have started the search."
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.relationship_summaries, []);
  assert.deepEqual(capturedLiveContext?.buckets.world_facts, ["You heard the market signal last night."]);
  assert.deepEqual(capturedLiveContext?.buckets.cold_history, []);
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
  const factMemories = memoriesAdded.filter((memory) => !memory.content.startsWith('{"schema_version":"memory-summary/v1"'));
  const summaryArtifacts = memoriesAdded.filter((memory) => memory.content.startsWith('{"schema_version":"memory-summary/v1"'));
  assert.deepEqual(factMemories, [
    {
      playerId: player.id,
      content: "The signal lantern hummed when touched.",
      embedding: [0.1, 0.2]
    }
  ]);
  assert.equal(summaryArtifacts.length, 1);
});

test("turn service applies fixed live-context bucket ceilings and keeps transcript-like memory cold by default", async () => {
  const player = createStorySamplePlayer();
  let capturedLiveContext: LiveTurnContext | undefined;

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories() {},
    async generateTurn(params): Promise<TurnResult> {
      capturedLiveContext = params.liveContext;
      return {
        narrative: "Nila points across the causeway and taps the route in the dust.",
        player_options: ["Follow the route"],
        state_updates: {
          location: "Rooftop Market",
          inventory_add: [],
          inventory_remove: [],
          flags_add: [],
          flags_remove: [],
          quests: []
        },
        director_updates: {
          end_goal_progress: "Next step: Head for Stormglass Causeway."
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
      return [
        "Nila Vale: now trusts the player with the causeway route.",
        "The beacon is tied to the Ghostlight Relay.",
        "PLAYER: old transcript noise should stay cold.",
        "Stormglass Causeway is exposed during lightning surges.",
        "Relay Vault requires a tuning fork."
      ];
    },
    getShortHistory() {
      return [
        "PLAYER: ask about the route",
        "NARRATOR: Nila checks the alley behind you.",
        "PLAYER: ask again about the causeway"
      ];
    },
    persistPlayerState(nextPlayer) {
      return nextPlayer;
    }
  });

  const outcome = await service.executeTurn({
    player,
    input: "ask Nila where the causeway route starts",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(capturedLiveContext?.buckets.short_history, [
    "NARRATOR: Nila checks the alley behind you.",
    "PLAYER: ask again about the causeway"
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.relationship_summaries, [
    "Nila Vale: now trusts the player with the causeway route."
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.quest_progress, [
    "QUEST: Inspect the sparking market beacon in Rooftop Market",
    "GOAL: No one has proved the relay is more than panic."
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.world_facts, [
    "The beacon is tied to the Ghostlight Relay.",
    "Stormglass Causeway is exposed during lightning surges."
  ]);
  assert.deepEqual(capturedLiveContext?.buckets.cold_history, []);
  assert.deepEqual(capturedLiveContext?.recalled_facts, [
    "Nila Vale: now trusts the player with the causeway route.",
    "QUEST: Inspect the sparking market beacon in Rooftop Market",
    "GOAL: No one has proved the relay is more than panic.",
    "The beacon is tied to the Ghostlight Relay.",
    "Stormglass Causeway is exposed during lightning surges."
  ]);
});

test("turn service persists tiered npc memory snapshots so identity is cheap while richer recall waits for higher importance", async () => {
  const player = createStorySamplePlayer();
  const memoriesAdded: Array<{ playerId: string; content: string; kind?: string; embedding?: number[] }> = [];
  const persistedPlayers: Player[] = [];
  const lowSignificanceFact: NpcEncounterFact = {
    npc_id: "npc-nila-vale",
    display_name: "Nila Vale",
    role: "relay mechanic",
    location: "Rooftop Market",
    topics: ["ghostlight relay"],
    promises: [],
    clues: [],
    mood: "hurried",
    relationship_change: null,
    last_seen_beat: "beat-1",
    encounter_count: 1,
    significance: 0,
    summary: "Nila Vale warns that the beacon is tied to the Ghostlight Relay.",
    source_event_id: "turn-evt-1",
    last_seen_at: "2026-03-13T12:00:00.000Z"
  };
  const highSignificanceFact: NpcEncounterFact = {
    ...lowSignificanceFact,
    topics: ["ghostlight relay", "causeway route"],
    promises: ["Meet the player at the causeway gate"],
    clues: ["The relay draws power through Stormglass Causeway"],
    relationship_change: "Nila now trusts the player with the relay route.",
    last_seen_beat: "beat-3",
    encounter_count: 3,
    summary: "Nila Vale shared the causeway route and promised to meet the player there.",
    source_event_id: "turn-evt-2",
    last_seen_at: "2026-03-13T12:05:00.000Z"
  };
  let encounterFactCalls = 0;
  let memoryRecordCalls = 0;

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        memoriesAdded.push({
          playerId,
          content: memory.content,
          kind: "kind" in memory ? String(memory.kind) : undefined,
          embedding: memory.embedding
        });
      });
    },
    async deriveNpcEncounterFacts() {
      encounterFactCalls += 1;
      return encounterFactCalls === 1 ? [lowSignificanceFact] : [highSignificanceFact];
    },
    getNpcEncounterFacts() {
      return encounterFactCalls > 1 ? [lowSignificanceFact] : [];
    },
    getNpcMemoryRecords() {
      memoryRecordCalls += 1;
      if (memoryRecordCalls > 1) {
        const firstNpcMemory = JSON.parse(memoriesAdded[2]?.content ?? "null") as NpcMemoryRecord | null;
        return firstNpcMemory ? [firstNpcMemory] : [];
      }

      return [];
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "Nila steadies the beacon housing and points toward the causeway.",
        player_options: ["Ask about the causeway"],
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
    async getEmbeddings({ inputs }) {
      return inputs.map(() => []);
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

  const firstOutcome = await service.executeTurn({
    player,
    input: "ask Nila what the beacon is doing",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(firstOutcome.ok, true);
  assert.deepEqual(memoriesAdded.slice(0, 5).map((memory) => memory.kind), [
    "fact",
    "npc-encounter-fact",
    "npc-memory",
    "memory-summary-artifact",
    "memory-summary-artifact"
  ]);
  const firstNpcMemory = JSON.parse(memoriesAdded[2]?.content ?? "null") as NpcMemoryRecord | null;
  assert.equal(firstNpcMemory?.tier, "known");
  assert.deepEqual(firstNpcMemory?.remembered_topics, ["ghostlight relay"]);
  assert.deepEqual(firstNpcMemory?.open_threads, []);

  const secondPlayer = persistedPlayers.at(-1) ?? player;
  const secondOutcome = await service.executeTurn({
    player: secondPlayer,
    input: "go back to Nila and ask where the causeway route starts",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(secondOutcome.ok, true);
  assert.deepEqual(memoriesAdded.map((memory) => memory.kind), [
    "fact",
    "npc-encounter-fact",
    "npc-memory",
    "memory-summary-artifact",
    "memory-summary-artifact",
    "npc-encounter-fact",
    "npc-memory"
  ]);
  assert.match(memoriesAdded[1]?.content ?? "", /Nila Vale/);
  const secondNpcMemory = JSON.parse(memoriesAdded[6]?.content ?? "null") as NpcMemoryRecord | null;
  assert.equal(secondNpcMemory?.tier, "anchor_cast");
  assert.match(secondNpcMemory?.summary ?? "", /causeway route/i);
  assert.deepEqual(secondNpcMemory?.open_threads, ["Meet the player at the causeway gate"]);
});

test("turn service persists versioned scene summaries and beat recaps when a committed turn advances the beat", async () => {
  const player = createStorySamplePlayer();
  const memoriesAdded: Array<{ playerId: string; content: string; kind?: string }> = [];
  const persistedPlayers: Player[] = [];

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        memoriesAdded.push({
          playerId,
          content: memory.content,
          kind: "kind" in memory ? String(memory.kind) : undefined
        });
      });
    },
    async deriveNpcEncounterFacts() {
      return [];
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "The signal lantern revealed the route toward the bridge.",
        player_options: ["Cross the bridge"],
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
        memory_updates: ["The market beacon is tied to the Ghostlight Relay."]
      };
    },
    async getEmbedding() {
      return [];
    },
    async getEmbeddings({ inputs }) {
      return inputs.map(() => []);
    },
    getMemorySummaryArtifacts() {
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
    input: "cross toward the bridge",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  const summaryArtifacts = memoriesAdded.filter((memory) => memory.kind === "memory-summary-artifact");
  assert.equal(summaryArtifacts.length, 2);

  const sceneSummary = JSON.parse(summaryArtifacts[0]?.content ?? "null") as MemorySummaryArtifact | null;
  const beatRecap = JSON.parse(summaryArtifacts[1]?.content ?? "null") as MemorySummaryArtifact | null;

  assert.equal(sceneSummary?.schema_version, MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION);
  assert.equal(sceneSummary?.artifact_kind, "scene-summary");
  assert.equal(sceneSummary?.beat_id, "beat-1");
  assert.equal(sceneSummary?.location, "Rooftop Market");
  assert.match(sceneSummary?.summary ?? "", /Ghostlight Relay/i);
  assert.deepEqual(sceneSummary?.detail_lines, ["The market beacon is tied to the Ghostlight Relay."]);

  assert.equal(beatRecap?.schema_version, MEMORY_SUMMARY_ARTIFACT_SCHEMA_VERSION);
  assert.equal(beatRecap?.artifact_kind, "beat-recap");
  assert.equal(beatRecap?.beat_id, "beat-1");
  assert.match(beatRecap?.summary ?? "", /Confirm the relay is real/i);
  assert.deepEqual(beatRecap?.source_event_ids, sceneSummary?.source_event_ids);
});

test("turn service generates embeddings for admitted durable memory records but leaves raw encounter facts unembedded", async () => {
  const player = createStorySamplePlayer();
  const memoriesAdded: Array<{ playerId: string; content: string; kind?: string; embedding?: number[] }> = [];
  const persistedPlayers: Player[] = [];
  const capturedEmbeddingInputs: string[][] = [];
  const encounterFact: NpcEncounterFact = {
    npc_id: "npc-nila-vale",
    display_name: "Nila Vale",
    role: "relay mechanic",
    location: "Rooftop Market",
    topics: ["ghostlight relay", "causeway route"],
    promises: ["Meet the player at the causeway gate"],
    clues: ["The relay draws power through Stormglass Causeway"],
    mood: "steady",
    relationship_change: "Nila now trusts the player with the relay route.",
    last_seen_beat: "beat-1",
    encounter_count: 2,
    significance: 0,
    summary: "Nila Vale shared the causeway route and promised to meet the player there.",
    source_event_id: "turn-evt-embed-1",
    last_seen_at: "2026-03-13T12:05:00.000Z",
    quest_hooks: ["Open the Relay Vault"]
  };

  const service = createTurnService({
    addCommittedTurnEvent() {},
    addEvent() {},
    addMemories(playerId, memoryList) {
      memoryList.forEach((memory) => {
        memoriesAdded.push({
          playerId,
          content: memory.content,
          kind: "kind" in memory ? String(memory.kind) : undefined,
          embedding: memory.embedding
        });
      });
    },
    async deriveNpcEncounterFacts() {
      return [encounterFact];
    },
    async generateTurn(): Promise<TurnResult> {
      return {
        narrative: "Nila points toward Stormglass Causeway and marks the relay route in chalk.",
        player_options: ["Follow the route"],
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
    async getEmbeddings({ inputs }) {
      capturedEmbeddingInputs.push(inputs);
      return inputs.map((input, index) => [index + 1, input.length]);
    },
    getMemorySummaryArtifacts() {
      return [];
    },
    getNpcEncounterFacts() {
      return [];
    },
    getNpcMemoryRecords() {
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
    input: "ask Nila where the causeway route starts",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  assert.equal(capturedEmbeddingInputs.length, 1);
  assert.equal(capturedEmbeddingInputs[0]?.length, 4);
  assert.equal(capturedEmbeddingInputs[0]?.[0], "The beacon is tied to the Ghostlight Relay.");
  assert.match(capturedEmbeddingInputs[0]?.[1] ?? "", /Nila Vale/i);
  assert.match(capturedEmbeddingInputs[0]?.[1] ?? "", /causeway route/i);
  assert.match(capturedEmbeddingInputs[0]?.[2] ?? "", /scene-summary/i);
  assert.match(capturedEmbeddingInputs[0]?.[2] ?? "", /Ghostlight Relay/i);
  assert.match(capturedEmbeddingInputs[0]?.[3] ?? "", /beat-recap/i);
  assert.match(capturedEmbeddingInputs[0]?.[3] ?? "", /Confirm the relay is real/i);

  const factMemory = memoriesAdded.find((memory) => memory.kind === "fact");
  const encounterMemory = memoriesAdded.find((memory) => memory.kind === "npc-encounter-fact");
  const npcMemory = memoriesAdded.find((memory) => memory.kind === "npc-memory");
  const summaryArtifacts = memoriesAdded.filter((memory) => memory.kind === "memory-summary-artifact");

  assert.deepEqual(factMemory?.embedding, [1, "The beacon is tied to the Ghostlight Relay.".length]);
  assert.equal(encounterMemory?.embedding, undefined);
  assert.deepEqual(npcMemory?.embedding, [2, capturedEmbeddingInputs[0]?.[1]?.length ?? 0]);
  assert.deepEqual(summaryArtifacts.map((memory) => memory.embedding), [
    [3, capturedEmbeddingInputs[0]?.[2]?.length ?? 0],
    [4, capturedEmbeddingInputs[0]?.[3]?.length ?? 0]
  ]);
  assert.deepEqual(outcome.ok ? outcome.trace.memoryEmbeddings : [], [
    [1, "The beacon is tied to the Ghostlight Relay.".length],
    [2, capturedEmbeddingInputs[0]?.[1]?.length ?? 0],
    [3, capturedEmbeddingInputs[0]?.[2]?.length ?? 0],
    [4, capturedEmbeddingInputs[0]?.[3]?.length ?? 0]
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
  assert.deepEqual(outcome.trace.memories, [
    "QUEST: You noticed the first signal marker.",
    "GOAL: You have started the search."
  ]);
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
  assert.equal(storedMemories.length, 2);
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
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
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

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the turn pipeline to persist the adjudicated state");
  }

  assert.deepEqual(persistedPlayer.flags, []);
  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.equal(persistedPlayer.director_state.end_goal_progress, player.director_state.end_goal_progress);
  assert.match(outcome.turnOutput.narrative, /market beacon/i);
  assert.match(outcome.turnOutput.narrative, /false evacuation orders|loudspeaker/i);
  assert.ok(outcome.turnOutput.player_options.includes("Inspect the market beacon"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
  assert.equal(harness.committedEvents[0]?.committed.director_updates, null);
  assert.deepEqual(harness.committedEvents[0]?.committed.memory_updates, []);
});

test("turn service answers look around with authored scene grounding from the opening hub", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
    player,
    input: "look around",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the grounded turn to persist player state");
  }

  assert.deepEqual(persistedPlayer.flags, []);
  assert.deepEqual(persistedPlayer.quests, player.quests);
  assert.match(outcome.turnOutput.narrative, /Rooftop Market/);
  assert.match(outcome.turnOutput.narrative, /market beacon/i);
  assert.match(outcome.turnOutput.narrative, /Nila Vale/);
  assert.match(outcome.turnOutput.narrative, /stairwell|stairs/i);
  assert.ok(outcome.turnOutput.player_options.includes("Inspect the market beacon"));
  assert.ok(outcome.turnOutput.player_options.includes("Ask Nila Vale what she has seen"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
  assert.equal(harness.committedEvents[0]?.committed.director_updates, null);
  assert.deepEqual(harness.committedEvents[0]?.committed.memory_updates, []);
});

test("turn service resolves short referential follow-ups against the current salient anchor", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({
    player,
    shortHistory: [
      "NARRATOR: Canvas awnings snap above the stalls while the market beacon spits false evacuation orders over the crowd."
    ]
  });

  const outcome = await harness.service.executeTurn({
    player,
    input: "what is that?",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.match(outcome.turnOutput.narrative, /market beacon/i);
  assert.match(outcome.turnOutput.narrative, /false evacuation orders|rewired|loudspeaker/i);
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
});

test("turn service resolves tell-me-more follow-ups against the current salient anchor", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({
    player,
    shortHistory: [
      "NARRATOR: Canvas awnings snap above the stalls while the market beacon spits false evacuation orders over the crowd."
    ]
  });

  const outcome = await harness.service.executeTurn({
    player,
    input: "tell me more about that",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  assert.match(outcome.turnOutput.narrative, /market beacon/i);
  assert.match(outcome.turnOutput.narrative, /false evacuation orders|loudspeaker|rewired/i);
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
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

test("turn service grounds beacon inspection before the model can improvise it", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
    player,
    input: "inspect the market beacon",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the grounded beacon inspection to persist state");
  }

  assert.deepEqual(persistedPlayer.flags, ["beacon_inspected"]);
  assert.deepEqual(persistedPlayer.quests, [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Ask Nila Vale where the relay draws power"
    }
  ]);
  assert.match(outcome.turnOutput.narrative, /Ghostlight Relay/i);
  assert.match(outcome.turnOutput.narrative, /false evacuation orders|fresh copper|rewired/i);
  assert.ok(outcome.turnOutput.player_options.includes("Ask Nila Vale where the relay draws power"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.deepEqual(harness.committedEvents[0]?.committed.state_updates?.flags_add, ["beacon_inspected"]);
  assert.deepEqual(harness.committedEvents[0]?.committed.memory_updates, [
    "The market beacon is broadcasting false evacuation orders tied to the Ghostlight Relay."
  ]);
});

test("turn service answers topical ask turns with grounded NPC detail in the opening hub", async () => {
  const initialPlayer = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player: initialPlayer });

  const inspectOutcome = await harness.service.executeTurn({
    player: initialPlayer,
    input: "inspect the market beacon",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(inspectOutcome.ok, true);
  if (!inspectOutcome.ok) {
    return;
  }

  const postInspectPlayer = harness.persistedPlayers.at(-1);
  if (!postInspectPlayer) {
    throw new Error("expected beacon inspection to persist before the follow-up question");
  }

  const askOutcome = await harness.service.executeTurn({
    player: postInspectPlayer,
    input: "ask Nila Vale about the Ghostlight Relay",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(askOutcome.ok, true);
  if (!askOutcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected the grounded ask-about turn to persist state");
  }

  assert.deepEqual(persistedPlayer.flags, ["beacon_inspected", "nila_guidance"]);
  assert.deepEqual(persistedPlayer.quests, [
    {
      id: "ghostlight_relay",
      status: "active",
      summary: "Recover the tuning fork from the Closed Stacks"
    }
  ]);
  assert.match(askOutcome.turnOutput.narrative, /Nila/i);
  assert.match(askOutcome.turnOutput.narrative, /Stormglass Causeway/i);
  assert.ok(askOutcome.turnOutput.player_options.includes("Head for the Closed Stacks"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.deepEqual(harness.committedEvents.at(-1)?.committed.state_updates?.flags_add, ["nila_guidance"]);
});

test("turn service treats first-person NPC speech as a grounded dialogue attempt when the target is clear", async () => {
  const initialPlayer = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player: initialPlayer });

  const inspectOutcome = await harness.service.executeTurn({
    player: initialPlayer,
    input: "inspect the market beacon",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(inspectOutcome.ok, true);
  if (!inspectOutcome.ok) {
    return;
  }

  const postInspectPlayer = harness.persistedPlayers.at(-1);
  if (!postInspectPlayer) {
    throw new Error("expected beacon inspection to persist before the first-person follow-up");
  }

  const askOutcome = await harness.service.executeTurn({
    player: postInspectPlayer,
    input: "I ask Nila where the power comes from",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(askOutcome.ok, true);
  if (!askOutcome.ok) {
    return;
  }

  assert.match(askOutcome.turnOutput.narrative, /Nila/i);
  assert.match(askOutcome.turnOutput.narrative, /Stormglass Causeway/i);
  assert.ok(askOutcome.turnOutput.player_options.includes("Head for the Closed Stacks"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.deepEqual(harness.committedEvents.at(-1)?.committed.state_updates?.flags_add, ["nila_guidance"]);
});

test("turn service treats quoted speech as a grounded dialogue attempt when the current actor is salient", async () => {
  const initialPlayer = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player: initialPlayer });

  const inspectOutcome = await harness.service.executeTurn({
    player: initialPlayer,
    input: "inspect the market beacon",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(inspectOutcome.ok, true);
  if (!inspectOutcome.ok) {
    return;
  }

  const postInspectPlayer = harness.persistedPlayers.at(-1);
  if (!postInspectPlayer) {
    throw new Error("expected beacon inspection to persist before the quoted follow-up");
  }

  const askOutcome = await harness.service.executeTurn({
    player: postInspectPlayer,
    input: '"Where does it draw power from?"',
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(askOutcome.ok, true);
  if (!askOutcome.ok) {
    return;
  }

  assert.match(askOutcome.turnOutput.narrative, /Stormglass Causeway/i);
  assert.ok(askOutcome.turnOutput.player_options.includes("Head for the Closed Stacks"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.deepEqual(harness.committedEvents.at(-1)?.committed.state_updates?.flags_add, ["nila_guidance"]);
});

test("turn service accepts nearby authored travel from Rooftop Market through natural stair phrasing", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
    player,
    input: "go down the stairs",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected nearby authored travel to persist state");
  }

  assert.equal(persistedPlayer.location, "Lantern Walk");
  assert.deepEqual(persistedPlayer.flags, []);
  assert.match(outcome.turnOutput.narrative, /Lantern Walk/i);
  assert.match(outcome.turnOutput.narrative, /stairwell|stairs/i);
  assert.ok(outcome.turnOutput.player_options.includes("Head back up to Rooftop Market"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates?.location, "Lantern Walk");
});

test("turn service returns grounded direction when premature travel targets are not yet reachable", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
    player,
    input: "head for Stormglass Causeway",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected blocked premature travel to preserve state");
  }

  assert.equal(persistedPlayer.location, "Rooftop Market");
  assert.match(outcome.turnOutput.narrative, /Stormglass Causeway/i);
  assert.match(outcome.turnOutput.narrative, /Lantern Walk|stairwell/i);
  assert.ok(outcome.turnOutput.player_options.includes("Go down the stairs to Lantern Walk"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
});

test("turn service clarifies ambiguous directional aliases from Rooftop Market without moving the player", async () => {
  const player = createStorySamplePlayer();
  const harness = createGroundedTurnHarness({ player });

  const outcome = await harness.service.executeTurn({
    player,
    input: "go down",
    model: "game-chat",
    embeddingModel: "game-embedding",
    directorSpec: createStorySampleDirectorSpec(),
    questSpec: createStorySampleQuestSpec()
  });

  assert.equal(outcome.ok, true);
  if (!outcome.ok) {
    return;
  }

  const persistedPlayer = harness.persistedPlayers.at(-1);
  if (!persistedPlayer) {
    throw new Error("expected ambiguous directional travel to preserve state");
  }

  assert.equal(persistedPlayer.location, "Rooftop Market");
  assert.match(outcome.turnOutput.narrative, /Lantern Walk/i);
  assert.match(outcome.turnOutput.narrative, /take the stairs|stairwell/i);
  assert.ok(outcome.turnOutput.player_options.includes("Look around"));
  assert.equal(harness.getGenerateTurnCalls(), 0);
  assert.equal(harness.getEmbeddingCalls(), 0);
  assert.equal(harness.committedEvents[0]?.committed.state_updates, null);
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
