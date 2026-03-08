import OpenAI from "openai";
import { config } from "./config.js";
import type { TurnResult } from "./types.js";

const client = new OpenAI({
  apiKey: config.ai.apiKey,
  ...(config.ai.baseUrl ? { baseURL: config.ai.baseUrl } : {})
});

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
} as const;

export async function generateTurn({
  model,
  systemPrompt,
  statePack,
  shortHistory,
  memories,
  input
}: {
  model: string;
  systemPrompt: string;
  statePack: unknown;
  shortHistory: string[];
  memories: string[];
  input: string;
}): Promise<TurnResult> {
  const promptSections = [
    `STATE_PACK\n${JSON.stringify(statePack)}`,
    `SHORT_HISTORY\n${shortHistory.join("\n")}`,
    `MEMORIES\n${memories.join("\n")}`,
    `PLAYER_INPUT\n${input}`
  ].join("\n\n");

  const response = await client.chat.completions.create({
    model,
    temperature: 0.8,
    response_format: {
      type: "json_schema",
      json_schema: RESPONSE_SCHEMA
    },
    messages: [
      {
        role: "system",
        content: systemPrompt
      },
      {
        role: "user",
        content: promptSections
      }
    ]
  });

  const messageContent = response.choices?.[0]?.message?.content;
  const outputText = Array.isArray(messageContent)
    ? messageContent.map((part) => getMessagePartText(part)).join("").trim()
    : messageContent?.trim?.() || "{}";

  return JSON.parse(outputText) as TurnResult;
}

export async function getEmbedding({ model, input }: { model: string; input: string }): Promise<number[]> {
  const response = await client.embeddings.create({
    model,
    input,
    encoding_format: "float"
  });

  return response.data?.[0]?.embedding || [];
}

export async function getEmbeddings({ model, inputs }: { model: string; inputs: string[] }): Promise<number[][]> {
  if (!inputs.length) return [];
  const response = await client.embeddings.create({
    model,
    input: inputs,
    encoding_format: "float"
  });

  return response.data?.map((item: { embedding: number[] }) => item.embedding) || [];
}

function getMessagePartText(part: unknown): string {
  if (typeof part === "string") return part;
  if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}
