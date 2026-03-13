import {
  type RuntimePreflightIssue,
  type RuntimePreflightReport,
  type SetupStatusPayload,
  type ValidationResult
} from "../../core/types.js";

export function validateSetupStatusResponse(payload: unknown): ValidationResult<string> {
  if (!payload || typeof payload !== "object") {
    return { ok: false, errors: ["setup status response must be an object."] };
  }

  const candidate = payload as Partial<SetupStatusPayload> & Record<string, unknown>;
  if (!candidate.setup || typeof candidate.setup !== "object") {
    return { ok: false, errors: ["setup must be an object."] };
  }

  const setup = candidate.setup as unknown as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof setup.status !== "string") {
    errors.push("setup.status must be a string.");
  }
  if (typeof setup.summary !== "string") {
    errors.push("setup.summary must be a string.");
  }
  if (!(setup.checked_at === null || typeof setup.checked_at === "string")) {
    errors.push("setup.checked_at must be a string or null.");
  }
  if (typeof setup.can_retry !== "boolean") {
    errors.push("setup.can_retry must be a boolean.");
  }

  errors.push(...validateSetupCurrentProfile(setup.current_profile).map((error) => `setup.current_profile.${error}`));
  errors.push(...validateSetupSupportedPath(setup.supported_path).map((error) => `setup.supported_path.${error}`));
  errors.push(...validateRuntimePreflightReport(setup.preflight).map((error) => `setup.preflight.${error}`));

  return { ok: errors.length === 0, errors };
}

export function validateRuntimePreflightReport(report: unknown): string[] {
  if (!report || typeof report !== "object") {
    return ["must be an object."];
  }

  const candidate = report as Partial<RuntimePreflightReport> & Record<string, unknown>;
  const errors: string[] = [];
  if (typeof candidate.ok !== "boolean") {
    errors.push("ok must be a boolean.");
  }
  if (typeof candidate.status !== "string") {
    errors.push("status must be a string.");
  }
  if (typeof candidate.summary !== "string") {
    errors.push("summary must be a string.");
  }
  if (!(candidate.checked_at === null || typeof candidate.checked_at === "string")) {
    errors.push("checked_at must be a string or null.");
  }

  if (!candidate.counts || typeof candidate.counts !== "object") {
    errors.push("counts must be an object.");
  } else {
    const counts = candidate.counts as unknown as Record<string, unknown>;
    ["blocker", "warning", "info"].forEach((field) => {
      if (typeof counts[field] !== "number") {
        errors.push(`counts.${field} must be a number.`);
      }
    });
  }

  if (!Array.isArray(candidate.issues)) {
    errors.push("issues must be an array.");
  } else {
    candidate.issues.forEach((issue, index) => {
      errors.push(...validateRuntimePreflightIssue(issue).map((error) => `issues[${index}].${error}`));
    });
  }

  return errors;
}

export function validateRuntimePreflightIssue(issue: unknown): string[] {
  if (!issue || typeof issue !== "object") {
    return ["must be an object."];
  }

  const candidate = issue as Partial<RuntimePreflightIssue> & Record<string, unknown>;
  const errors: string[] = [];
  ["code", "severity", "area", "title", "message"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!(candidate.recommended_fix === null || typeof candidate.recommended_fix === "string")) {
    errors.push("recommended_fix must be a string or null.");
  }

  if (!Array.isArray(candidate.recovery)) {
    errors.push("recovery must be an array.");
  } else if (candidate.recovery.some((item) => typeof item !== "string")) {
    errors.push("recovery must contain only strings.");
  }

  if (!Array.isArray(candidate.env_vars)) {
    errors.push("env_vars must be an array.");
  } else if (candidate.env_vars.some((item) => typeof item !== "string")) {
    errors.push("env_vars must contain only strings.");
  }

  return errors;
}

function validateSetupCurrentProfile(profile: unknown): string[] {
  if (!profile || typeof profile !== "object") {
    return ["must be an object."];
  }

  const candidate = profile as Record<string, unknown>;
  const errors: string[] = [];
  ["id", "label", "provider", "chat_model", "embedding_model"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  return errors;
}

function validateSetupSupportedPath(path: unknown): string[] {
  if (!path || typeof path !== "object") {
    return ["must be an object."];
  }

  const candidate = path as Record<string, unknown>;
  const errors: string[] = [];
  ["provider", "title", "summary", "launcher"].forEach((field) => {
    if (typeof candidate[field] !== "string") {
      errors.push(`${field} must be a string.`);
    }
  });

  if (!Array.isArray(candidate.services)) {
    errors.push("services must be an array.");
  } else if (candidate.services.some((service) => typeof service !== "string")) {
    errors.push("services must contain only strings.");
  }

  return errors;
}
