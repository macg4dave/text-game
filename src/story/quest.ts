import fs from "node:fs";
import path from "node:path";
import type { QuestSpec } from "../core/types.js";

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
