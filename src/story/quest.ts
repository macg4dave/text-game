import fs from "node:fs";
import path from "node:path";
import type { QuestDefinition, QuestSpec, QuestUpdate } from "../core/types.js";
import { requirementsMet } from "./director.js";

const QUEST_PATH = path.resolve(process.cwd(), "data", "spec", "quests.json");

let cachedQuests: QuestSpec | null = null;

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
