import fs from "node:fs";
import path from "node:path";

const SCENE_GROUNDING_PATH = path.resolve(process.cwd(), "data", "spec", "scene-grounding.json");

interface SceneTravelSpec {
  locations: SceneTravelLocation[];
}

interface SceneTravelLocation {
  name: string;
  aliases?: string[];
  exits?: SceneTravelExit[];
}

interface SceneTravelExit {
  destination: string;
  required_flags?: string[];
}

let cachedSceneTravelSpec: SceneTravelSpec | null = null;

export function loadSceneTravelSpec(): SceneTravelSpec {
  if (cachedSceneTravelSpec) {
    return cachedSceneTravelSpec;
  }

  const raw = fs.readFileSync(SCENE_GROUNDING_PATH, "utf-8");
  cachedSceneTravelSpec = JSON.parse(raw) as SceneTravelSpec;
  return cachedSceneTravelSpec;
}

export function reloadSceneTravelSpec(): SceneTravelSpec {
  cachedSceneTravelSpec = null;
  return loadSceneTravelSpec();
}

export function listReachableSceneLocations(currentLocation: string, flags: string[]): string[] {
  const location = findSceneTravelLocation(currentLocation);
  if (!location) {
    return [];
  }

  const reachable = new Set<string>();
  for (const exit of location.exits ?? []) {
    if ((exit.required_flags ?? []).every((flag) => flags.includes(flag))) {
      reachable.add(exit.destination);
    }
  }

  return Array.from(reachable);
}

export function isSceneLocationReachable({
  currentLocation,
  proposedLocation,
  flags
}: {
  currentLocation: string;
  proposedLocation: string;
  flags: string[];
}): boolean {
  const normalizedProposed = normalizeText(proposedLocation);
  return listReachableSceneLocations(currentLocation, flags).some(
    (location) => normalizeText(location) === normalizedProposed
  );
}

function findSceneTravelLocation(currentLocation: string): SceneTravelLocation | null {
  const normalizedCurrentLocation = normalizeText(currentLocation);
  return (
    loadSceneTravelSpec().locations.find((location) => {
      const aliases = [location.name, ...(location.aliases ?? [])];
      return aliases.some((alias) => normalizeText(alias) === normalizedCurrentLocation);
    }) ?? null
  );
}

function normalizeText(value: string): string {
  return value
    .toLowerCase()
    .replace(/["'“”‘’.,!?]/g, " ")
    .replace(/\b(?:the|a|an)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
