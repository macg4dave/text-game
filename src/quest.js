import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const QUEST_PATH = path.join(__dirname, "..", "data", "spec", "quests.json");

let cachedQuests = null;

export function loadQuestSpec() {
  if (cachedQuests) return cachedQuests;
  const raw = fs.readFileSync(QUEST_PATH, "utf-8");
  cachedQuests = JSON.parse(raw);
  return cachedQuests;
}

export function reloadQuestSpec() {
  cachedQuests = null;
  return loadQuestSpec();
}
