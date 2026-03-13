import process from "node:process";
import { TOOL_SAFETY_POLICY } from "./tool-safety-policy.mjs";

const MONITORED_TOOL_NAMES = new Set(TOOL_SAFETY_POLICY.monitoredToolNames);

function readStdin() {
  return new Promise((resolve) => {
    let raw = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => resolve(raw));
    process.stdin.resume();
  });
}

function parseJson(raw) {
  if (!raw.trim()) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function findFirstStringByKey(value, keys) {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findFirstStringByKey(entry, keys);
      if (found) {
        return found;
      }
    }
    return null;
  }

  if (typeof value !== "object") {
    return null;
  }

  for (const [key, child] of Object.entries(value)) {
    if (keys.has(key) && typeof child === "string" && child.trim()) {
      return child.trim();
    }

    const found = findFirstStringByKey(child, keys);
    if (found) {
      return found;
    }
  }

  return null;
}

function collectCommandLikeStrings(value, results = []) {
  if (value === null || value === undefined) {
    return results;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectCommandLikeStrings(entry, results);
    }
    return results;
  }

  if (typeof value !== "object") {
    return results;
  }

  for (const [key, child] of Object.entries(value)) {
    if (typeof child === "string" && ["command", "args", "input", "commandLine", "rawCommand"].includes(key)) {
      results.push(child);
      continue;
    }

    if (Array.isArray(child) && key === "args") {
      for (const arg of child) {
        if (typeof arg === "string") {
          results.push(arg);
        }
      }
      continue;
    }

    collectCommandLikeStrings(child, results);
  }

  return results;
}

function allow() {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow"
    }
  };
}

function decide(rule, matchLabel) {
  const permissionDecision = rule.decision ?? "ask";
  const reason = `${rule.reason} Trigger: ${matchLabel}.`;

  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision,
      permissionDecisionReason: reason
    },
    systemMessage:
      permissionDecision === "deny"
        ? `${rule.reason} If access is genuinely needed, ask the user to run it themselves or to temporarily relax the workspace hook.`
        : `${rule.reason} Ask the user before continuing, or add a narrow repo-level exception in .github/hooks/tool-safety-policy.mjs if this command should be trusted by default.`
  };
}

function matchesAnyPattern(commandText, patterns = []) {
  return patterns.find((pattern) => pattern.test(commandText)) ?? null;
}

const raw = await readStdin();
const payload = parseJson(raw);
const toolName = findFirstStringByKey(payload, new Set(["toolName", "tool_name", "tool", "name"]));

if (toolName && !MONITORED_TOOL_NAMES.has(toolName)) {
  process.stdout.write(JSON.stringify(allow()));
  process.exit(0);
}

const commandText = collectCommandLikeStrings(payload).join("\n");

if (matchesAnyPattern(commandText, TOOL_SAFETY_POLICY.globalAllowPatterns)) {
  process.stdout.write(JSON.stringify(allow()));
  process.exit(0);
}

for (const rule of TOOL_SAFETY_POLICY.rules) {
  const match = matchesAnyPattern(commandText, rule.patterns);
  if (!match) {
    continue;
  }

  if (matchesAnyPattern(commandText, rule.excludePatterns)) {
    continue;
  }

  process.stdout.write(JSON.stringify(decide(rule, match.source)));
    process.exit(0);
}

process.stdout.write(JSON.stringify(allow()));
