# Backlog

This document is the AI-facing execution board for the project. It is optimized for coding agents and humans working through small, verifiable tasks.

If this file and [ROADMAP.md](/g:/text-game/ROADMAP.md) disagree, the roadmap wins on product scope and phase order. If this file and implementation disagree, update this file before starting new work.

## How Agents Must Use This File

1. Read [ROADMAP.md](/g:/text-game/ROADMAP.md), this file, and [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md) before starting substantial work.
2. Choose work from `## Ready Queue` unless the user explicitly assigns a different task.
3. Claim exactly one task card by changing its `Status` from `Ready` to `In Progress`.
4. Do only the work described in that task card unless a blocking dependency forces a documented expansion.
5. Run the listed validation commands before marking the task complete.
6. Update the task card, the queue table, and any affected docs before ending the session.
7. If blocked, change the task to `Blocked` and add a one-line blocker note.

## Status Model

- `Ready`: fully specified and safe for an agent to start
- `In Progress`: currently being worked by one agent
- `Blocked`: cannot proceed because a dependency, decision, or missing context prevents safe execution
- `Review`: implementation is done and awaits human or follow-up agent review
- `Done`: validated and fully handed off
- `Dropped`: intentionally removed from scope

## Queue Model

- `Now`: should be worked in the current phase
- `Next`: can be prepared now but should not be started until `Now` work is stable
- `Later`: intentionally deferred

## Agent Task Card Template

Use this exact shape when adding new work:

```md
### T00 - Short Task Name

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: One-sentence description of the outcome.
- Scope:
  - concrete deliverable 1
  - concrete deliverable 2
- Files to Touch:
  - path/to/file
  - path/to/other-file
- Do Not Touch:
  - path/to/protected-area
- Dependencies:
  - T00a
- Validation:
  - npm test
  - npm run lint
- Definition of Done:
  - observable completion condition 1
  - observable completion condition 2
- Handoff Notes:
  - what the next agent should know
```

## Ready Queue

