import assert from "node:assert/strict";
import test from "node:test";
import {
  COMMITTED_EVENT_SCHEMA_VERSION,
  type SetupStatusPayload,
  AUTHORITATIVE_STATE_SCHEMA_VERSION,
  TURN_INPUT_SCHEMA_VERSION,
  TURN_OUTPUT_SCHEMA_VERSION,
  type CanonicalTurnEventPayload,
  type AuthoritativePlayerState,
  type StateResponsePayload,
  type TurnResponsePayload,
  type TurnOutputPayload
} from "../core/types.js";
import {
  parseTurnInput,
  validateCanonicalTurnEvent,
  validateAuthoritativePlayerState,
  validateSetupStatusResponse,
  validateStateResponse,
  validateTurnResponse,
  validateTurnOutput
} from "./validator.js";

test("parseTurnInput normalizes the legacy camelCase request body to the versioned schema", () => {
  const result = parseTurnInput({
    playerId: "player-123",
    name: "Avery",
    input: "look around"
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.value, {
    schema_version: TURN_INPUT_SCHEMA_VERSION,
    player_id: "player-123",
    player_name: "Avery",
    input: "look around"
  });
});

test("parseTurnInput rejects unsupported schema versions and blank input", () => {
  const result = parseTurnInput({
    schema_version: "turn-input/v9",
    input: "   "
  });

  assert.equal(result.ok, false);
  assert.equal(result.value, null);
  assert.match(result.errors.join(" "), /schema_version/i);
  assert.match(result.errors.join(" "), /input/i);
});

test("validateTurnOutput accepts a valid versioned turn payload", () => {
  const payload: TurnOutputPayload = {
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "You scan the market from the rooftop.",
    player_options: ["Inspect the signal lantern", "Leave quietly"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: ["signal shard"],
      inventory_remove: [],
      flags_add: ["market_seen"],
      flags_remove: [],
      quests: [
        {
          id: "intro-signal",
          status: "active",
          summary: "You noticed the first signal marker."
        }
      ]
    },
    director_updates: {
      end_goal_progress: "The signal is now visible."
    },
    memory_updates: ["The player found a signal shard in the market."]
  };

  assert.deepEqual(validateTurnOutput(payload), { ok: true, errors: [] });
});

test("validateTurnOutput rejects invalid nested fields and option overflow", () => {
  const result = validateTurnOutput({
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "Too many options.",
    player_options: ["1", "2", "3", "4", "5", "6", "7"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: "signal shard",
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: []
    },
    director_updates: {},
    memory_updates: []
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /player_options/i);
  assert.match(result.errors.join(" "), /inventory_add/i);
  assert.match(result.errors.join(" "), /end_goal_progress/i);
});

test("validateTurnOutput rejects over-modeled scene and world fields outside the compact proposal contract", () => {
  const result = validateTurnOutput({
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "You scan the market from the rooftop.",
    player_options: ["Inspect the signal lantern"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: [],
      inventory_remove: [],
      flags_add: [],
      flags_remove: [],
      quests: [],
      world_state: {
        weather: "storm"
      }
    },
    director_updates: {
      end_goal_progress: "The tower route is clearer.",
      current_beat_id: "beat-2"
    },
    memory_updates: [],
    scene: {
      npcs: ["watcher"],
      exits: ["tower"]
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /scene/i);
  assert.match(result.errors.join(" "), /state_updates\.world_state/i);
  assert.match(result.errors.join(" "), /director_updates\.current_beat_id/i);
});

test("validateAuthoritativePlayerState accepts a versioned player snapshot", () => {
  const state: AuthoritativePlayerState = {
    schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
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

  assert.deepEqual(validateAuthoritativePlayerState(state), { ok: true, errors: [] });
});

test("validateAuthoritativePlayerState rejects malformed versioned player snapshots", () => {
  const result = validateAuthoritativePlayerState({
    schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
    id: "player-123",
    name: "Avery",
    created_at: "2026-03-08T00:00:00.000Z",
    location: "Rooftop Market",
    summary: "You arrived at the market.",
    inventory: ["signal shard"],
    flags: ["market_seen"],
    quests: "not-an-array",
    director_state: {
      end_goal: "Reach the tower"
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /quests/i);
  assert.match(result.errors.join(" "), /director_state/i);
});

test("validateStateResponse accepts a versioned authoritative player envelope", () => {
  const payload: StateResponsePayload = {
    player: {
      schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
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
    }
  };

  assert.deepEqual(validateStateResponse(payload), { ok: true, errors: [] });
});

test("validateTurnResponse accepts a full versioned turn payload plus authoritative player state", () => {
  const payload: TurnResponsePayload = {
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "You scan the market from the rooftop.",
    player_options: ["Inspect the signal lantern", "Leave quietly"],
    state_updates: {
      location: "Rooftop Market",
      inventory_add: ["signal shard"],
      inventory_remove: [],
      flags_add: ["market_seen"],
      flags_remove: [],
      quests: [
        {
          id: "intro-signal",
          status: "active",
          summary: "You noticed the first signal marker."
        }
      ]
    },
    director_updates: {
      end_goal_progress: "The signal is now visible."
    },
    memory_updates: ["The player found a signal shard in the market."],
    player: {
      schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
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
    }
  };

  assert.deepEqual(validateTurnResponse(payload), { ok: true, errors: [] });
});

test("validateTurnResponse treats legacy *_updates fields as proposals while player remains authoritative", () => {
  const payload: TurnResponsePayload = {
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "You picture the bridge ahead, but the move is not committed yet.",
    player_options: ["Step toward the bridge", "Stay on the rooftop"],
    state_updates: {
      location: "Sky Bridge",
      inventory_add: ["bridge pass"],
      inventory_remove: [],
      flags_add: ["bridge_seen"],
      flags_remove: [],
      quests: []
    },
    director_updates: {
      end_goal_progress: "You can now see a route toward the tower."
    },
    memory_updates: ["The bridge looked reachable from the rooftop."],
    player: {
      schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      id: "player-123",
      name: "Avery",
      created_at: "2026-03-08T00:00:00.000Z",
      location: "Rooftop Market",
      summary: "You arrived at the market.",
      inventory: ["signal shard"],
      flags: ["market_seen"],
      quests: [],
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
    }
  };

  assert.deepEqual(validateTurnResponse(payload), { ok: true, errors: [] });
});

test("validateTurnResponse rejects missing full turn fields and invalid authoritative player state", () => {
  const result = validateTurnResponse({
    schema_version: TURN_OUTPUT_SCHEMA_VERSION,
    narrative: "The turn is incomplete.",
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
      end_goal_progress: "No progress."
    },
    player: {
      schema_version: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      id: 123,
      name: "Avery",
      created_at: "2026-03-08T00:00:00.000Z",
      location: "Rooftop Market",
      summary: "You arrived at the market.",
      inventory: [],
      flags: [],
      quests: [],
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
    }
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /memory_updates/i);
  assert.match(result.errors.join(" "), /player\.id/i);
});

test("validateCanonicalTurnEvent accepts a versioned replay event with canonical and supplementary sections", () => {
  const payload: CanonicalTurnEventPayload = {
    schema_version: COMMITTED_EVENT_SCHEMA_VERSION,
    event_kind: "turn-resolution",
    event_id: "event-123",
    player_id: "player-123",
    occurred_at: "2026-03-08T00:00:00.000Z",
    attempt: {
      input: "touch the lantern"
    },
    outcome: {
      status: "accepted",
      summary: "The player inspected the lantern and revealed the signal.",
      rejection_reason: null
    },
    committed: {
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
    },
    contract_versions: {
      turn_output: TURN_OUTPUT_SCHEMA_VERSION,
      authoritative_state: AUTHORITATIVE_STATE_SCHEMA_VERSION,
      ruleset: "story-rules/v1"
    },
    supplemental: {
      transcript: {
        player_text: "touch the lantern",
        narrator_text: "The signal lantern hummed when touched."
      },
      presentation: {
        narrative: "The signal lantern hummed when touched.",
        player_options: ["Inspect the lantern"]
      },
      prompt: {
        model: "game-chat"
      }
    }
  };

  assert.deepEqual(validateCanonicalTurnEvent(payload), { ok: true, errors: [] });
});

test("validateCanonicalTurnEvent rejects malformed canonical fields while allowing supplementary data to stay optional", () => {
  const result = validateCanonicalTurnEvent({
    schema_version: COMMITTED_EVENT_SCHEMA_VERSION,
    event_kind: "chat-log",
    event_id: 123,
    player_id: "player-123",
    occurred_at: "2026-03-08T00:00:00.000Z",
    attempt: {
      input: ""
    },
    outcome: {
      status: "maybe",
      summary: 42,
      rejection_reason: []
    },
    committed: {
      state_updates: {
        location: "Rooftop Market",
        inventory_add: [],
        inventory_remove: [],
        flags_add: [],
        flags_remove: [],
        quests: [],
        world_state: {
          weather: "storm"
        }
      },
      director_updates: {
        end_goal_progress: "The signal now points toward the tower.",
        current_beat_id: "beat-2"
      },
      memory_updates: "not-an-array"
    },
    contract_versions: {
      turn_output: "turn-output/v9",
      authoritative_state: "authoritative-state/v9",
      ruleset: ""
    },
    supplemental: {
      transcript: {
        player_text: 99
      },
      presentation: {
        narrative: [],
        player_options: ["Inspect the lantern", 7]
      }
    },
    raw_response: "not allowed"
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /event_kind/i);
  assert.match(result.errors.join(" "), /event_id/i);
  assert.match(result.errors.join(" "), /attempt\.input/i);
  assert.match(result.errors.join(" "), /outcome\.status/i);
  assert.match(result.errors.join(" "), /committed\.state_updates\.world_state/i);
  assert.match(result.errors.join(" "), /committed\.director_updates\.current_beat_id/i);
  assert.match(result.errors.join(" "), /committed\.memory_updates/i);
  assert.match(result.errors.join(" "), /contract_versions\.turn_output/i);
  assert.match(result.errors.join(" "), /contract_versions\.authoritative_state/i);
  assert.match(result.errors.join(" "), /supplemental\.transcript\.player_text/i);
  assert.match(result.errors.join(" "), /supplemental\.presentation\.narrative/i);
  assert.match(result.errors.join(" "), /raw_response/i);
});

test("validateSetupStatusResponse accepts a guided setup envelope", () => {
  const payload: SetupStatusPayload = {
    setup: {
      status: "ready",
      summary: "Setup looks ready. Extra notes are available if you want more detail.",
      checked_at: "2026-03-08T00:00:00.000Z",
      can_retry: true,
      current_profile: {
        id: "local-gpu-small",
        label: "Local GPU small",
        provider: "litellm",
        chat_model: "game-chat",
        embedding_model: "game-embedding"
      },
      supported_path: {
        provider: "LiteLLM",
        title: "Supported MVP AI path",
        summary: "Use the Windows launcher with Docker Desktop so the app, LiteLLM, and the GPU-backed Ollama route start together.",
        launcher: "powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1",
        services: ["Docker Desktop", "LiteLLM sidecar", "GPU-backed Ollama service"]
      },
      preflight: {
        ok: true,
        status: "ready",
        summary: "Setup looks ready. Extra notes are available if you want more detail.",
        issues: [],
        counts: {
          blocker: 0,
          warning: 0,
          info: 0
        },
        checked_at: "2026-03-08T00:00:00.000Z"
      }
    }
  };

  assert.deepEqual(validateSetupStatusResponse(payload), { ok: true, errors: [] });
});
