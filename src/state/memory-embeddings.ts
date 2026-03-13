import type { MemoryInsert, MemorySummaryArtifact, NpcMemoryRecord } from "../core/types.js";

export interface PreparedMemoryEmbeddingInput {
  index: number;
  input: string;
}

export function prepareMemoryEmbeddingInputs(memoryInserts: MemoryInsert[]): PreparedMemoryEmbeddingInput[] {
  return memoryInserts.flatMap((memoryInsert, index) => {
    const input = buildMemoryEmbeddingInput(memoryInsert);
    return input ? [{ index, input }] : [];
  });
}

export function applyMemoryEmbeddings(
  memoryInserts: MemoryInsert[],
  preparedInputs: PreparedMemoryEmbeddingInput[],
  embeddings: number[][]
): MemoryInsert[] {
  const nextInserts = memoryInserts.map((memoryInsert) => ({ ...memoryInsert }));

  preparedInputs.forEach(({ index }, preparedIndex) => {
    const embedding = embeddings[preparedIndex];
    if (!embedding?.length) {
      return;
    }

    nextInserts[index] = {
      ...nextInserts[index],
      embedding
    };
  });

  return nextInserts;
}

export function buildMemoryEmbeddingInput(memoryInsert: MemoryInsert): string | null {
  const kind = memoryInsert.kind ?? "fact";
  const content = memoryInsert.content.trim();
  if (!content) {
    return null;
  }

  switch (kind) {
    case "fact":
      return content;
    case "npc-memory":
      return buildNpcMemoryEmbeddingInput(content);
    case "memory-summary-artifact":
      return buildSummaryArtifactEmbeddingInput(content);
    default:
      return null;
  }
}

function buildNpcMemoryEmbeddingInput(content: string): string {
  const record = safeJsonParse<NpcMemoryRecord | null>(content, null);
  if (!record) {
    return content;
  }

  return [
    "npc-memory",
    `npc: ${record.display_name}`,
    `tier: ${record.tier}`,
    `summary: ${record.summary}`,
    record.remembered_topics.length ? `topics: ${record.remembered_topics.join("; ")}` : null,
    record.relationship_state ? `relationship: ${record.relationship_state}` : null,
    record.open_threads.length ? `open_threads: ${record.open_threads.join("; ")}` : null,
    record.last_seen_beat ? `last_seen_beat: ${record.last_seen_beat}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function buildSummaryArtifactEmbeddingInput(content: string): string {
  const artifact = safeJsonParse<MemorySummaryArtifact | null>(content, null);
  if (!artifact) {
    return content;
  }

  return [
    artifact.artifact_kind,
    artifact.beat_label ? `beat_label: ${artifact.beat_label}` : null,
    artifact.beat_id ? `beat_id: ${artifact.beat_id}` : null,
    `location: ${artifact.location}`,
    `summary: ${artifact.summary}`,
    artifact.detail_lines.length ? `details: ${artifact.detail_lines.join(" | ")}` : null
  ]
    .filter((line): line is string => Boolean(line))
    .join("\n");
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}