| ID | Queue | Phase | Priority | Task | Status | Depends On | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T01 | Now | P0 | P1 | Dev environment bootstrap script | Review | None | `npm install`; `npm run dev`; `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1` |
| T02 | Now | P0 | P1 | Config module with schema validation | Ready | None | `npm test` |
| T02a | Now | P0 | P1 | LiteLLM env contract and alias defaults | Ready | T02 | Manual config verification |
| T02b | Now | P0 | P1 | LiteLLM proxy template and startup docs | Ready | T02a | Manual LiteLLM startup verification |
| T02c | Now | P0 | P2 | Windows local AI smoke-test path | Review | T02 | Manual local provider startup verification |
| T02d | Now | P0 | P2 | Local AI workflow regression harness | Done | T02c | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` |
| T02e | Now | P0 | P1 | AI test-first workflow policy | Done | T02d | Manual doc consistency review |
| T03 | Now | P0 | P1 | Logging with levels and redaction | Ready | None | `npm test` |
| T04 | Now | P0 | P1 | DB migrations and seed flow | Ready | None | Manual DB reset verification |
| T05 | Next | P0 | P2 | Error boundary and global handler | Ready | None | `npm test` |
| T06 | Next | P1 | P1 | Turn input, output, and state schemas | Ready | T02 | `npm test` |
| T07 | Next | P1 | P1 | Turn handler and model orchestration | Ready | T06 | `npm test` |
| T07a | Next | P1 | P1 | LiteLLM default chat route for turn generation | Ready | T02b, T07 | Manual turn submission against LiteLLM |
| T08 | Next | P1 | P1 | Deterministic state reducer | Ready | T06 | `npm test` |
| T09 | Next | P1 | P1 | Event log persistence and replay | Ready | T04, T08 | Replay fixture execution |
| T10 | Next | P1 | P1 | Output validator and sanitizer | Ready | T06 | `npm test` |
| T11 | Next | P1 | P2 | Minimal web UI loop | Review | T06 | Manual browser smoke test |
| T12 | Next | P1 | P2 | New game onboarding | Ready | T06 | Manual new-game flow check |
| T12a | Later | P1 | P3 | Rate limiting and abuse guard | Ready | T07 | `npm test` |
| T13 | Later | P2 | P1 | Embeddings pipeline | Ready | T07a | Manual embedding call verification |
| T13a | Later | P2 | P1 | LiteLLM embedding alias integration | Ready | T02b | Manual embedding route verification |
| T14 | Later | P2 | P1 | Retrieval and top-k ranking | Ready | T13, T13a | Retrieval fixture check |
| T15 | Later | P2 | P1 | Memory summarizer job | Ready | T09 | `npm test` |
| T16 | Later | P2 | P1 | Director spec format and versioning | Ready | T06, D02 | Schema validation check |
| T17 | Later | P2 | P1 | Director enforcement in turn pipeline | Ready | T16 | Integration test |
| T18 | Later | P2 | P2 | Director reload endpoint | Ready | T16 | Manual reload verification |
| T19 | Later | P3 | P1 | Quest schema and validation | Ready | T16 | Schema validation check |
| T20 | Later | P3 | P1 | Quest state transitions | Ready | T19 | `npm test` |
| T21 | Later | P3 | P2 | Quest editor UI | Ready | T19 | Manual editor smoke test |
| T22 | Later | P3 | P2 | World state inspector UI | Ready | T20 | Manual diff view check |
| T23 | Later | P3 | P2 | Quest import and export | Ready | T19 | Import/export smoke test |
| T24 | Later | P4 | P1 | Core pipeline tests | Ready | T07, T08, T10 | CI-equivalent test run |
| T25 | Later | P4 | P1 | Fuzz tests for validator | Ready | T10 | Fuzz test run |
| T26 | Later | P4 | P1 | Telemetry for tokens, latency, and cost | Ready | T07 | Manual telemetry verification |
| T27 | Later | P4 | P2 | Audit log export | Ready | T09 | Export smoke test |
| T28 | Later | P4 | P2 | Model failure fallback | Ready | T07, T10 | Timeout/failure simulation |
| T29 | Later | P5 | P1 | Save slots UI | Ready | T08, T09 | Manual save/load check |
| T30 | Later | P5 | P1 | Save import and export | Ready | T29 | Import/export compatibility check |
| T31 | Later | P5 | P2 | Optional save encryption | Ready | T29 | Encryption/decryption smoke test |
| T32 | Later | P5 | P1 | Accessibility pass | Ready | T11 | Accessibility checklist |
| T33 | Later | P5 | P2 | Theme and typography pass | Ready | T11 | Manual readability review |
| T34 | Later | P5 | P1 | Tutorial and first-run guidance | Ready | T11, T12 | Manual onboarding smoke test |
| T35 | Later | P6 | P1 | Packaging prototype and decision memo | Ready | Phase 5 exit gate, D04 | Prototype build verification |
| T36 | Later | P6 | P1 | Windows and macOS builds | Ready | T35 | Build/install verification |
| T37 | Later | P6 | P2 | Auto-update channel | Ready | T36 | Update flow verification |
| T38 | Later | P6 | P2 | Installer packaging | Ready | T36 | Installer smoke test |
| T39 | Later | P6 | P3 | Linux build | Ready | T35 | Build verification if supported |
| T40 | Later | P6 | P2 | Release checklist | Ready | T36 | Checklist walkthrough |

## Active Task Protocol

When an agent starts work, it must:

1. Pick one `Ready` task.
2. Change its status in the queue table to `In Progress`.
3. Add or update the detailed task card for that task.
4. Keep scope inside the `Files to Touch` list unless the dependency chain forces a change.
5. Finish by moving the task to `Review` or `Done`, with validation and handoff notes recorded.

When a human assigns a task directly, the assigned task overrides queue order.

## Detailed Task Cards

### T01 - Dev Environment Bootstrap Script

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make local setup and startup reproducible with the fewest manual steps possible.
- Scope:
  - define a one-command local startup path
  - add a Windows launcher that checks prerequisites, verifies the configured AI path, starts the app server, and opens the browser
  - document the expected local prerequisites
  - ensure the startup path matches the README
- Files to Touch:
  - package.json
  - README.md
  - .env.example
  - BACKLOG.md
  - scripts/start-dev.ps1
- Do Not Touch:
  - src/
  - public/
- Dependencies:
  - None
- Validation:
  - `npm install`
  - `npm run dev`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1`
- Definition of Done:
  - one documented command starts the app locally
  - the Windows launcher checks the expected local prerequisites and opens the app automatically
  - required environment variables are documented
  - setup instructions match the current repository
- Handoff Notes:
  - user assigned the Windows startup script directly on 2026-03-07
  - added `scripts/start-dev.ps1` plus `npm run dev:windows`
  - the launcher reads `.env` when present, falls back to the Ollama local preset when `.env` is missing, checks the configured AI path, starts the app server in a new PowerShell window, waits for readiness, and opens the browser
  - validation completed: PowerShell syntax parse for `scripts/start-dev.ps1`, direct launcher run through the prerequisite check, and `git diff --check`
  - full validation is still pending because `node` and `npm` are unavailable in this shell, so `npm install`, `npm run dev`, and end-to-end browser startup could not be executed here

