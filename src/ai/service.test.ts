import assert from "node:assert/strict";
import test from "node:test";
import { TURN_RESPONSE_SCHEMA } from "./turn-schema.js";
import { createAiService, type AiChatCompletionRequest, type AiEmbeddingRequest } from "./service.js";

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

test("createAiService sends embedding requests through the configured LiteLLM alias", async () => {
  const capturedRequests: AiEmbeddingRequest[] = [];
  const service = createAiService({
    chat: {
      completions: {
        async create() {
          return { choices: [] };
        }
      }
    },
    embeddings: {
      async create(request: AiEmbeddingRequest) {
        capturedRequests.push(request);
        return {
          data: [
            {
              embedding: [0.11, 0.22, 0.33]
            }
          ]
        };
      }
    }
  });

  const embedding = await service.getEmbedding({
    model: "game-embedding",
    input: "What route did Nila share?"
  });

  assert.deepEqual(embedding, [0.11, 0.22, 0.33]);
  assert.deepEqual(capturedRequests, [
    {
      model: "game-embedding",
      input: "What route did Nila share?",
      encoding_format: "float"
    }
  ]);
});

test("createAiService sends batch embedding requests through the configured LiteLLM alias", async () => {
  const capturedRequests: AiEmbeddingRequest[] = [];
  const service = createAiService({
    chat: {
      completions: {
        async create() {
          return { choices: [] };
        }
      }
    },
    embeddings: {
      async create(request: AiEmbeddingRequest) {
        capturedRequests.push(request);
        return {
          data: [
            { embedding: [1, 0] },
            { embedding: [0, 1] }
          ]
        };
      }
    }
  });

  const embeddings = await service.getEmbeddings({
    model: "game-embedding",
    inputs: ["The beacon is tied to the relay.", "Nila knows the causeway route."]
  });

  assert.deepEqual(embeddings, [[1, 0], [0, 1]]);
  assert.deepEqual(capturedRequests, [
    {
      model: "game-embedding",
      input: ["The beacon is tied to the relay.", "Nila knows the causeway route."],
      encoding_format: "float"
    }
  ]);
});