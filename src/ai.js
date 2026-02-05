import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const RESPONSE_SCHEMA = {
  name: "game_turn",
  strict: true,
  schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      narrative: { type: "string" },
      player_options: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 6
      },
      state_updates: {
        type: "object",
        additionalProperties: false,
        properties: {
          location: { type: "string" },
          inventory_add: { type: "array", items: { type: "string" } },
          inventory_remove: { type: "array", items: { type: "string" } },
          flags_add: { type: "array", items: { type: "string" } },
          flags_remove: { type: "array", items: { type: "string" } },
          quests: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                status: { type: "string" },
                summary: { type: "string" }
              },
              required: ["id", "status", "summary"]
            }
          }
        },
        required: ["location", "inventory_add", "inventory_remove", "flags_add", "flags_remove", "quests"]
      },
      director_updates: {
        type: "object",
        additionalProperties: false,
        properties: {
          end_goal_progress: { type: "string" }
        },
        required: ["end_goal_progress"]
      },
      memory_updates: {
        type: "array",
        items: { type: "string" },
        minItems: 0,
        maxItems: 8
      }
    },
    required: ["narrative", "player_options", "state_updates", "director_updates", "memory_updates"]
  }
};

export async function generateTurn({ model, systemPrompt, statePack, shortHistory, memories, input }) {
  const response = await client.responses.create({
    model,
    temperature: 0.8,
    response_format: {
      type: "json_schema",
      json_schema: RESPONSE_SCHEMA
    },
    input: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: [
          { type: "input_text", text: `STATE_PACK\n${JSON.stringify(statePack)}` },
          { type: "input_text", text: `SHORT_HISTORY\n${shortHistory.join("\n")}` },
          { type: "input_text", text: `MEMORIES\n${memories.join("\n")}` },
          { type: "input_text", text: `PLAYER_INPUT\n${input}` }
        ]
      }
    ]
  });

  const outputText = response.output_text?.trim() || "{}";
  return JSON.parse(outputText);
}

export async function getEmbedding({ model, input }) {
  const response = await client.embeddings.create({
    model,
    input,
    encoding_format: "float"
  });

  return response.data?.[0]?.embedding || [];
}

export async function getEmbeddings({ model, inputs }) {
  if (!inputs.length) return [];
  const response = await client.embeddings.create({
    model,
    input: inputs,
    encoding_format: "float"
  });

  return response.data?.map((item) => item.embedding) || [];
}