### T02 - Config Module With Schema Validation

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Centralize runtime configuration and fail early on invalid environment state.
- Scope:
  - define the configuration surface used by the app
  - validate required environment variables at startup
  - expose normalized config values to callers
- Files to Touch:
  - src/config.js
  - src/server.js
  - README.md
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - None
- Validation:
  - `npm test`
  - manual startup with valid and invalid env values
- Definition of Done:
  - missing required config fails clearly at startup
  - config parsing logic is centralized in one module
  - docs reflect the actual config contract
- Handoff Notes:
  - note any env vars intentionally left provisional for LiteLLM integration

### T03 - Logging With Levels And Redaction

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Platform lead
- Goal: Provide consistent logs that are useful for debugging without leaking secrets.
- Scope:
  - add log levels
  - redact secrets and sensitive request fields
  - make log usage consistent in the server path
- Files to Touch:
  - src/server.js
  - src/config.js
  - README.md
- Do Not Touch:
  - public/
- Dependencies:
  - None
- Validation:
  - `npm test`
  - manual request smoke test with logs enabled
- Definition of Done:
  - logs include level and message context
  - known sensitive values are not printed plainly
  - logging behavior is documented enough for local debugging
- Handoff Notes:
  - note any remaining unstructured logs for later cleanup

### T04 - DB Migrations And Seed Flow

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Replace ad hoc database setup with repeatable initialization and reset flows.
- Scope:
  - define the initial migration path
  - define a seed/reset workflow
  - document the workflow for local development
- Files to Touch:
  - src/db.js
  - package.json
  - README.md
- Do Not Touch:
  - public/
- Dependencies:
  - None
- Validation:
  - database reset and restart smoke test
- Definition of Done:
  - a developer can create and reset the database repeatably
  - schema creation is not hidden in incidental app startup logic only
  - local docs describe the reset path
- Handoff Notes:
  - note any schema assumptions that later migrations must preserve

### T06 - Turn Input, Output, And State Schemas

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Define versioned schema boundaries for the core gameplay loop.
- Scope:
  - define turn input shape
  - define structured model output shape
  - define authoritative state shape and version marker
- Files to Touch:
  - src/validator.js
  - src/server.js
  - REQUIREMENTS.md
- Do Not Touch:
  - public/styles.css
  - packaging docs
- Dependencies:
  - T02
- Validation:
  - `npm test`
- Definition of Done:
  - schemas are explicit and versioned
  - invalid payloads are rejected
  - the schema contract is documented for future AI tasks
- Handoff Notes:
  - record schema version names and any intentionally deferred fields

### T11 - Minimal Web UI Loop

- Status: Review
- Queue: Next
- Phase: P1
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Provide a simple browser UI that can send turns to the local AI path and expose enough runtime detail for manual debugging.
- Scope:
  - keep a text-first browser play loop for player input and narrator output
  - add a debug surface for session, model, timing, and turn payload inspection
  - keep the implementation aligned with the existing server endpoints instead of creating a parallel UI contract
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.js
  - public/styles.css
  - src/server.js
- Do Not Touch:
  - data/spec/
  - src/ai.js
  - src/assist.js
  - src/db.js
- Dependencies:
  - T06
- Validation:
  - `npm install`
  - `npm run dev`
  - manual browser smoke test against the configured local AI path
- Definition of Done:
  - a player can create or resume a session in the browser and submit turns
  - narrator output, suggested options, and current state are visible without opening devtools
  - useful debug details are visible for local AI iteration without exposing secrets
- Handoff Notes:
  - user assigned this ahead of queue order on 2026-03-07 to make local AI iteration easier before deeper roadmap work
  - implemented a browser play shell with session refresh/new-session controls, multiline text input, suggestion chips, and a persistent debug panel
  - `/api/state` now returns safe runtime/session debug data and `/api/turn` now returns safe debug data including request id, latency, prompt preview, embedding fallback status, validation result, and before/after player snapshots
  - local validation was limited to code inspection plus `git diff --check`; `npm install`, `npm run dev`, and the manual browser smoke test were not runnable because `node` and `npm` were unavailable in this shell environment

### T02c - Windows Local AI Smoke-Test Path

