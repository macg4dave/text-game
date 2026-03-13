import { NPC_MEMORY_TIER_POLICIES } from "../core/types.js";
import type {
  MemoryInsert,
  NpcEncounterFact,
  NpcImportanceTier,
  NpcMemoryRecord,
  NpcEncounterSignificanceBreakdown,
  NpcEncounterSignificanceResult,
  Player,
  TurnOutputPayload,
  AcceptedTurnConsequences
} from "../core/types.js";

export const NPC_ENCOUNTER_SIGNIFICANCE_PROMOTION_THRESHOLD = 6;

export interface EvaluateNpcEncounterSignificanceParams {
  fact: NpcEncounterFact;
  previousFacts: NpcEncounterFact[];
  voluntaryReturn: boolean;
}

export interface DeriveNpcEncounterFactsParams {
  player: Player;
  nextPlayer: Player;
  input: string;
  turnOutput: TurnOutputPayload;
  acceptedConsequences: AcceptedTurnConsequences;
  sourceEventId: string;
  occurredAt: string;
}

export interface ResolveNpcImportanceTierParams {
  cumulativeSignificance: number;
  encounterCount: number;
  voluntaryReturn: boolean;
}

export interface BuildNpcMemoryRecordParams {
  fact: NpcEncounterFact;
  previousRecord: NpcMemoryRecord | null;
  previousFacts: NpcEncounterFact[];
  voluntaryReturn: boolean;
}

export function evaluateNpcEncounterSignificance({
  fact,
  previousFacts,
  voluntaryReturn
}: EvaluateNpcEncounterSignificanceParams): NpcEncounterSignificanceResult {
  const previousForNpc = previousFacts.filter((candidate) => candidate.npc_id === fact.npc_id);
  const breakdown: NpcEncounterSignificanceBreakdown = {
    stable_identity: fact.npc_id.trim() && fact.display_name.trim() ? 2 : 0,
    repeated_meaningful_exchange:
      fact.encounter_count > 1 || previousForNpc.length > 0 || fact.topics.length > 1 ? 2 : 0,
    relationship_change: fact.relationship_change ? 2 : 0,
    clues: Math.min(2, fact.clues.length),
    promises: Math.min(2, fact.promises.length),
    quest_hooks: Math.min(2, fact.quest_hooks?.length ?? 0),
    unique_role: fact.role ? 1 : 0,
    voluntary_return: voluntaryReturn && previousForNpc.length > 0 ? 2 : 0
  };

  const score = Object.values(breakdown).reduce((total, value) => total + value, 0);

  return {
    score,
    threshold: NPC_ENCOUNTER_SIGNIFICANCE_PROMOTION_THRESHOLD,
    shouldPromoteToLongLivedMemory: score >= NPC_ENCOUNTER_SIGNIFICANCE_PROMOTION_THRESHOLD,
    breakdown
  };
}

export function createNpcEncounterFactMemoryInsert(fact: NpcEncounterFact): MemoryInsert {
  return {
    kind: "npc-encounter-fact",
    content: JSON.stringify(fact)
  };
}

export function createNpcLongLivedMemoryInsert(record: NpcMemoryRecord): MemoryInsert {
  return {
    kind: "npc-memory",
    content: JSON.stringify(record)
  };
}

export function resolveNpcImportanceTier({
  cumulativeSignificance,
  encounterCount,
  voluntaryReturn
}: ResolveNpcImportanceTierParams): NpcImportanceTier {
  if (
    cumulativeSignificance >= NPC_MEMORY_TIER_POLICIES.anchor_cast.minimum_significance &&
    encounterCount >= 3 &&
    voluntaryReturn
  ) {
    return "anchor_cast";
  }

  if (cumulativeSignificance >= NPC_MEMORY_TIER_POLICIES.important.minimum_significance) {
    return "important";
  }

  if (cumulativeSignificance >= NPC_MEMORY_TIER_POLICIES.known.minimum_significance) {
    return "known";
  }

  return "ambient";
}

