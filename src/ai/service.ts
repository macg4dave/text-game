import OpenAI from "openai";
import { config } from "../core/config.js";
import type { TurnResult } from "../core/types.js";
import { classifyTurnInput } from "../rules/turn-input-classification.js";
import { TURN_RESPONSE_SCHEMA, assertTurnResponseSchemaContract } from "./turn-schema.js";

export interface AiChatCompletionRequest {
  model: string;
  temperature: number;
  response_format: {
    type: "json_schema";
    json_schema: typeof TURN_RESPONSE_SCHEMA;
  };
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
}

export interface AiEmbeddingRequest {
  model: string;
  input: string | string[];
  encoding_format: "float";
}

export interface AiServiceClient {
  chat: {
    completions: {
      create(request: AiChatCompletionRequest): Promise<{
        choices?: Array<{
          message?: {
            content?: unknown;
          };
        }>;
      }>;
    };
  };
  embeddings: {
    create(request: AiEmbeddingRequest): Promise<{
      data?: Array<{
        embedding: number[];
      }>;
    }>;
  };
}

assertTurnResponseSchemaContract();

function createDefaultClient(): AiServiceClient {
  return new OpenAI({
    apiKey: config.ai.apiKey,
    ...(config.ai.baseUrl ? { baseURL: config.ai.baseUrl } : {})
  }) as unknown as AiServiceClient;
}

export function buildTurnPromptSections({
  statePack,
  shortHistory,
  memories,
  input
}: {
  statePack: unknown;
  shortHistory: string[];
  memories: string[];
  input: string;
}): string {
  const inputClassification = classifyTurnInput(input);

  return [
    `STATE_PACK\n${JSON.stringify(statePack)}`,
    `SHORT_HISTORY\n${shortHistory.join("\n")}`,
    `MEMORIES\n${memories.join("\n")}`,
    `TURN_INPUT_CLASSIFICATION\nkind: ${inputClassification.kind}\nguidance: ${inputClassification.guidance}`,
    `PLAYER_INPUT\n${input}`
  ].join("\n\n");
}

export function createAiService(client: AiServiceClient = createDefaultClient()) {
  return {
    async generateTurn({
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
      const promptSections = buildTurnPromptSections({ statePack, shortHistory, memories, input });

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
        : typeof messageContent === "string"
          ? messageContent.trim()
          : "{}";

      return JSON.parse(outputText) as TurnResult;
    },

    async getEmbedding({ model, input }: { model: string; input: string }): Promise<number[]> {
      const response = await client.embeddings.create({
        model,
        input,
        encoding_format: "float"
      });

      return response.data?.[0]?.embedding || [];
    },

    async getEmbeddings({ model, inputs }: { model: string; inputs: string[] }): Promise<number[][]> {
      if (!inputs.length) return [];
      const response = await client.embeddings.create({
        model,
        input: inputs,
        encoding_format: "float"
      });

      return response.data?.map((item) => item.embedding) || [];
    }
  };
}

const aiService = createAiService();

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
  return aiService.generateTurn({ model, systemPrompt, statePack, shortHistory, memories, input });
}

export async function getEmbedding({ model, input }: { model: string; input: string }): Promise<number[]> {
  return aiService.getEmbedding({ model, input });
}

export async function getEmbeddings({ model, inputs }: { model: string; inputs: string[] }): Promise<number[][]> {
  return aiService.getEmbeddings({ model, inputs });
}

function getMessagePartText(part: unknown): string {
  if (typeof part === "string") return part;
  if (part && typeof part === "object" && "text" in part && typeof part.text === "string") {
    return part.text;
  }
  return "";
}
