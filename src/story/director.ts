import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import type { DirectorAct, DirectorBeat, DirectorSpec, DirectorState, StateUpdates } from "../core/types.js";

const SPEC_PATH = path.resolve(process.cwd(), "data", "spec", "director.json");

let cachedSpec: DirectorSpec | null = null;

export function loadDirectorSpec(): DirectorSpec {
  if (cachedSpec) return cachedSpec;
  const raw = fs.readFileSync(SPEC_PATH, "utf-8");
  cachedSpec = JSON.parse(raw) as DirectorSpec;
  return cachedSpec;
}

export function reloadDirectorSpec(): DirectorSpec {
  cachedSpec = null;
  return loadDirectorSpec();
}

export function getInitialDirectorState(spec: DirectorSpec): DirectorState {
  const firstAct = spec.acts[0];
  const firstBeat = firstAct?.beats[0];

  if (!firstAct || !firstBeat) {
    throw new Error("Director spec must include at least one act and one beat.");
  }

  return {
    end_goal: spec.end_goal,
    current_act_id: firstAct.id,
    current_act: firstAct.name,
    current_beat_id: firstBeat.id,
    current_beat_label: firstBeat.label,
    story_beats_remaining: totalBeats(spec),
    end_goal_progress: `Next step: ${firstBeat.label}.`,
    completed_beats: []
  };
}

export function totalBeats(spec: DirectorSpec): number {
  return spec.acts.reduce((sum, act) => sum + act.beats.length, 0);
}

export function getCurrentAct(spec: DirectorSpec, directorState: DirectorState): DirectorAct {
  return spec.acts.find((act) => act.id === directorState.current_act_id) || spec.acts[0]!;
}

export function getCurrentBeat(spec: DirectorSpec, directorState: DirectorState): DirectorBeat {
  const act = getCurrentAct(spec, directorState);
  return act.beats.find((beat) => beat.id === directorState.current_beat_id) || act.beats[0]!;
}

export function findBeat(spec: DirectorSpec, beatId: string): { act: DirectorAct; beat: DirectorBeat } | null {
  for (const act of spec.acts) {
    const beat = act.beats.find((item) => item.id === beatId);
    if (beat) return { act, beat };
  }
  return null;
}

export function getNextBeat(
  spec: DirectorSpec,
  directorState: DirectorState,
  flags: string[]
): { act: DirectorAct; beat: DirectorBeat } | null {
  const act = getCurrentAct(spec, directorState);
  const currentIndex = act.beats.findIndex((beat) => beat.id === directorState.current_beat_id);

  for (let i = currentIndex + 1; i < act.beats.length; i += 1) {
    const beat = act.beats[i]!;
    if (requirementsMet(beat.required_flags, flags)) return { act, beat };
  }

  const actIndex = spec.acts.findIndex((item) => item.id === act.id);
  for (let j = actIndex + 1; j < spec.acts.length; j += 1) {
    const nextAct = spec.acts[j]!;
    const nextBeat = nextAct.beats.find((beat) => requirementsMet(beat.required_flags, flags));
    if (nextBeat) return { act: nextAct, beat: nextBeat };
  }

  return null;
}

export function requirementsMet(requiredFlags: string[] | undefined, flags: string[]): boolean {
  if (!requiredFlags || !requiredFlags.length) return true;
  return requiredFlags.every((flag) => flags.includes(flag));
}

export function applyDirectorRules({
  spec,
  directorState,
  stateUpdates,
  flags
}: {
  spec: DirectorSpec;
  directorState: DirectorState;
  stateUpdates: StateUpdates;
  flags: string[];
}): DirectorState {
  const rules = spec.rules || {};
  const maxAdvance = rules.max_beats_per_turn ?? 1;

  const newDirector: DirectorState = { ...directorState };
  let beatAdvances = 0;

  if (stateUpdates.flags_add.length) {
    const additions = stateUpdates.flags_add;
    const currentBeat = getCurrentBeat(spec, directorState);
    const unlocks = currentBeat.unlock_flags || [];
    const unlocked = additions.some((flag) => unlocks.includes(flag));

    if (unlocked && beatAdvances < maxAdvance) {
      newDirector.completed_beats = [...newDirector.completed_beats, currentBeat.id];
      newDirector.story_beats_remaining = Math.max(0, newDirector.story_beats_remaining - 1);
      beatAdvances += 1;

      const next = getNextBeat(spec, newDirector, flags);
      if (next) {
        newDirector.current_act_id = next.act.id;
        newDirector.current_act = next.act.name;
        newDirector.current_beat_id = next.beat.id;
        newDirector.current_beat_label = next.beat.label;
      }
    }
  }

  return newDirector;
}