export function buildNpcMemoryRecord({
  fact,
  previousRecord,
  previousFacts,
  voluntaryReturn
}: BuildNpcMemoryRecordParams): NpcMemoryRecord {
  const cumulativeSignificance = Math.max(
    fact.significance,
    (previousRecord?.cumulative_significance ?? 0) + fact.significance
  );
  const encounterCount = Math.max(fact.encounter_count, previousFacts.length + 1, previousRecord?.encounter_count ?? 0);
  const tier = resolveNpcImportanceTier({
    cumulativeSignificance,
    encounterCount,
    voluntaryReturn
  });
  const policy = NPC_MEMORY_TIER_POLICIES[tier];
  const rememberedTopics = uniqueMatches([
    ...(previousRecord?.remembered_topics ?? []),
    ...fact.topics
  ]).slice(0, policy.max_topics);
  const openThreads = policy.allow_open_threads
    ? uniqueMatches([
        ...(previousRecord?.open_threads ?? []),
        ...fact.promises,
        ...(fact.quest_hooks ?? [])
      ])
    : [];
  const relationshipState = policy.allow_relationship_state
    ? fact.relationship_change ?? previousRecord?.relationship_state ?? null
    : null;
  const retrievalPriority = cumulativeSignificance + encounterCount + (voluntaryReturn ? 2 : 0) + tierPriorityBoost(tier);

  return {
    npc_id: fact.npc_id,
    display_name: fact.display_name,
    tier,
    cumulative_significance: cumulativeSignificance,
    encounter_count: encounterCount,
    retrieval_priority: retrievalPriority,
    stable_identity: Boolean(fact.npc_id.trim() && fact.display_name.trim()),
    summary: fact.summary,
    remembered_topics: rememberedTopics,
    relationship_state: relationshipState,
    open_threads: openThreads,
    first_met_at: previousRecord?.first_met_at ?? earliestFactTimestamp(previousFacts, fact.last_seen_at),
    last_seen_at: fact.last_seen_at,
    last_seen_beat: fact.last_seen_beat
  };
}

export function deriveNpcEncounterFacts({
  player,
  nextPlayer,
  input,
  turnOutput,
  acceptedConsequences,
  sourceEventId,
  occurredAt
}: DeriveNpcEncounterFactsParams): NpcEncounterFact[] {
  const encounterText = [input, turnOutput.narrative, ...acceptedConsequences.memory_updates].join("\n");
  const ignoredNames = new Set(
    [player.location, nextPlayer.location]
      .map((value) => value.trim())
      .filter(Boolean)
  );
  const displayNames = uniqueMatches(encounterText.match(/\b[A-Z][a-z]+ [A-Z][a-z]+\b/g) ?? []).filter(
    (name) => !ignoredNames.has(name) && !looksLikeLocationLabel(name)
  );

  return displayNames.map((displayName) => ({
    npc_id: slugifyNpcId(displayName),
    display_name: displayName,
    role: null,
    location: nextPlayer.location || player.location,
    topics: deriveTopics(encounterText),
    promises: extractQuotedSignals(encounterText, ["promise", "swear", "meet", "return"]),
    clues: uniqueMatches(acceptedConsequences.memory_updates).slice(0, 2),
    mood: null,
    relationship_change: null,
    last_seen_beat: nextPlayer.director_state.current_beat_id || player.director_state.current_beat_id,
    encounter_count: 1,
    significance: 0,
    summary: buildEncounterSummary(displayName, turnOutput.narrative, acceptedConsequences.memory_updates),
    source_event_id: sourceEventId,
    last_seen_at: occurredAt,
    quest_hooks: []
  }));
}

function buildEncounterSummary(displayName: string, narrative: string, memoryUpdates: string[]): string {
  const summary = uniqueMatches([narrative.trim(), ...memoryUpdates.map((item) => item.trim())])
    .filter(Boolean)
    .join(" ")
    .trim();

  return summary || `${displayName} was part of a committed encounter.`;
}

function deriveTopics(text: string): string[] {
  const topicMatches = text.match(/\b(?:relay|beacon|causeway|tower|quest|route|market|vault)\b/gi) ?? [];
  return uniqueMatches(topicMatches.map((match) => match.toLowerCase())).slice(0, 4);
}

function extractQuotedSignals(text: string, signals: string[]): string[] {
  const normalized = text.toLowerCase();
  if (!signals.some((signal) => normalized.includes(signal))) {
    return [];
  }

  return uniqueMatches(
    text
      .split(/[.!?]/)
      .map((sentence) => sentence.trim())
      .filter((sentence) => sentence && signals.some((signal) => sentence.toLowerCase().includes(signal)))
  ).slice(0, 2);
}

function slugifyNpcId(displayName: string): string {
  return `npc-${displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;
}

function looksLikeLocationLabel(value: string): boolean {
  const locationTerms = new Set(["market", "bridge", "causeway", "stacks", "vault", "tower", "walk", "gate"]);
  const tokens = value.toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.some((token) => locationTerms.has(token));
}

function uniqueMatches(values: string[]): string[] {
  const seen = new Set<string>();
  const unique: string[] = [];

  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }

    seen.add(trimmed);
    unique.push(trimmed);
  }

  return unique;
}

function tierPriorityBoost(tier: NpcImportanceTier): number {
  switch (tier) {
    case "anchor_cast":
      return 6;
    case "important":
      return 3;
    case "known":
      return 1;
    default:
      return 0;
  }
}

function earliestFactTimestamp(previousFacts: NpcEncounterFact[], fallback: string): string {
  const all = previousFacts.map((fact) => fact.last_seen_at).concat(fallback).filter(Boolean).sort();
  return all[0] ?? fallback;
}