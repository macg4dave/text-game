import OpenAI from "openai";
import { config } from "../core/config.js";
import {
  LIVE_CONTEXT_BUCKET_LIMITS,
  type LiveTurnContext,
  type TurnResult
} from "../core/types.js";
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
  liveContext,
  input
}: {
  statePack: unknown;
  shortHistory: string[];
  memories: string[];
  liveContext?: LiveTurnContext;
  input: string;
}): string {
  const inputClassification = classifyTurnInput(input);

  const promptSections = [
    `STATE_PACK\n${JSON.stringify(statePack)}`,
    liveContext
      ? `LIVE_CONTEXT_BUDGETS\n${Object.values(liveContext.budgets)
          .map((budget) => `${budget.bucket}: limit=${budget.limit}; default=${budget.include_by_default ? "on" : "off"}`)
          .join("\n")}`
      : null,
    `SHORT_HISTORY\n${(liveContext?.buckets.short_history ?? shortHistory).join("\n")}`,
    liveContext
      ? `QUEST_PROGRESS\n${renderBucketSection(liveContext.buckets.quest_progress)}`
      : null,
    liveContext
      ? `RELATIONSHIP_SUMMARIES\n${renderBucketSection(liveContext.buckets.relationship_summaries)}`
      : null,
    liveContext
      ? `WORLD_FACTS\n${renderBucketSection(liveContext.buckets.world_facts)}`
      : null,
    liveContext
      ? `COLD_HISTORY\n${liveContext.buckets.cold_history.length
          ? liveContext.buckets.cold_history.join("\n")
          : `(excluded by default; budget ${LIVE_CONTEXT_BUCKET_LIMITS.cold_history})`}`
      : null,
    `MEMORIES\n${(liveContext?.recalled_facts ?? memories).join("\n")}`,
    `TURN_INPUT_CLASSIFICATION\nkind: ${inputClassification.kind}\nguidance: ${inputClassification.guidance}`,
    `PLAYER_INPUT\n${input}`
  ].filter((section): section is string => section !== null);

  return promptSections.join("\n\n");
}

export function createAiService(client: AiServiceClient = createDefaultClient()) {
  return {
    async generateTurn({
      model,
      systemPrompt,
      statePack,
      shortHistory,
      memories,
      liveContext,
      input
    }: {
      model: string;
      systemPrompt: string;
      statePack: unknown;
      shortHistory: string[];
      memories: string[];
      liveContext?: LiveTurnContext;
      input: string;
    }): Promise<TurnResult> {
      const promptSections = buildTurnPromptSections({ statePack, shortHistory, memories, liveContext, input });

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
  liveContext,
  input
}: {
  model: string;
  systemPrompt: string;
  statePack: unknown;
  shortHistory: string[];
  memories: string[];
  liveContext?: LiveTurnContext;
  input: string;
}): Promise<TurnResult> {
  return aiService.generateTurn({ model, systemPrompt, statePack, shortHistory, memories, liveContext, input });
}

function renderBucketSection(values: string[]): string {
  return values.length ? values.join("\n") : "(none)";
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
