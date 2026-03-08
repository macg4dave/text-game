# AGENTS.md

## Purpose

This repository is intended to be built primarily with coding agents. Use the planning docs as a task system, not as passive documentation.

## Required Reading Order

Before starting substantial work, read:

1. [ROADMAP.md](/g:/text-game/ROADMAP.md)
2. [BACKLOG.md](/g:/text-game/BACKLOG.md)
3. [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md)
4. [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md)
5. [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md) if the task affects structure or runtime boundaries

## Task Manager Usage

- Treat [BACKLOG.md](/g:/text-game/BACKLOG.md) as the execution source of truth.
- Pick work from `## Ready Queue` unless the user explicitly assigns a different task.
- Claim only one task at a time by changing its status to `In Progress`.
- Use the matching detailed task card to determine scope, files, validation, and handoff requirements.
- If the task card is incomplete, fix the task card before making code changes.
- When done, update the task status and leave handoff notes in the task card.

## Agent Workflow

1. Read the assigned or selected task card.
2. Confirm dependencies are satisfied.
3. For AI-related work, start by adding or tightening a test, fixture, or scripted harness step that defines the expected behavior before changing implementation.
4. Keep edits inside `Files to Touch` unless the task card is updated first.
5. If TypeScript source changed, run `npm run type-check` in Docker before the listed validation commands.
6. Update docs affected by the change.
7. Move the task to `Review` or `Done`.

## Status Rules

- `Ready`: safe to start
- `In Progress`: active work by one agent
- `Blocked`: cannot continue safely
- `Review`: implementation done but not fully closed
- `Done`: validated and handed off

## Scope Rules

- Prefer the smallest change that satisfies the task card.
- Do not combine multiple backlog tasks in one session unless the user explicitly asks for it.
- Do not mark speculative architecture work as complete.
- Do not expand into packaging, styling, or unrelated refactors unless the task card requires it.

## Documentation Rules

- If setup or env vars change, update [README.md](/g:/text-game/README.md).
- If user-visible scope or behavior changes, update [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md).
- If the delivery plan or sequencing changes, update [ROADMAP.md](/g:/text-game/ROADMAP.md).
- If task status, validation state, or dependencies change, update [BACKLOG.md](/g:/text-game/BACKLOG.md).

## Validation Rules

- Never mark a task `Done` without running the task's listed validation or explaining why it could not be run.
- If validation is partially complete, use `Review` instead of `Done`.
- If a blocker appears, switch the task to `Blocked` and record the blocker briefly.
- Treat TypeScript compile or type-check failures as blockers, not warnings.
- For AI behavior changes, validation must include the updated test, fixture, or harness path that was defined before implementation, plus the local AI workflow harness when a compatible local provider is available.

## Project Constraints

- Keep the app provider-neutral internally even when LiteLLM is the default external interface.
- Keep authoritative state server-side and replayable.
- Validate AI output before state mutation.
- Run `npm` and `node` commands in Docker for this project; do not execute them directly on the host.
- Prefer deterministic behavior and small, verifiable edits.
- Treat `src/**/*.ts` as the authoring surface, including browser code under `src/ui/`. `public/app.js` is emitted build output and should not be hand-edited unless a task explicitly requires validating generated assets.

## Module Boundary Rules

