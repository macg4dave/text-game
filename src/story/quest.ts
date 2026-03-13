import fs from "node:fs";
import path from "node:path";
import type { QuestDefinition, QuestSpec, QuestStage, QuestUpdate } from "../core/types.js";
import { requirementsMet } from "./director.js";

const QUEST_PATH = path.resolve(process.cwd(), "data", "spec", "quests.json");

let cachedQuests: QuestSpec | null = null;

export interface QuestStageUnlockRule {
  quest_id: string;
  stage_id: string;
  label: string;
  required_flags: string[];
  unlock_flag: string;
  location_hint: string | null;
}

export function loadQuestSpec(): QuestSpec {
  if (cachedQuests) return cachedQuests;
  const raw = fs.readFileSync(QUEST_PATH, "utf-8");
  cachedQuests = JSON.parse(raw) as QuestSpec;
  return cachedQuests;
}

export function reloadQuestSpec(): QuestSpec {
  cachedQuests = null;
  return loadQuestSpec();
}

export function resolveQuestUpdates({
  questSpec,
  existingQuests,
  flags
}: {
  questSpec: QuestSpec;
  existingQuests: QuestUpdate[];
  flags: string[];
}): QuestUpdate[] {
  const existingById = new Map(existingQuests.map((quest) => [quest.id, quest]));
  const resolved: QuestUpdate[] = [];

  for (const quest of questSpec.quests) {
    const existing = existingById.get(quest.id);
    const nextQuest = resolveQuestUpdate(quest, existing, flags);
    if (nextQuest) {
      resolved.push(nextQuest);
    } else if (existing) {
      resolved.push({ ...existing });
    }

    existingById.delete(quest.id);
  }

  for (const quest of existingById.values()) {
    resolved.push({ ...quest });
  }

  return resolved;
}

export function collectQuestStageUnlockRules(questSpec: QuestSpec): Map<string, QuestStageUnlockRule> {
  const rules = new Map<string, QuestStageUnlockRule>();

  for (const quest of questSpec.quests) {
    for (const stage of quest.stages) {
      for (const unlockFlag of stage.unlock_flags ?? []) {
        rules.set(unlockFlag, {
          quest_id: quest.id,
          stage_id: stage.id,
          label: stage.label,
          required_flags: [...(stage.required_flags ?? [])],
          unlock_flag: unlockFlag,
          location_hint: inferQuestStageLocation(stage)
        });
      }
    }
  }

  return rules;
}

export function listReachableQuestLocations(questSpec: QuestSpec, flags: string[]): string[] {
  const locations = new Set<string>();

  for (const quest of questSpec.quests) {
    for (const stage of quest.stages) {
      const locationHint = inferQuestStageLocation(stage);
      if (!locationHint || !requirementsMet(stage.required_flags, flags)) {
        continue;
      }

      locations.add(locationHint);
    }
  }

  return Array.from(locations);
}

export function inferQuestStageLocation(stage: Pick<QuestStage, "label">): string | null {
  const label = stage.label.trim();
  const prepositionMatch = label.match(
    /\b(?:in|from|through|across|at)\s+(?:the\s+)?([A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*)*)/
  );

  if (prepositionMatch?.[1]) {
    return prepositionMatch[1].trim();
  }

  const openMatch = label.match(/\bopen\s+(?:the\s+)?([A-Z][A-Za-z0-9'’-]*(?:\s+[A-Z][A-Za-z0-9'’-]*)*)/i);
  if (openMatch?.[1]) {
    return openMatch[1].trim();
  }

  return null;
}

function resolveQuestUpdate(
  quest: QuestDefinition,
  existing: QuestUpdate | undefined,
  flags: string[]
): QuestUpdate | null {
  const activeStage = quest.stages.find((stage) => requirementsMet(stage.required_flags, flags) && !stageUnlocked(stage.unlock_flags, flags));
  const finalStage = quest.stages.at(-1);

  if (finalStage && stageUnlocked(finalStage.unlock_flags, flags)) {
    return {
      id: quest.id,
      status: "complete",
      summary: finalStage.label
    };
  }

  if (!activeStage) {
    return existing ? { ...existing } : null;
  }

  const completedStageCount = quest.stages.filter((stage) => stageUnlocked(stage.unlock_flags, flags)).length;
  if (existing && completedStageCount === 0 && existing.status === "active") {
    return { ...existing };
  }

  return {
    id: quest.id,
    status: "active",
    summary: activeStage.label
  };
}

function stageUnlocked(unlockFlags: string[] | undefined, flags: string[]): boolean {
  if (!unlockFlags || !unlockFlags.length) {
    return false;
  }

  return unlockFlags.some((flag) => flags.includes(flag));
}
