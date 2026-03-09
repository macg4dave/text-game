import OpenAI from "openai";
import { config } from "../core/config.js";
import type { TurnResult } from "../core/types.js";
import { TURN_RESPONSE_SCHEMA, assertTurnResponseSchemaContract } from "./turn-schema.js";

const client = new OpenAI({
  apiKey: config.ai.apiKey,
  ...(config.ai.baseUrl ? { baseURL: config.ai.baseUrl } : {})
});

assertTurnResponseSchemaContract();

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
      json_schema: TURN_RESPONSE_SCHEMA
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