- Organize new code by owning domain first. Prefer the existing module folders under `src/` over creating ad hoc top-level files.
- Keep one layer per file. A file may orchestrate, implement domain logic, render UI, or perform transport or setup work, but it should not own multiple layers at once.
- Keep `src/core/` for shared primitives and infrastructure only: config, DB, shared contracts, and truly cross-cutting types. Do not turn `core` into a fallback bucket for unrelated feature logic.
- Prefer a thin public module plus internal helper files when a shared infrastructure area grows large. `src/core/config.ts` plus `src/core/config/*.ts` is the model to follow rather than one oversized infrastructure file.
- Treat `src/server/` as the composition root. Keep HTTP routing, request parsing, response shaping, and startup wiring there. Move reusable gameplay, AI, validation, and preflight logic into non-server modules.
- Do not import from `src/server/` or `src/ui/` into `src/state/`, `src/story/`, `src/rules/`, `src/ai/`, or `src/utils/`.
- Keep `src/ui/` browser-only. It should talk to the server through the HTTP contract rather than importing server, DB, or gameplay implementation modules directly.
- Prefer one-way dependency flow: `core` -> domain modules -> `server` or `ui`. Avoid circular imports and avoid feature modules depending on entrypoint code.
- When a change introduces a new responsibility or a different dependency set, create a new module instead of extending a large mixed-purpose file.
- Treat subordinate responsibilities as split triggers. If a file starts handling a distinct sub-problem with its own inputs, outputs, branching, or tests, extract it into its own module.
- Treat reusable decision-making as a split trigger. If logic could be reused by another route, screen, script, or test, it does not belong inline in the current file.
- Do not let wiring code own domain rules. If `src/server/` starts deciding gameplay, AI, validation, or state behavior, move that logic into the owning non-server module.
- Keep data shaping separate from presentation. If a file both derives or maps data and renders or presents it, move one of those responsibilities into a focused module.
- Do not let helper files become buckets. If a helper starts collecting unrelated logic from multiple domains, move the logic into feature-owned modules instead of growing the helper.
- Keep composition roots thin. `src/server/`, `src/ui/app.ts`, and entry scripts may assemble modules, but they should not become the place where feature behavior lives.
- Prefer feature-local modules over generic ones. If a new behavior clearly belongs to one feature, place it next to that feature rather than in a central file that already has broad access.
- Review responsibility boundaries, not file length. Extraction decisions should be based on mixed concerns, reuse potential, and layer violations rather than line-count thresholds.
- Use the sentence test during review: if a file's responsibility cannot be described in one sentence without the word `and`, split it.
- Keep feature-local types next to the feature. Promote a type into `src/core/types.ts` only when it is shared across modules or represents a boundary contract.
- Place new tests beside the owning module when practical, using `*.test.ts` in the same feature folder.
- Edit browser source in `src/ui/app.ts`. `public/app.ts` is a legacy placeholder and should not receive new logic.

## Script Structure Rules

- Keep entry scripts under `scripts/` small and orchestration-focused.
- Move reusable PowerShell functions into `scripts/lib/*.ps1` so launcher, harness, and packaging scripts can share one implementation.
- Do not duplicate dotenv parsing, config lookup, Docker wrappers, port probing, HTTP readiness checks, or shared logging across scripts unless a task explicitly requires a one-off behavior.
- Prefer one debugging surface per concern: fix the shared helper instead of papering over the same issue in multiple scripts.
- Treat mixed orchestration and implementation as a split trigger. If a script does more than parse inputs, call shared helpers, wait for readiness, and report status, move the reusable logic into `scripts/lib/`.
- If a script owns retry policy, environment resolution, port probing, or readiness behavior that another script could reuse, move that behavior into `scripts/lib/` instead of keeping it inline.
- Keep script entrypoints focused on intent and sequencing. Shared setup, transport, and policy logic should live in helpers that can be tested or reused independently.

## Responsibility Heuristics

- If a UI module controls page flow and also renders a distinct panel, dialog, setup step, or turn surface, extract that subview into its own module.
- If a UI module both handles DOM events and contains non-trivial formatting, mapping, or state-derivation rules, move those rules into a focused feature-local helper or view module.
- If a server route both parses requests and decides gameplay or AI behavior, move the behavior into a non-server module.
- If a module both validates external input and mutates authoritative state, keep validation separate from mutation.
- If a file starts accumulating sections such as `setup`, `render`, `helpers`, `state`, and `transport` together, treat that as a sign that it owns too many responsibilities.
- If a change feels easiest only because one file already has access to everything, treat that as a signal to extract rather than a reason to keep adding code there.
