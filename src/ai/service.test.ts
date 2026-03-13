import assert from "node:assert/strict";
import test from "node:test";
import { TURN_RESPONSE_SCHEMA } from "./turn-schema.js";
import { createAiService, type AiChatCompletionRequest } from "./service.js";

test("createAiService sends turn generation through the configured model alias", async () => {
  const capturedRequests: AiChatCompletionRequest[] = [];
  const service = createAiService({
    chat: {
      completions: {
        async create(request: AiChatCompletionRequest) {
          capturedRequests.push(request);
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    narrative: "The relay hums.",
                    player_options: ["Inspect the relay"],
                    state_updates: {
                      location: "Relay Vault",
                      inventory_add: [],
                      inventory_remove: [],
                      flags_add: [],
                      flags_remove: [],
                      quests: []
                    },
                    director_updates: {
                      end_goal_progress: "The relay is stable."
                    },
                    memory_updates: []
                  })
                }
              }
            ]
          };
        }
      }
    },
    embeddings: {
      async create() {
        return { data: [] };
      }
    }
  });

  const result = await service.generateTurn({
    model: "game-chat",
    systemPrompt: "System prompt",
    statePack: { location: "Relay Vault" },
    shortHistory: ["PLAYER: inspect the relay"],
    memories: ["The relay was unstable earlier."],
    input: "inspect the relay"
  });

  const request = capturedRequests[0];
  if (!request) {
    throw new Error("Expected the AI service to call chat.completions.create.");
  }

  assert.equal(request.model, "game-chat");
  assert.deepEqual(request.response_format, {
    type: "json_schema",
    json_schema: TURN_RESPONSE_SCHEMA
  });
  assert.match(String(request.messages[1]?.content ?? ""), /PLAYER_INPUT\s+inspect the relay/i);
  assert.equal(result.narrative, "The relay hums.");
});