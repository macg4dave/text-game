import {
  type DirectorSpec,
  type QuestSpec,
  type ValidationResult
} from "../../core/types.js";

export interface DirectorSpecValidationResult extends ValidationResult<string> {
  beatIds: string[];
  flags: string[];
}

export function validateDirectorSpec(spec: unknown): DirectorSpecValidationResult {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    errors.push("Spec must be an object.");
    return { ok: false, errors, beatIds: [], flags: [] };
  }

  const typedSpec = spec as Partial<DirectorSpec>;

  if (!typedSpec.end_goal || typeof typedSpec.end_goal !== "string") {
    errors.push("Spec must include end_goal (string).");
  }

  if (!Array.isArray(typedSpec.acts) || !typedSpec.acts.length) {
    errors.push("Spec must include non-empty acts array.");
  }

  const beatIds = new Set<string>();
  const flagIndex = new Set<string>();

  (typedSpec.acts || []).forEach((act, actIndex) => {
    if (!act.id || typeof act.id !== "string") {
      errors.push(`Act ${actIndex} missing id.`);
    }
    if (!act.name || typeof act.name !== "string") {
      errors.push(`Act ${actIndex} missing name.`);
    }
    if (!Array.isArray(act.beats) || !act.beats.length) {
      errors.push(`Act ${actIndex} must include beats.`);
      return;
    }

    act.beats.forEach((beat, beatIndex) => {
      if (!beat.id || typeof beat.id !== "string") {
        errors.push(`Beat ${actIndex}.${beatIndex} missing id.`);
      } else if (beatIds.has(beat.id)) {
        errors.push(`Duplicate beat id: ${beat.id}`);
      } else {
        beatIds.add(beat.id);
      }

      if (!beat.label || typeof beat.label !== "string") {
        errors.push(`Beat ${actIndex}.${beatIndex} missing label.`);
      }

      if (beat.required_flags && !Array.isArray(beat.required_flags)) {
        errors.push(`Beat ${beat.id} required_flags must be array.`);
      }

      if (beat.unlock_flags && !Array.isArray(beat.unlock_flags)) {
        errors.push(`Beat ${beat.id} unlock_flags must be array.`);
      }

      (beat.unlock_flags || []).forEach((flag) => flagIndex.add(flag));
    });
  });

  return { ok: errors.length === 0, errors, beatIds: Array.from(beatIds), flags: Array.from(flagIndex) };
}

export function validateQuestSpec(spec: unknown): ValidationResult<string> {
  const errors: string[] = [];
  if (!spec || typeof spec !== "object") {
    errors.push("Quest spec must be an object.");
    return { ok: false, errors };
  }

  const typedSpec = spec as Partial<QuestSpec>;
  if (!Array.isArray(typedSpec.quests)) {
    errors.push("Quest spec must include quests array.");
    return { ok: false, errors };
  }

  const questIds = new Set<string>();
  typedSpec.quests.forEach((quest, idx) => {
    if (!quest.id || typeof quest.id !== "string") {
      errors.push(`Quest ${idx} missing id.`);
      return;
    }
    if (questIds.has(quest.id)) {
      errors.push(`Duplicate quest id: ${quest.id}`);
    }
    questIds.add(quest.id);

    if (!quest.title || typeof quest.title !== "string") {
      errors.push(`Quest ${quest.id} missing title.`);
    }
    if (!Array.isArray(quest.stages) || !quest.stages.length) {
      errors.push(`Quest ${quest.id} must include stages.`);
    }

    (quest.stages || []).forEach((stage, stageIndex) => {
      if (!stage.id || typeof stage.id !== "string") {
        errors.push(`Quest ${quest.id} stage ${stageIndex} missing id.`);
      }
      if (!stage.label || typeof stage.label !== "string") {
        errors.push(`Quest ${quest.id} stage ${stageIndex} missing label.`);
      }
      if (stage.required_flags && !Array.isArray(stage.required_flags)) {
        errors.push(`Quest ${quest.id} stage ${stage.id} required_flags must be array.`);
      }
      if (stage.unlock_flags && !Array.isArray(stage.unlock_flags)) {
        errors.push(`Quest ${quest.id} stage ${stage.id} unlock_flags must be array.`);
      }
    });
  });

  return { ok: errors.length === 0, errors };
}
