import type {
  MemoryInsert,
  NpcEncounterFact,
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

export function createNpcLongLivedMemoryInsert(fact: NpcEncounterFact): MemoryInsert {
  return {
    kind: "npc-memory",
    content: `${fact.display_name}: ${fact.summary}`
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