- Status: Review
- Queue: Now
- Phase: P0
- Priority: P2
- Owner Role: Tech lead
- Goal: Add a Windows-only local AI setup path that keeps the runtime provider-neutral and is cheap enough for smoke testing.
- Scope:
  - add a local provider mode with sensible defaults for a small Windows-friendly model stack
  - document the Windows install and startup flow in `setup_local_a.i.md`
  - expose the local env contract in repo docs and examples
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - REQUIREMENTS.md
  - .env.example
  - src/config.js
  - setup_local_a.i.md
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.js
- Dependencies:
  - T02
- Validation:
  - `npm install`
  - `npm run dev`
  - manual config inspection for `AI_PROVIDER=ollama`
- Definition of Done:
  - a Windows developer has one documented local AI setup path to follow
  - the app can resolve local-provider defaults without extra code edits
  - setup and config docs match the implemented env behavior
- Handoff Notes:
  - use this path for smoke tests only until structured-output reliability is measured against fixtures
  - direct Ollama validation passed on 2026-03-07 for `POST /v1/chat/completions` with JSON schema, `POST /v1/embeddings`, and one full `game_turn`-shaped response using `gemma3:4b` plus `embeddinggemma`
  - `npm install`, `npm run dev`, and config runtime verification were not runnable in this session because `node` and `npm` were unavailable in the shell environment

### T02d - Local AI Workflow Regression Harness

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P2
- Owner Role: AI systems lead
- Goal: Turn local AI smoke checks into a repeatable regression workflow that developers can run before and after AI-related changes.
- Scope:
  - add a Windows-first script that validates the local OpenAI-compatible AI contract used by this repo
  - add one repo command that runs the local AI workflow test
  - document the expected red-green workflow for AI prompt, schema, and adapter changes
- Files to Touch:
  - BACKLOG.md
  - ENGINEERING_STANDARDS.md
  - README.md
  - package.json
  - setup_local_a.i.md
  - scripts/test-local-ai-workflow.ps1
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.js
  - src/ai.js
- Dependencies:
  - T02c
- Validation:
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`
- Definition of Done:
  - the local AI contract can be re-run on demand with one documented command
  - the workflow explains when to run the harness before and after AI-related changes
  - failures are specific enough to point at the broken contract area
- Handoff Notes:
  - keep this harness provider-neutral at the API shape level even when Ollama is the current local default
  - validated on 2026-03-07 with `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` against local Ollama using `gemma3:4b` and `embeddinggemma`

### T02e - AI Test-First Workflow Policy

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make AI-facing changes follow a test-first workflow so future agent work is verified before behavior is changed.
- Scope:
  - define a repo-wide test-first policy for AI-related work
  - align agent instructions, engineering standards, and contributor docs on the same workflow
  - require AI behavior changes to add or tighten a reusable verification artifact before implementation
- Files to Touch:
  - BACKLOG.md
  - ENGINEERING_STANDARDS.md
  - README.md
  - AGENTS.md
  - .copilot-instructions
- Do Not Touch:
  - src/
  - public/
  - data/spec/
- Dependencies:
  - T02d
- Validation:
  - manual doc consistency review
- Definition of Done:
  - repo instructions explicitly require test-first handling for AI-related work
  - the AI workflow documents describe the same order of operations
  - future agents can identify what verification artifact must exist before implementation starts
- Handoff Notes:
  - user explicitly requested this process on 2026-03-07
  - future AI tasks should begin by updating a unit test, integration fixture, replay case, or the local AI workflow harness before changing implementation
  - manual consistency review completed across `ENGINEERING_STANDARDS.md`, `AGENTS.md`, `.copilot-instructions`, `README.md`, and this task card

## Immediate Open Decisions

| ID | Decision | Needed By | Owner | Status |
| --- | --- | --- | --- | --- |
| D01 | Numeric budgets for latency, token use, cost, and DB growth | Phase 0 exit | Tech lead | Open |
| D02 | Director spec format: JSON or YAML | Before T16 starts | Gameplay systems lead | Open |
| D03 | Sample MVP quest/story arc definition | Before Phase 1 exit | Product/UI lead | Open |
| D04 | Packaging stack: Tauri or Electron | Before T35 starts | Release lead | Open |

## Agent Execution Rules

- Prefer the smallest task that unblocks the phase.
- Do not silently expand scope across multiple tasks.
- Do not mark a task `Done` without running its listed validation.
- If validation cannot be run, leave the task at `Review` and record exactly what is unverified.
- Update related docs in the same session when the task changes setup, scope, or behavior.
- If a task card is missing fields, repair the card before writing code.
- If the user request conflicts with the queue, follow the user request and then update this file to reflect reality.
- For AI-related work, require a test-first flow: add or tighten a test, fixture, replay case, or harness step before changing implementation, then run the focused check plus the relevant broader validation.
