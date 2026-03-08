# Backlog

This document is the AI-facing execution board for the project. It is optimized for coding agents and humans working through small, verifiable tasks while removing friction from the supported player path.

If this file and [ROADMAP.md](/g:/text-game/ROADMAP.md) disagree, the roadmap wins on product scope and phase order. If this file and implementation disagree, update this file before starting new work.

TypeScript source is authoritative in this repo: authoring code now lives under `src/**`, including browser UI source under `src/ui/`, and `public/app.js` is an emitted asset rather than an authoring surface.

Legacy path note for older task cards and handoff notes:

- `src/server.ts` now maps to `src/server/index.ts`
- `src/config.ts` now maps to `src/core/config.ts`
- `src/db.ts` now maps to `src/core/db.ts`
- `src/types.ts` now maps to `src/core/types.ts`
- `src/game.ts` now maps to `src/state/game.ts`
- `src/director.ts` now maps to `src/story/director.ts`
- `src/quest.ts` now maps to `src/story/quest.ts`
- `src/validator.ts` now maps to `src/rules/validator.ts`
- `src/assist.ts` now maps to `src/utils/assist.ts`
- `src/ai.ts` now maps to `src/ai/service.ts`
- `public/app.ts` now maps to `src/ui/app.ts`

Treat older task cards as historical notes where needed, but use the module-first paths above for all new work.

## How Agents Must Use This File

1. Read [ROADMAP.md](/g:/text-game/ROADMAP.md), this file, and [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md) before starting substantial work.
2. Choose work from `## Ready Queue` unless the user explicitly assigns a different task.
3. Within the current phase, bias toward the task that removes the most player friction, especially terminal use, manual config editing, and startup ambiguity.
4. Claim exactly one task card by changing its `Status` from `Ready` to `In Progress`.
5. Do only the work described in that task card unless a blocking dependency forces a documented expansion.
6. Run the listed validation commands before marking the task complete.
7. Update the task card, the queue table, and any affected docs before ending the session.
8. If blocked, change the task to `Blocked` and add a one-line blocker note.
9. When the user assigns a future-looking or cross-cutting issue directly, ground it against the current phase, dependencies, and open decisions before writing tasks.
10. Default non-trivial user-assigned issues to one parent backlog item plus explicit child tasks unless one small standalone task is clearly sufficient.
11. If a future issue is not safely startable yet, still capture it in the backlog using `Blocked`, dependencies, or an open decision instead of leaving it as an undocumented note.
12. When an assigned issue changes sequencing, user-visible scope, runtime boundaries, or delivery policy, sync the owning planning docs in the same session instead of leaving backlog-only notes.

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

## Archive

Closed historical task cards moved out of the active backlog live in [BACKLOG_ARCHIVE.md](/g:/text-game/BACKLOG_ARCHIVE.md).

- Archive cutoff audited on 2026-03-08: closed task cards before `T05` were moved out of this file so future agents can focus on open work.
- The main backlog should keep active, blocked, ready, and review items only unless a completed task still needs to stay visible for a near-term coordination reason.

## End-User-First Priority Rules

- Prefer tasks that remove terminal usage, manual `.env` editing, browser URL hunting, or hidden service management from the supported player path.
- When two tasks are otherwise similar, choose the one that makes clean-machine Windows playtesting easier.
- A task is not end-user complete if only a developer can diagnose or recover from failure.
- Browser-only convenience work does not outrank launcher, setup, save or load, or first-run clarity work while the supported player path is still rough.

## User-Assigned Issue Intake Workflow

- A user-assigned issue overrides the `## Ready Queue`, but it does not override the need for a grounded task card.
- Start with a short repo-grounding pass: current phase, likely owner role, affected modules, existing tasks, and open decisions.
- Default backlog shape for a non-trivial assigned issue:
  - one parent item using the next `Txx` id for the issue itself
  - one or more child tasks using `Txxa`, `Txxb`, and similar ids for implementation-ready slices
- Parent items should capture outcome, scope, sequencing context, dependencies, broad validation strategy, and handoff notes.
- Child tasks should stay small, implementation-ready, and explicit about files to touch, validation, and definition of done.
- If the issue is still speculative, record it anyway. Use `Blocked`, `Later`, explicit dependencies, or an open decision instead of waiting for perfect detail.
- After documenting an assigned issue, report the parent item, child tasks, docs updated, and any blocker or open decision before asking for the next issue.

## Task Card Templates

Use one of the exact shapes below when adding new work.

### Standalone Or Child Task Template

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

### Parent Issue Template

```md
### T00 - Short Parent Issue Name

- Status: Ready
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: One-sentence description of the multi-step outcome.
- Scope:
  - concrete outcome 1
  - concrete outcome 2
- Files to Touch:
  - path/to/doc-or-system-area
- Do Not Touch:
  - path/to/protected-area
- Dependencies:
  - T00x
- Child Tasks:
  - T00a
  - T00b
- Validation:
  - manual doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the parent issue is decomposed into implementation-ready child tasks
  - affected planning docs are synchronized for the issue
- Handoff Notes:
  - sequencing, blockers, or open decisions the next agent should know
```

## Ready Queue

| ID | Queue | Phase | Priority | Task | Status | Depends On | Validation |
| --- | --- | --- | --- | --- | --- | --- | --- |
| T02c | Now | P0 | P2 | Windows local AI smoke-test path | Done | T02 | `docker compose run --rm --no-deps app npm run test:config` + manual Docker Ollama smoke |
| T02d | Now | P0 | P2 | Local AI workflow regression harness | Done | T02c | `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` |
| T02e | Now | P0 | P1 | AI test-first workflow policy | Done | T02d | Manual doc consistency review |
| T02h | Now | P0 | P1 | GPU-first Docker launcher default | Done | T02g | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/core/config.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` |
| T05 | Next | P0 | P2 | Error boundary and global handler | Done | None | `npm test` |
| T02g | Next | P0 | P1 | GPU tier matrix and local model profiles | Done | T02f | Matrix review |
| T06 | Next | P1 | P1 | Turn input, output, and state schemas | Done | T02 | `npm test` |
| T07 | Next | P1 | P1 | Turn handler and model orchestration | Ready | T06, T57a, T58a | `npm test` |
| T07a | Next | P1 | P1 | LiteLLM default chat route for turn generation | Ready | T02f, T07 | Manual turn submission against LiteLLM |
| T08 | Next | P1 | P1 | Deterministic state reducer | Ready | T06, T57a, T58a | `npm test` |
| T09 | Next | P1 | P1 | Event log persistence and replay | Ready | T04, T08, T57b, T59a | Replay fixture execution |
| T10 | Next | P1 | P1 | Output validator and sanitizer | Ready | T06, T57a, T61a | `npm test` |
| T11 | Next | P1 | P1 | Minimal player UI loop | Done | T06 | `docker compose run --rm --no-deps app npm test` + `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` + manual browser smoke test |
| T11a | Now | P1 | P2 | Browser UI module decomposition groundwork | Done | T11, T12b | `docker compose build app` + `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/ui/global-error.test.ts src/ui/http-client.test.ts src/ui/player-name.test.ts src/ui/session-data.test.ts src/ui/setup-view.test.ts src/ui/debug-view.test.ts` + `docker compose run --rm --no-deps app npm run build:client` + `docker compose run --rm --no-deps app npm test` |
| T48 | Now | P1 | P1 | Server route and turn pipeline extraction | Done | T06, T12c | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/server/**/*.test.ts` + `docker compose run --rm --no-deps app npm test` |
| T49 | Now | P1 | P1 | App shell controller extraction | Done | T11a, T12c | `docker compose build app` + `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts` + `docker compose run --rm --no-deps app npm run build:client` + `powershell -ExecutionPolicy Bypass -File scripts/test-setup-browser-smoke.ps1` |
| T50 | Now | P1 | P1 | Runtime preflight service split | Ready | T02h, T12c | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/server/runtime-preflight.test.ts src/server/setup-status.test.ts src/server/host-preflight.test.ts` |
| T56 | Now | P1 | P2 | Future issue intake workflow | Done | None | Manual planning-doc consistency review |
| T56a | Now | P1 | P2 | Backlog parent and child task pattern | Done | T56 | Manual backlog structure review |
| T56b | Now | P1 | P2 | Cross-doc planning sync policy | Done | T56 | Manual roadmap, requirements, architecture, and standards consistency review |
| T57 | Now | P1 | P1 | Authority-safe turn truth boundary | Ready | T06 | Manual planning-doc consistency review |
| T57a | Now | P1 | P1 | Proposal-only turn contract and prompt boundary | Ready | T06, T61a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/http-contract.test.ts src/state/turn.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T58 | Next | P1 | P1 | Player agency and pacing boundary | Ready | T06, T57 | Manual planning-doc consistency review |
| T58a | Next | P1 | P1 | Intent, simulation, and pacing contract split | Ready | T57a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T59 | Now | P1 | P1 | Semantic event log and replay canon | Ready | T06, T57 | Manual planning-doc consistency review |
| T59a | Now | P1 | P1 | Canonical event schema and replay contract | Ready | T57a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/server/http-contract.test.ts src/rules/validator.test.ts` |
| T60 | Next | P1 | P1 | Memory classes and authority policy | Ready | T06, T57, T59 | Manual planning-doc consistency review |
| T60a | Next | P1 | P1 | Memory class contract and admission rules | Ready | T57a, T59a, T61a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T60b | Later | P2 | P1 | Class-aware retrieval and summarization policy | Ready | T60a, T13, T62b, T63a | Retrieval fixture check + `docker compose run --rm --no-deps app npm test` |
| T61 | Now | P1 | P1 | Compact turn schema boundary | Ready | T06, T57 | Manual planning-doc consistency review |
| T61a | Now | P1 | P1 | Compact proposal schema and validator contract | Ready | T06, T57 | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/http-contract.test.ts src/state/turn.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T61b | Next | P1 | P1 | Schema evolution guardrails and fixture policy | Ready | T61a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/state/turn.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T12 | Next | P1 | P1 | New game onboarding | Review | T06 | Manual new-game flow check |
| T12b | Next | P1 | P1 | First-run setup wizard and connection test | Done | T02f, T11, T12 | Manual first-run flow check |
| T11b | Next | P1 | P2 | Turn surface renderer extraction | Done | T11a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts` + `docker compose run --rm --no-deps app npm run build:client` |
| T12d | Next | P1 | P2 | First-run setup browser smoke harness | Done | T12b | Browser setup smoke path |
| T12c | Next | P1 | P1 | Guided recovery actions and advanced setup details | Done | T12b, T01c, T02i, T04a, T02j | `docker compose build app` + `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/server/setup-status.test.ts src/ui/setup-view.test.ts src/ui/launch-view.test.ts src/ui/setup-browser-smoke.test.ts` + `docker compose run --rm --no-deps app npm run build:client` + `docker compose run --rm --no-deps app npm test` |
| T29 | Next | P1 | P1 | Save slots UI | Ready | T08, T09 | Manual save/load check |
| T34 | Next | P1 | P1 | Tutorial and first-run guidance | Ready | T11, T12 | Manual onboarding smoke test |
| T57b | Next | P1 | P1 | Server consequence adjudication and commit policy | Ready | T57a, T07, T08, T10 | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `docker compose run --rm --no-deps app npm test` |
| T57c | Next | P1 | P1 | Post-commit narration and authority-drift fixtures | Ready | T57b, T09 | `docker compose run --rm --no-deps app npm run type-check` + replay fixture execution + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T59b | Next | P1 | P1 | Committed outcome event persistence and replay fixture | Ready | T59a, T57b, T09 | `docker compose run --rm --no-deps app npm run type-check` + replay fixture execution + `docker compose run --rm --no-deps app npm test` |
| T58b | Later | P2 | P1 | Simulation-first consequence resolution | Ready | T58a, T57b, T07, T08 | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `docker compose run --rm --no-deps app npm test` |
| T51 | Next | P1 | P1 | Database storage and migration boundary split | Ready | T06 | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx src/core/db.ts migrate` + `docker compose run --rm --no-deps app npx tsx src/core/db.ts reset` |
| T52 | Next | P1 | P1 | Validator contract module split | Ready | T06, T12c, T61a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts` + `docker compose run --rm --no-deps app npm test` |
| T53 | Next | P1 | P1 | Launcher entrypoint and script library split | Ready | T02h, T12c | `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T54 | Next | P1 | P2 | Setup view model and recovery policy split | Ready | T11a, T12c | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/ui/setup-view.test.ts src/ui/launch-view.test.ts src/ui/setup-browser-smoke.test.ts` + `docker compose run --rm --no-deps app npm run build:client` |
| T62 | Next | P2 | P1 | NPC memory significance pipeline | Ready | T59, T60 | Manual planning-doc consistency review |
| T62a | Next | P2 | P1 | Encounter fact schema and significance evaluator | Ready | T59a, T60a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T63 | Next | P2 | P1 | Memory storage hierarchy and context-budget policy | Ready | T59, T60, T61, T62 | Manual planning-doc consistency review |
| T63a | Next | P2 | P1 | Live context hierarchy and retrieval budget contract | Ready | T60a, T61a, T62a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T63b | Next | P2 | P1 | Summary compression and versioned memory artifacts | Ready | T63a, T59b, T62b | `docker compose run --rm --no-deps app npm run type-check` + replay fixture execution + `docker compose run --rm --no-deps app npm test` |
| T63c | Next | P2 | P1 | Memory context observability and replay tooling | Ready | T63a, T59b | `docker compose run --rm --no-deps app npm run type-check` + replay fixture execution + `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly` |
| T12a | Later | P1 | P3 | Rate limiting and abuse guard | Ready | T07 | `npm test` |
| T13 | Later | P2 | P1 | Embeddings pipeline | Ready | T07a, T60a, T62b | Manual embedding call verification |
| T13a | Later | P2 | P1 | LiteLLM embedding alias integration | Ready | T02f | Manual embedding route verification |
| T47 | Later | P2 | P1 | LiteLLM default route integration fixtures | Ready | T07a, T13a | LiteLLM route fixture run |
| T55 | Later | P2 | P2 | Config env resolution and diagnostics split | Ready | T02h | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/core/config.test.ts` |
| T14 | Later | P2 | P1 | Retrieval and top-k ranking | Ready | T13, T13a, T60b, T62c | Retrieval fixture check |
| T15 | Later | P2 | P1 | Memory summarizer job | Ready | T09, T60b, T62c, T63b | `npm test` |
| T62b | Later | P2 | P1 | NPC importance tiers and long-lived memory admission | Ready | T62a | `docker compose run --rm --no-deps app npm run type-check` + `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts` + `docker compose run --rm --no-deps app npm test` |
| T62c | Later | P2 | P1 | Partitioned retrieval for NPC, world, journal, and scene context | Ready | T62b, T60b, T13 | Retrieval fixture check + `docker compose run --rm --no-deps app npm test` |
| T16 | Later | P2 | P1 | Director spec format and versioning | Ready | T06, D02, T58a | Schema validation check |
| T17 | Later | P2 | P1 | Director enforcement in turn pipeline | Ready | T16, T58b | Integration test |
| T18 | Later | P2 | P2 | Director reload endpoint | Ready | T16 | Manual reload verification |
| T43 | Later | P2 | P1 | Budget config file and API contract | Ready | D01, T07a, T09, T13a, T63a | `npm test` + manual budget API round-trip |
| T44 | Later | P2 | P2 | Budget controls UI | Ready | T11, T43 | Manual budget UI round-trip |
| T46 | Later | P2 | P1 | Save schema compatibility rules and migration fixture | Ready | T06, T09, T29, T59b | Save migration fixture run |
| T30 | Later | P2 | P2 | Save import and export | Ready | T29 | Import/export compatibility check |
| T31 | Later | P3 | P2 | Optional save encryption | Ready | T29 | Encryption or decryption smoke test |
| T32 | Later | P3 | P1 | Accessibility pass | Ready | T11, T34 | Accessibility checklist |
| T33 | Later | P3 | P2 | Theme and typography pass | Ready | T11 | Manual readability review |
| T36b | Later | P3 | P1 | Packaged AI prerequisite detection and repair flow | Ready | T12c, T35a | Packaged prerequisite smoke test |
| T36 | Later | P3 | P1 | Windows playtest build | Ready | T35a, T12c, T29, T36b | Build or install verification |
| T38 | Later | P3 | P1 | Installer packaging | Ready | T36 | Installer smoke test |
| T19 | Later | P4 | P1 | Quest schema and validation | Ready | T16 | Schema validation check |
| T20 | Later | P4 | P1 | Quest state transitions | Ready | T19, T58b | `npm test` |
| T21 | Later | P4 | P2 | Quest editor UI | Ready | T19 | Manual editor smoke test |
| T22 | Later | P4 | P2 | World state inspector UI | Ready | T20 | Manual diff view check |
| T23 | Later | P4 | P2 | Quest import and export | Ready | T19 | Import or export smoke test |
| T24 | Later | P4 | P1 | Core pipeline tests | Ready | T07, T08, T10, T59b | CI-equivalent test run |
| T25 | Later | P4 | P1 | Fuzz tests for validator | Ready | T10 | Fuzz test run |
| T26 | Later | P4 | P1 | Telemetry for tokens, latency, and cost | Ready | T07, T63c | Manual telemetry verification |
| T45 | Later | P4 | P1 | Budget fixture enforcement and breach reporting | Ready | T09, T24, T26, T43, T59b | Fixture budget suite run |
| T27 | Later | P4 | P2 | Audit log export | Ready | T09 | Export smoke test |
| T28 | Later | P4 | P2 | Model failure fallback | Ready | T07, T10 | Timeout or failure simulation |
| T36a | Later | P5 | P2 | macOS feasibility check | Ready | T35 | Feasibility note |
| T37 | Later | P5 | P2 | Auto-update channel | Ready | T38 | Update flow verification |
| T39 | Later | P5 | P3 | Linux build | Ready | T35 | Build verification if supported |
| T40 | Later | P5 | P1 | Release checklist | Ready | T36, T38 | Checklist walkthrough |

## Active Task Protocol

When an agent starts work, it must:

1. Pick one `Ready` task.
2. Change its status in the queue table to `In Progress`.
3. Add or update the detailed task card for that task.
4. Keep scope inside the `Files to Touch` list unless the dependency chain forces a change.
5. Finish by moving the task to `Review` or `Done`, with validation and handoff notes recorded.

When a human assigns a task directly, the assigned task overrides queue order.

When a human assigns a future-looking or cross-cutting issue directly, the agent should:

1. Ground it against the current roadmap, backlog, and open decisions.
2. Create or update the parent issue item first when the work is larger than one small standalone task.
3. Add or update explicit child tasks before implementation or handoff.
4. Sync the other planning docs that materially change in the same session.

## Detailed Task Cards

Closed task cards archived from the pre-`T05` slice live in [BACKLOG_ARCHIVE.md](/g:/text-game/BACKLOG_ARCHIVE.md).

### T56 - Future Issue Intake Workflow

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P2
- Owner Role: Tech lead
- Goal: Codify one repeatable workflow for turning future user-reported issues into synchronized planning docs instead of ad hoc notes.
- Scope:
  - add a documented parent-plus-child backlog pattern for non-trivial assigned issues
  - define when roadmap, requirements, architecture, and engineering standards must be synchronized with backlog updates
  - keep the workflow issue-focused, one issue at a time, and explicit about validation
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
- Do Not Touch:
  - src/
  - public/
  - scripts/
- Dependencies:
  - None
- Child Tasks:
  - T56a
  - T56b
- Validation:
  - manual planning-doc consistency review
- Definition of Done:
  - the repo documents how future user-assigned issues become parent items plus child tasks
  - the planning docs describe when cross-doc synchronization is required
  - the workflow leaves future agents with one canonical intake pattern
- Handoff Notes:
  - completed on 2026-03-08 to establish the default issue-intake workflow before more future-facing planning work is added
  - use `T56` as the pattern reference for later issue capture, but continue using the next available task ids for new parent items
  - future issues should be documented one at a time and should end with a summary of the parent item, child tasks, synced docs, and blockers or open decisions

### T56a - Backlog Parent And Child Task Pattern

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P2
- Owner Role: Tech lead
- Goal: Teach the backlog to capture user-assigned issues as grounded parent items with explicit child tasks instead of free-form notes.
- Scope:
  - add the user-assigned issue intake workflow to backlog instructions
  - add a parent issue template alongside the existing task-card template
  - update the active-task protocol so direct issue assignment still produces structured backlog work
- Files to Touch:
  - BACKLOG.md
- Do Not Touch:
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
- Dependencies:
  - T56
- Validation:
  - manual backlog structure review
- Definition of Done:
  - backlog instructions describe the grounding pass and parent-plus-child default
  - future agents can add either a standalone task or a parent issue card without inventing a new format
  - direct user issue assignment no longer depends on unstated backlog conventions
- Handoff Notes:
  - completed on 2026-03-08 by adding an intake workflow section, a parent issue template, and direct-assignment protocol text
  - the default split is still intentionally minimal: use one parent plus the smallest useful child-task set, not a large planning tree

### T56b - Cross-Doc Planning Sync Policy

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P2
- Owner Role: Tech lead
- Goal: Keep future issue capture synchronized across roadmap, requirements, architecture, and engineering standards instead of treating backlog edits as sufficient by default.
- Scope:
  - document when roadmap sequencing or risk notes must move with backlog changes
  - document when requirements and architecture should update for future issue intake
  - document the engineering-standard expectation that each child task carries named validation and cross-doc sync
- Files to Touch:
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
- Do Not Touch:
  - BACKLOG.md
  - src/
  - public/
- Dependencies:
  - T56
- Validation:
  - manual roadmap, requirements, architecture, and standards consistency review
- Definition of Done:
  - each planning doc states its role in future issue capture
  - the docs agree on when to synchronize and when a doc can remain unchanged
  - later issue intake work has a documented cross-doc policy to follow
- Handoff Notes:
  - completed on 2026-03-08 by adding minimal intake and sync guidance to the strategic, requirements, architecture, and standards docs
  - keep roadmap strategic, requirements user-facing, architecture boundary-focused, and engineering standards operational when applying this workflow to later issues

### T57 - Authority-Safe Turn Truth Boundary

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Gameplay systems lead
- Goal: Prevent authority drift by keeping the model limited to narration and consequence proposals while the server remains the only source of committed world truth.
- Scope:
  - lock a proposal-only model contract before more turn-pipeline, replay, and save work lands
  - require server-side adjudication for state, quest, director, and memory consequences before they become authoritative
  - ensure player-facing narrative is aligned to committed state rather than raw model prose
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/state/
  - src/rules/
  - src/server/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
- Child Tasks:
  - T57a
  - T57b
  - T57c
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the model no longer acts as an implicit game engine or truth source
  - committed state, replay data, and player-facing narrative follow one authority boundary
  - Phase 1 turn, validator, and replay work can continue without hardening drift later as an afterthought
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying authority drift as the main architectural risk in the turn pipeline
  - current code and docs still let the model emit `state_updates`, `director_updates`, and `memory_updates` in a way that reads like truth instead of proposals
  - the target contract is explicit: the model may propose consequences, but the server decides what becomes true, and the final narrative returned to the player must be downstream of committed state
  - use this parent item to gate `T07`, `T08`, `T09`, and `T10` so replay and save work do not harden the wrong truth boundary

### T57a - Proposal-Only Turn Contract And Prompt Boundary

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Reframe the turn-generation contract so the model returns proposals and narrative material, not authoritative world updates.
- Scope:
  - rewrite the prompt and turn schema language so state, director, quest, and memory consequences are explicitly proposals
  - tighten validators and HTTP-contract tests around the proposal-only boundary before implementation work lands
  - document any transitional field names that still contain `*_updates` until the external contract is safely renamed
  - preserve the versioned `/api/turn` envelope while clarifying that the authoritative player snapshot remains the source of truth
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/core/types.ts
  - src/rules/
  - src/server/http-contract.ts
  - src/server/http-contract.test.ts
  - src/state/turn.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T61a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/http-contract.test.ts src/state/turn.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - the turn contract clearly distinguishes model proposals from committed truth
  - prompt and validator expectations no longer describe the model as directly mutating world state
  - the versioned HTTP contract remains explicit about where authoritative truth lives
  - downstream turn-pipeline tasks can build on the authority-safe contract without guessing intent
- Handoff Notes:
  - this task should land before `T07`, `T08`, and `T10` expand the live turn path
  - prefer explicit names such as proposals, accepted consequences, or committed state over overloaded `update` wording when the contract changes
  - if the external payload cannot be safely renamed in one slice, document the transitional naming and lock the semantics first

### T57b - Server Consequence Adjudication And Commit Policy

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Gameplay systems lead
- Goal: Insert a server-owned adjudication step that decides which proposed consequences become truth before any authoritative mutation or persistence occurs.
- Scope:
  - add an adjudication layer between validated model proposals and DB mutation
  - make quest progression, beat progression, director progress, state mutation, and memory admission server-decided instead of model-decided
  - reject, trim, or normalize overreaching proposals before they reach authoritative state, replay data, or persisted memory
  - keep the end goal immutable and preserve server-side director authority during the adjudication step
- Files to Touch:
  - BACKLOG.md
  - src/state/
  - src/story/
  - src/rules/
  - src/server/
  - src/core/types.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T57a
  - T07
  - T08
  - T10
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - the server can accept or reject proposed consequences independently of model wording
  - authoritative state mutation, director progress, and memory persistence happen only from accepted consequences
  - overreaching proposals fail safely instead of slipping through as implied truth
  - the turn pipeline remains replayable and deterministic after adjudication is introduced
- Handoff Notes:
  - use `T07`, `T08`, and `T10` as supporting implementation slices; this task is the authority-boundary integration point that ties them together
  - do not let the adjudication module become a new mixed bucket; separate proposal validation from authoritative mutation
  - add focused tests for impossible or unearned progress, not only happy-path acceptance

### T57c - Post-Commit Narration And Authority-Drift Fixtures

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: AI systems lead
- Goal: Ensure the turn result shown to the player is reconciled after commit so rejected proposals cannot leak into narrative, options, replay, or persisted facts.
- Scope:
  - derive, rewrite, or reconcile player-facing narrative and options from committed state plus accepted consequences
  - add deterministic authority-drift fixtures where the model invents facts, implies unearned quest progress, or smuggles world changes through prose
  - persist replay or event-log data in a way that distinguishes raw proposals from accepted turn truth when both need to be retained for debugging
  - keep any debug payloads clear about proposed versus accepted outcomes without exposing raw model drift as player-facing truth
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/server/
  - src/ai/
  - src/ui/
  - scripts/
- Do Not Touch:
  - data/spec/
  - packaging/
- Dependencies:
  - T57b
  - T09
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - replay fixture execution
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - player-facing narrative does not claim consequences the server rejected
  - replay and event-log fixtures prove rejected proposals stay out of committed story truth
  - drift cases are repeatable enough that later prompt or schema tuning cannot silently reintroduce the bug class
  - debug and player-facing surfaces remain distinct about what was proposed versus what became true
- Handoff Notes:
  - this task closes the highest-risk gap left after adjudication: prose drift that still tells the wrong story even when state stayed correct
  - prefer deterministic fixtures over ad hoc manual examples so later agents can rerun the same drift cases
  - keep the player surface simple; if proposed-versus-accepted details need to be exposed, confine them to debug tooling rather than normal gameplay text

### T58 - Player Agency And Pacing Boundary

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Gameplay systems lead
- Goal: Preserve freeform player agency without letting authored beats become hidden railway logic by separating intent interpretation, simulation resolution, and pacing.
- Scope:
  - document and enforce a three-layer turn model for intent, simulation, and pacing
  - keep beat controls useful for story framing without letting them decide core plausibility on their own
  - align later director and quest work around accepted outcomes rather than beat-first gating
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/state/
  - src/story/
  - src/rules/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T57
- Child Tasks:
  - T58a
  - T58b
  - T58c
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the repo has one clear contract for player agency, simulation plausibility, and pacing authority
  - later director and quest tasks no longer need to guess whether beats decide plausibility or only framing
  - freeform play and authored pacing can evolve without collapsing into arbitrary refusal or shapeless yes-to-everything behavior
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying the tension between player freedom and authored pacing as the second major architectural risk
  - current prompt and director logic still lean toward beat-first steering, including instructions that tell the model to add beat unlock flags directly
  - this issue complements `T57`: `T57` protects truth authority, while `T58` protects agency and pacing boundaries
  - treat the director as a framing layer over accepted outcomes, not as the primary judge of whether the player's attempt was allowed

### T58a - Intent, Simulation, And Pacing Contract Split

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Lock the contract that separates player intent interpretation, simulation resolution, and pacing before more turn orchestration and reducer work lands.
- Scope:
  - rewrite prompt, turn-payload language, and validator expectations so beat guidance does not double as plausibility logic
  - document the handoff between interpreted player intent, accepted simulation outcome, and director framing input
  - add focused tests for off-beat but plausible actions and for implausible actions that fail for simulation reasons instead of pacing reasons
  - preserve the authority-safe proposal boundary from `T57` while clarifying which layer owns each decision
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/core/types.ts
  - src/rules/
  - src/state/turn.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T57a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - the contract distinguishes intent parsing, plausibility resolution, and story framing
  - prompt and validator language no longer imply that current beat or unlock flags directly decide attempt plausibility
  - deterministic tests cover at least one off-path success and one simulation-led failure
  - later director-spec work has a stable gameplay boundary to build on
- Handoff Notes:
  - this is the contract-setting slice for the issue; keep it small and explicit
  - if current field names cannot be renamed safely yet, lock semantics first and record transitional naming clearly
  - coordinate with `T57a` so proposal-only wording and three-layer ownership land together instead of diverging

### T58b - Simulation-First Consequence Resolution

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: Gameplay systems lead
- Goal: Make simulation resolution the server-owned step that decides plausibility and accepted consequences before director pacing logic runs.
- Scope:
  - add or extract a simulation-resolution layer between interpreted intent and director framing
  - make accepted outcomes, failures, and side effects depend on world state and server rules rather than current beat order alone
  - ensure beat progression consumes accepted outcomes instead of directly deciding whether an action was plausible
  - keep the implementation compatible with the authority-safe adjudication work from `T57b`
- Files to Touch:
  - BACKLOG.md
  - src/state/
  - src/story/
  - src/rules/
  - src/core/types.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T58a
  - T57b
  - T07
  - T08
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - simulation decides plausibility and accepted consequences before pacing is applied
  - off-beat but sensible actions can succeed without being flattened into arbitrary refusal
  - implausible actions fail or partially succeed for simulation reasons that can be explained consistently
  - later quest and director work can consume accepted outcomes without owning simulation policy
- Handoff Notes:
  - do not collapse this into a beat helper; the point is to prevent `required_flags` and `unlock_flags` from becoming hidden railway points
  - keep simulation resolution deterministic enough for replay and fixture work
  - coordinate with `T20` so future quest transitions follow the same accepted-outcome contract

### T58c - Director Framing And Beat Pacing Policy

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Reframe director and beat logic so it capitalizes on accepted outcomes and paces the story without serving as the main plausibility gate.
- Scope:
  - revise director-spec semantics for `required_flags`, `unlock_flags`, and `max_beats_per_turn` around framing and pacing instead of direct plausibility control
  - update director enforcement and fixtures so beats can react to off-path successes, failures, or detours without collapsing into shapeless narration
  - add tests or fixtures where pacing stays coherent even when the player acts outside the current expected beat
  - keep authored end-goal pressure visible without making every successful action feel preordained by beat order
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - src/story/
  - src/rules/
  - scripts/
  - data/spec/
- Do Not Touch:
  - public/
  - packaging/
- Dependencies:
  - T16
  - T58b
- Validation:
  - schema validation check
  - integration test
  - replay fixture execution
- Definition of Done:
  - director and beat rules frame accepted outcomes instead of acting as hidden refusal logic
  - authored pacing remains legible even when players take plausible off-path actions
  - fixtures prove that off-path play does not either break pacing or get railroaded back by arbitrary beat enforcement
  - later content-authoring work can describe pacing intent without encoding simulation policy into beat flags
- Handoff Notes:
  - this task should refine director semantics, not re-open truth authority or simulation ownership already locked by `T57` and `T58b`
  - keep beat controls explainable to content authors; if a beat rule starts reading like world physics, it belongs in simulation instead
  - use fixtures that demonstrate both drift toward shapeless yes-to-everything play and drift toward hidden railroading, then keep the director between those extremes

### T59 - Semantic Event Log And Replay Canon

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Define replay around committed semantic outcomes so final state can be reconstructed deterministically without rerunning model generation from transcript text.
- Scope:
  - lock the canonical event-record contract before `T09` hardens the storage shape
  - distinguish replay-critical semantic fields from raw transcript or debug artifacts
  - align replay, save migration, and fixture work around committed transitions instead of exact prose preservation
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/
  - src/state/
  - src/server/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T57
- Child Tasks:
  - T59a
  - T59b
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the repo defines what an event is in replay terms, not only in transcript terms
  - deterministic replay no longer depends on rerunning a model or preserving exact narrator prose
  - later save, replay, and fixture work share one canonical event-record definition
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying replay drift risk from transcript-only event storage
  - current storage still uses `events(role, content)` which is suitable for short history and UI transcript rendering but not yet sufficient as the canonical replay record
  - this issue complements `T57`: `T57` defines what becomes true, while `T59` defines how accepted truth is durably recorded for replay
  - raw prompt, response, and prose retention may still be useful for debugging, but those fields must be explicitly non-canonical for replay

### T59a - Canonical Event Schema And Replay Contract

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Define the canonical event schema so replay-critical semantics are explicit before persistence and fixture work land.
- Scope:
  - define the minimum canonical event fields needed to reconstruct authoritative state, including player attempt, accepted or rejected outcome, committed transitions, and ruleset or schema version markers
  - distinguish canonical replay fields from optional transcript, prompt, or presentation fields
  - add or tighten tests around the event and response contract before storage work changes the DB shape
  - keep the contract aligned with the proposal-only and authority-safe work in `T57`
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/rules/
  - src/server/http-contract.ts
  - src/server/http-contract.test.ts
  - src/state/turn.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T57a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/server/http-contract.test.ts src/rules/validator.test.ts`
- Definition of Done:
  - replay-critical event fields are explicitly named and versioned
  - canonical semantic fields are separated from transcript-only fields in docs and types
  - later event persistence work can implement one clear contract instead of inferring it from prose-oriented tables
  - save and replay tasks can point at a stable event definition
- Handoff Notes:
  - decide the canonical event meaning now even if the DB migration lands in a later child task
  - prefer names that reflect committed outcome semantics rather than chat transcript wording
  - if transcript preservation remains useful, document it as supplementary so replay consumers do not treat it as canonical input

### T59b - Committed Outcome Event Persistence And Replay Fixture

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Persist replayable committed outcome events and prove final-state reconstruction from them with a deterministic fixture.
- Scope:
  - migrate event storage from transcript-only rows toward canonical semantic event records while preserving any needed transcript surfaces separately
  - record committed transitions, accepted or rejected outcomes, and version markers per turn in the authoritative event log
  - add one deterministic replay fixture that rebuilds final state from canonical event records without rerunning model generation
  - keep short-history or UI transcript needs working without making them the canonical replay source
- Files to Touch:
  - BACKLOG.md
  - README.md
  - ENGINEERING_STANDARDS.md
  - src/core/db.ts
  - src/core/types.ts
  - src/state/
  - src/server/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T59a
  - T57b
  - T09
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - replay fixture execution
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - the authoritative event log stores committed semantic outcomes rather than only transcript text
  - at least one replay fixture reconstructs the same final state without a live model call
  - transcript or prose retention remains explicitly supplementary to replay semantics
  - later save migration and fixture-budget work can build on the canonical event log without redefining it
- Handoff Notes:
  - this task is where the repo should stop treating `events(role, content)` as enough for deterministic replay
  - if a compatibility bridge is needed for older transcript-only rows, document it clearly rather than implying those rows are already replay-safe
  - keep replay fixture output centered on final authoritative state and committed transitions, not on exact text matching

### T60 - Memory Classes And Authority Policy

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: AI systems lead
- Goal: Introduce explicit memory classes and authority rules so memory supports narration and continuity without becoming an undifferentiated second truth system.
- Scope:
  - define memory classes and their admission policy before Phase 2 memory work deepens the current single-bucket design
  - separate authority-relevant recall from flavor-oriented recollection in retrieval and persistence planning
  - align future embeddings, retrieval, and summarization work around class-aware memory behavior
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/
  - src/state/
  - src/rules/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T57
  - T59
- Child Tasks:
  - T60a
  - T60b
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - memory classes are explicit in the repo contract instead of implied by one generic fact bucket
  - authority-sensitive and flavor-oriented memories have distinct admission and retrieval expectations
  - Phase 2 memory tasks can proceed without re-litigating whether memory defines truth
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying the need for memory classes from the start
  - current storage still inserts all memories as `kind = "fact"` and current retrieval treats all persisted memories as one pool
  - this issue complements `T57` and `T59`: truth is still decided by committed state and semantic events, while memory remains a classed support system for continuity and narration
  - use explicit classes such as hard canon facts, quest progression facts, relationship facts, world discoveries, and soft flavor recollections unless later product changes require renaming

### T60a - Memory Class Contract And Admission Rules

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Define the memory classes, their authority level, and their admission rules before embeddings and retrieval behavior are expanded.
- Scope:
  - add explicit memory-class types and validation rules for hard canon facts, quest progression facts, relationship facts, world discoveries, and soft flavor recollections
  - define which classes may be derived from server-accepted outcomes, which may be summarizer- or narrator-facing only, and which must stay non-authoritative
  - add tests that prove flavor memory cannot be treated as authoritative truth
  - keep the contract aligned with replay canon and authority-boundary work so memory classes do not bypass either policy
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/rules/
  - src/state/turn.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T57a
  - T59a
  - T61a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - memory classes and authority levels are explicit in types and validator expectations
  - admission rules distinguish server-derived canon from narration-only flavor
  - at least one focused test proves flavor memory does not become authoritative
  - later embeddings and retrieval tasks have a stable class contract to build on
- Handoff Notes:
  - land the contract before storage or retrieval expansion so later tasks do not bake in the current single `fact` bucket
  - if existing field names cannot be upgraded cleanly in one slice, document transitional semantics but keep the class boundary explicit
  - make authority level obvious enough that later agents do not need to infer it from task notes

### T60b - Class-Aware Retrieval And Summarization Policy

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Make retrieval and summarization class-aware so the memory system pulls the right facts for each turn without flattening canon and flavor into one pool.
- Scope:
  - define retrieval defaults and ranking policy by memory class, including which classes are always eligible, situational, or narration-only
  - keep summaries and embedding-backed retrieval aligned with class authority so flavor recall supports narration without crowding out canon or quest facts
  - add fixtures where the right memory classes are retrieved for a turn and flavor-only recall does not affect authority-sensitive decisions
  - preserve budget awareness so class-aware retrieval does not silently grow token or storage costs beyond the documented baseline
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T60a
  - T13
  - T62b
  - T63a
- Validation:
  - retrieval fixture check
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - retrieval policy is class-aware instead of treating every memory as interchangeable
  - authority-relevant memories remain retrievable when needed without letting flavor dominate the turn context
  - summaries and retrieval fixtures prove that memory supports narration and continuity without becoming truth
  - later Phase 2 memory work can tune ranking and token budgets on top of the class policy instead of reinventing it
- Handoff Notes:
  - keep this focused on retrieval and summarization policy, not on reopening admission or replay canon already defined elsewhere
  - use fixtures that show both failure modes: flavor crowding out canon and over-filtering that kills continuity
  - coordinate with budget work so any class-aware retrieval expansion is measurable rather than hand-waved
  - incorporate NPC-tier and partitioned-memory policy from `T62` so retrieval does not flatten transcript, NPC memory, world memory, player journal memory, and scene context into one ranking pool
  - align this policy with `T63a` so live context stays a small budgeted slice instead of becoming a second full-history prompt

### T61 - Compact Turn Schema Boundary

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: AI systems lead
- Goal: Keep the model turn schema compact, validator-friendly, and subordinate to server gameplay rules so it does not become the game design language.
- Scope:
  - define the minimum model-facing turn contract needed for narration and proposals instead of encoding scene ontology or gameplay policy into schema fields
  - align future turn, validator, memory, and replay work around a compact contract centered on narrative, candidate actions, structured intents, and proposed deltas
  - keep engine rules, beat logic, quest semantics, and authority decisions in server-owned modules or content specs rather than in model schema structure
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/core/
  - src/rules/
  - src/state/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T57
- Child Tasks:
  - T61a
  - T61b
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - the repo contract treats model schema as a compact transport boundary rather than as a scene model or rules engine
  - downstream turn, validator, and memory tasks can evolve server-owned logic without repeatedly expanding the model schema
  - schema changes have explicit guardrails against turning prompt structure into hidden gameplay design
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying schema design as a major architectural risk
  - current code still centers the turn contract on `state_updates`, `director_updates`, and `memory_updates`, which makes the model output read more like an engine surface than a compact proposal payload
  - this issue complements `T57`, `T58`, `T59`, and `T60`: authority, pacing, replay, and memory all depend on keeping the model contract narrow enough that server-owned rules stay in control
  - use this parent item to gate `T57a`, `T10`, `T52`, and `T60a` so validator and memory work do not harden schema sprawl as the default pattern

### T61a - Compact Proposal Schema And Validator Contract

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Backend lead
- Goal: Define a compact turn-output proposal contract that is easy to validate and evolve without encoding scene logic or design semantics into the schema itself.
- Scope:
  - narrow the model-facing contract around narrative, candidate actions, structured intents, and proposed deltas rather than large scene-shaped objects or hidden gameplay logic
  - document any transitional field names that remain in use while the semantics are tightened toward proposal-only behavior
  - ensure validators reject over-modeled payloads or field creep that attempts to move simulation, beat logic, or world modeling into the schema
  - preserve the versioned `/api/turn` envelope and authoritative player snapshot while making the compact-schema boundary explicit
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/core/types.ts
  - src/rules/
  - src/server/http-contract.ts
  - src/server/http-contract.test.ts
  - src/state/turn.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T06
  - T57
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/http-contract.test.ts src/state/turn.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - the turn-output proposal contract is explicitly compact and transport-oriented
  - validator expectations reject schema growth that tries to encode scene ontology or gameplay policy
  - transitional naming, if any, is documented without leaving authority or compactness ambiguous
  - `T57a`, `T10`, and `T60a` can build on a stable schema boundary instead of reopening contract shape debates
- Handoff Notes:
  - prefer names such as `candidate_actions`, `structured_intents`, and `proposed_deltas` over field sets that imply the model owns the simulation
  - if legacy field names must survive temporarily for compatibility, lock the compact semantics first and document the migration path clearly
  - exact prose and scene nuance should stay in narrative or server-side specs, not in a growing response schema

### T61b - Schema Evolution Guardrails And Fixture Policy

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Prevent future prompt or schema changes from turning the model contract into the hidden design language of the game.
- Scope:
  - add or tighten schema-change rules so new fields need a clear transport justification instead of being used to represent world logic, pacing policy, or content design
  - extend tests, fixtures, or the local AI workflow harness so contract changes fail loudly when they introduce scene-ontology bloat or mixed authority semantics
  - keep translation from compact model proposals to richer server domain concepts inside dedicated validators, adjudicators, or reducers rather than inside the model schema
  - align future validator-module split work with the compact-schema boundary so ownership stays clear as validation code is extracted
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - src/ai/
  - src/rules/
  - src/state/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T61a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/state/turn.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - schema changes have explicit review criteria that keep the contract compact
  - at least one deterministic fixture or harness path proves schema bloat or mixed-authority field creep is rejected
  - validator and turn-pipeline work can extend server-owned semantics without re-expanding the model contract
  - future agents can tell the difference between transport evolution and gameplay-design evolution from the docs and tests
- Handoff Notes:
  - use this task to keep later prompt and validator work honest after `T61a` lands; otherwise the compact boundary will drift back into a smart-scene schema over time
  - prefer adding richer server-side interpretation or adjudication modules over adding more model fields whenever the change is really about game rules
  - keep fixture coverage small and deterministic so this policy remains runnable during normal contract work

### T62 - NPC Memory Significance Pipeline

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Make NPC continuity come from significance-scored structured memory rather than from replaying or retrieving raw chat history.
- Scope:
  - define a four-layer NPC memory pipeline that separates replay or debug transcript data, structured encounter facts, thresholded long-lived memory, and short-lived scene context
  - add server-owned significance and tiering rules so only meaningful NPC interactions become durable memory
  - keep NPC memory, world memory, and player journal memory separate so canon stays deterministic and retrieval stays sparse
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - src/core/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T59
  - T60
- Child Tasks:
  - T62a
  - T62b
  - T62c
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - NPC memory is planned as a significance pipeline instead of a raw transcript-retention feature
  - durable NPC recall is tiered, sparse, and based on structured canon facts
  - Phase 2 memory, retrieval, and summarization work can proceed without collapsing transcript, scene context, and long-lived memory into one bucket
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying NPC memory as a significance pipeline rather than a chat-log problem
  - current repo planning covers memory classes and replay canon, but it does not yet define post-dialogue significance scoring, NPC importance tiers, or separation between NPC memory, world memory, player journal memory, and current scene context
  - this issue complements `T59` and `T60`: transcript data remains for replay and debugging, while committed structured facts drive durable NPC continuity
  - use this parent item to gate `T13`, `T14`, `T15`, and `T60b` so Phase 2 memory work does not harden raw-log retention as the default design

### T62a - Encounter Fact Schema And Significance Evaluator

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: Backend lead
- Goal: Define the post-scene encounter record and server-side significance evaluator that decides whether an NPC interaction deserves long-lived memory.
- Scope:
  - define the four layers explicitly: transcript or event log, structured encounter facts, long-lived memory records, and short-lived scene context
  - add a structured encounter-fact contract for fields such as NPC id, display name, role or location, topics, promises, clues, mood, relationship-relevant changes, and last-seen beat
  - define a server-side significance score that increases for stable identity, repeated meaningful exchange, relationship change, clues, promises, quest hooks, unique role, and later voluntary return by the player
  - persist durable NPC memory only when the committed encounter facts cross the configured threshold
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/rules/
  - src/state/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T59a
  - T60a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - NPC encounter facts are explicit and server-owned instead of being inferred later from arbitrary chat logs
  - significance scoring criteria and thresholds are documented and testable
  - transcript retention remains replay or debug data rather than becoming the durable memory store
  - later persistence and retrieval tasks can consume structured encounter facts without redesigning the contract
- Handoff Notes:
  - names should be cheap to persist even when the full encounter does not cross the long-lived-memory threshold
  - later player re-engagement should be able to raise cumulative significance for earlier encounters without rewriting replay canon
  - keep canon facts structured and committed; dialogue prose is source material for derivation, not the durable record

### T62b - NPC Importance Tiers And Long-Lived Memory Admission

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Make durable NPC memory sparse and believable by admitting richer recall only for increasingly important characters and repeated meaningful engagement.
- Scope:
  - define NPC importance tiers and promotion rules:
    - tier 0 ambient
    - tier 1 known
    - tier 2 important
    - tier 3 anchor cast
  - specify what each tier may persist, retrieve, summarize, and age out, including cheap name persistence, one-line summaries, relationship state, open threads, remembered topics, and richer history for anchor-cast NPCs
  - promote tiers using cumulative significance plus later voluntary return or re-engagement by the player
  - keep long-lived NPC canon stored as structured facts and summaries, not as raw dialogue turns
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - src/core/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T62a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - NPC memory admission is tiered instead of storing every conversation equally
  - promotion and retrieval priority are based on cumulative significance and player re-engagement
  - names and stable identity remain cheap to preserve while rich history stays reserved for important NPCs
  - embeddings and retrieval work have a stable persistence policy to build on
- Handoff Notes:
  - keep tier policy sparse by default; the point is believable recognition, not exhaustive biography storage
  - if a tier can be described only by prose volume instead of by stored fact types and retrieval priority, the design is too vague
  - tier promotion should not let soft flavor recollections overwrite canon facts already governed by `T60`

### T62c - Partitioned Retrieval For NPC, World, Journal, And Scene Context

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Keep retrieval cheap and relevant by separating durable NPC memory from world memory, player journal memory, and the current scene context.
- Scope:
  - define separate retrieval and summarization policy for NPC memory, world memory, player journal memory, and short-lived scene context
  - ensure current-conversation context is treated as ephemeral scene state rather than as durable NPC canon
  - add fixtures where an NPC is recognized from committed facts and tiered memory without replaying raw dialogue, and where irrelevant memory pools stay excluded
  - keep later player behavior able to retroactively increase the retrieval priority of earlier important encounters without pulling the whole transcript forward
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T62b
  - T60b
  - T13
- Validation:
  - retrieval fixture check
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - retrieval does not treat transcript, NPC memory, world facts, player journal, and live scene context as one undifferentiated source
  - at least one fixture proves believable NPC recognition comes from committed structured memory instead of raw-log replay
  - summarization and ranking stay sparse enough to meet the documented budget posture
  - later Phase 2 retrieval and summarizer work can extend one partitioned policy instead of inventing separate ad hoc pools
- Handoff Notes:
  - keep world memory, NPC memory, and player journal memory separate even if they share lower-level storage primitives
  - short-lived scene context should be aggressively trimmed and safe to discard after the conversation ends
  - use retrieval fixtures that cover both failure modes: forgetting a meaningful returning NPC and overloading a scene with irrelevant prior chat

### T63 - Memory Storage Hierarchy And Context-Budget Policy

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Make memory a measured storage hierarchy with a minimal live context window, durable structured storage, and explicit tooling for context assembly drift.
- Scope:
  - define what belongs in live context each turn versus what must stay in durable storage
  - introduce per-bucket retrieval budgets, compression passes, and versioned summaries so memory stays sparse and recomputable
  - require token accounting, prompt-diff inspection, retrieval traces, and replay-oriented checks so context quality is measurable
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - src/core/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T59
  - T60
  - T61
  - T62
- Child Tasks:
  - T63a
  - T63b
  - T63c
- Validation:
  - manual planning-doc consistency review
  - child task validation listed on each child card
- Definition of Done:
  - memory is planned as hot versus durable storage instead of as one large prompt payload
  - live context, compression, and measurement rules are explicit enough that retrieval and summary work cannot drift by accident
  - later budget, telemetry, and replay tasks can measure context assembly against one stable policy
- Handoff Notes:
  - user assigned this issue on 2026-03-08 after identifying memory as a storage hierarchy rather than a monolithic prompt problem
  - current planning covers classed memory, NPC significance, and budget work separately, but it does not yet define the hot-context contract, summary versioning, compression cadence, or context-entry tooling as one system
  - this issue complements `T57`, `T59`, `T60`, and `T62`: server-owned canon still decides truth, while memory hierarchy decides what low-cost context the model receives
  - use this parent item to gate `T60b`, `T15`, `T43`, and `T26` so retrieval, summarization, budget config, and telemetry all align to one measured context policy

### T63a - Live Context Hierarchy And Retrieval Budget Contract

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: Backend lead
- Goal: Define the minimal live context window and fixed retrieval-budget slices so the model only receives what it needs to narrate and propose.
- Scope:
  - limit default live context to the current scene, current goal, nearby world state, and a small set of high-priority recalled facts
  - define durable storage buckets for hard canon facts, quest or progression facts, relationship summaries, and cold history logs
  - add fixed per-turn retrieval or token budgets by bucket, with ranking based on relevance, recency, narrative importance, and strong boosts for voluntary player re-engagement
  - keep raw history or transcript data excluded from live context unless an explicit retrieval rule says it is needed
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/rules/
  - src/state/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T60a
  - T61a
  - T62a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/state/turn.test.ts src/rules/validator.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - the default hot-context contract is explicit and budgeted by bucket
  - durable storage buckets are named clearly enough that later retrieval and summary code can target them directly
  - raw history is cold by default rather than an always-on part of the prompt
  - `T60b`, `T62c`, and `T43` can build on a stable context-budget boundary instead of inventing one ad hoc
- Handoff Notes:
  - do not let `recent events` become a disguised transcript dump; if a raw-history slice is needed, it must be named and budgeted explicitly
  - keep the model-facing context minimal enough that `T61` remains true in practice, not just at the output-schema layer
  - prefer config-driven bucket ceilings over prompt-only conventions so later tooling can inspect and enforce them

### T63b - Summary Compression And Versioned Memory Artifacts

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Compress old interactions into versioned summaries and structured facts so memory remains sparse, durable, and recomputable.
- Scope:
  - define post-scene compression passes that extract structured facts, generate compact summaries, and remove verbose dialogue from hot memory
  - define chapter- or beat-level merge passes that roll multiple summaries into higher-level recaps
  - version summary and recap formats so they can be recomputed later from canonical records when summarization logic changes
  - keep summary derivation server-owned and compatible with replay canon, structured encounter facts, and memory-tier rules
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - REQUIREMENTS.md
  - ARCHITECTURE.md
  - ENGINEERING_STANDARDS.md
  - src/state/
  - src/rules/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T63a
  - T59b
  - T62b
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - replay fixture execution
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - summary compression cadence is explicit at scene and chapter or beat boundaries
  - summary artifacts are versioned and recomputable from canonical data
  - verbose dialogue is no longer treated as hot memory by default once compressed
  - `T15` and later retrieval work can implement one stable summary lifecycle instead of inventing incompatible recap formats
- Handoff Notes:
  - cold history may remain for replay or debugging, but that does not make it eligible for hot prompt context
  - if a summary cannot be regenerated after the summarizer changes, the versioning policy is incomplete
  - prefer structured-fact extraction plus compact recaps over prose-only memory blobs

### T63c - Memory Context Observability And Replay Tooling

- Status: Ready
- Queue: Next
- Phase: P2
- Priority: P1
- Owner Role: Tech lead
- Goal: Make context quality measurable by exposing what entered the prompt, why it entered, and what it cost.
- Scope:
  - define token accounting and context-entry reporting per bucket instead of only one aggregate prompt total
  - add prompt-diff inspection and retrieval-trace requirements that show selected entries, excluded entries, scores, and reasons
  - require replay-oriented or fixture-based checks that prove context assembly stays minimal and explainable across changes
  - align later telemetry and budget-enforcement work around the same inspectable context-entry contract
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - ENGINEERING_STANDARDS.md
  - README.md
  - src/state/
  - src/rules/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
  - packaging/
- Dependencies:
  - T63a
  - T59b
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - replay fixture execution
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - context-entry accounting is inspectable without manually reading raw prompts
  - retrieval traces and prompt diffs explain why facts entered or stayed out of context
  - replay or fixture checks can catch context-assembly drift, not only final-state drift
  - `T26` and `T45` can implement on top of one stable observability contract
- Handoff Notes:
  - if tooling only reports total token count with no per-bucket attribution, it is not enough for this issue
  - keep debug surfaces separate from canonical replay data; they explain context decisions but do not become new truth sources
  - prefer deterministic trace output so budget and replay fixtures can diff it safely

### T02g - GPU Tier Matrix And Local Model Profiles

- Status: Done
- Queue: Next
- Phase: P0
- Priority: P1
- Owner Role: AI systems lead
- Goal: Define one conservative model-profile matrix for the optional local GPU path so setup can choose sane defaults by VRAM tier instead of by guesswork.
- Scope:
  - document the first supported VRAM tiers for local inference, including at minimum one low-VRAM tier and one high-VRAM tier
  - assign recommended chat and embedding model profiles for each supported tier behind the stable `game-chat` and `game-embedding` aliases
  - add a repo-owned mapping format that can later drive launcher and setup auto-selection
  - avoid relying only on GPU marketing names; use detected VRAM as the primary selection key with optional SKU aliases for convenience
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - setup_local_a.i.md
  - litellm.local-gpu.config.yaml
  - .env.example
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T02f
- Validation:
  - matrix review
  - manual local GPU profile sanity check
- Definition of Done:
  - the repo documents a first-pass GPU tier matrix for the optional local inference path
  - each supported tier has a conservative recommended model profile and fallback notes
  - the mapping is defined in a format that later tasks can consume programmatically
  - the docs explicitly warn when a profile is heuristic rather than fully verified
- Handoff Notes:
  - user requested on 2026-03-08 that the roadmap and backlog cover auto-setup for different GPU capabilities
  - do not hardcode incorrect SKU-to-VRAM assumptions into the matrix; treat VRAM as authoritative and model names as convenience labels only
  - examples should be expressed as tiers such as `8 GB`, `12 GB`, and `20 GB+` even when common cards are listed alongside them
  - authoritative matrix data now lives in `scripts/local-gpu-profile-matrix.json` so future launcher and setup work can read one repo-owned JSON contract without introducing YAML parsing into app code
  - `litellm.local-gpu.config.yaml` now pins `local-gpu-8gb` as the active default profile and leaves `local-gpu-12gb` plus `local-gpu-20gb-plus` as commented manual swap references for later T02h selection work
  - `local-gpu-8gb` is documented as `verified` for this task's matrix sanity check path; `local-gpu-12gb` and `local-gpu-20gb-plus` remain `heuristic` until they are exercised on matching hardware
  - validation on 2026-03-08 ran `powershell -ExecutionPolicy Bypass -File scripts/validate-local-gpu-profile-matrix.ps1` and a manual repo consistency review across `README.md`, `setup_local_a.i.md`, `.env.example`, `litellm.local-gpu.config.yaml`, `docker-compose.yml`, `ROADMAP.md`, and this task card
  - the matrix validator now checks the uncommented env-driven alias block in `litellm.local-gpu.config.yaml` plus the matching default `LITELLM_LOCAL_GPU_*` values in `docker-compose.yml`, so it no longer passes or fails based on commented manual-swap examples
  - no matching local GPU hardware runtime smoke was available in this session; that does not block `T02g` because the `12 GB` and `20 GB+` tiers are intentionally documented as `heuristic` until later hardware-specific follow-up work

### T02h - GPU-First Docker Launcher Default

- Status: Done
- Queue: Now
- Phase: P0
- Priority: P1
- Owner Role: Tech lead
- Goal: Make the Windows launcher and documented Docker startup path use the GPU-backed Ollama stack by default instead of keeping a hosted or CPU-first fallback path.
- Scope:
  - remove the hosted-versus-local-gpu launcher switch from `scripts/start-dev.ps1`
  - make the launcher always include the NVIDIA-enabled Docker overlay and fail early when host GPU prerequisites are missing
  - align runtime config defaults and setup docs around `local-gpu-small` as the default profile
  - keep manual larger-model experiment artifacts documented separately from the default launcher path
- Files to Touch:
  - BACKLOG.md
  - ROADMAP.md
  - README.md
  - REQUIREMENTS.md
  - TOOLS.md
  - .env.example
  - docker-compose.yml
  - docker-compose.gpu.yml
  - litellm.local-gpu.config.yaml
  - packaging/decision-memo.md
  - scripts/start-dev.ps1
  - scripts/lib/shared.ps1
  - setup_local_a.i.md
  - src/core/types.ts
  - src/core/config/
  - src/core/config.test.ts
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T02g
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/core/config.test.ts`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
- Definition of Done:
  - `scripts/start-dev.ps1` no longer exposes a hosted-versus-local-gpu switch
  - the launcher defaults to the GPU-backed Docker path and blocks when NVIDIA prerequisites are missing
  - config defaults and docs no longer describe `hosted-default` as the normal supported profile
  - launcher, README, and requirements describe the same GPU-first startup contract
- Handoff Notes:
  - user requested on 2026-03-08 that the launcher stop treating GPU support as an opt-in path and remove the old default split
  - keep manual larger-model tuning artifacts such as the VRAM matrix and `litellm.local-gpu.config.yaml` available for advanced use, but do not let the default launcher depend on them at startup
  - completed on 2026-03-08 by removing the `-AiStack` launcher switch, forcing `scripts/start-dev.ps1` onto the GPU-backed Docker LiteLLM plus Ollama path, and making missing `nvidia-smi` or Docker `nvidia` runtime support a launcher blocker instead of a warning
  - `docker-compose.gpu.yml` now only contributes the NVIDIA device reservation; the default launcher keeps the normal `litellm.config.yaml` route instead of swapping LiteLLM configs at startup
  - runtime and script defaults now use `local-gpu-small` as the default `AI_PROFILE`; `hosted-default` was removed from the supported runtime profile list and from current docs
  - validation on 2026-03-08 ran `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/core/config.test.ts src/server/runtime-preflight.test.ts`, `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`, and `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - launcher smoke on 2026-03-08 confirmed `docker inspect --format "{{json .HostConfig.DeviceRequests}}" text-game-ollama-1` returned an NVIDIA device request and `docker logs text-game-ollama-1` reported CUDA on `NVIDIA GeForce RTX 5060`

### T05 - Error Boundary And Global Handler

- Status: Done
- Queue: Next
- Phase: P0
- Priority: P2
- Owner Role: Tech lead
- Goal: Keep unexpected server and browser failures visible, logged, and recoverable enough that players do not get a silent broken session.
- Scope:
  - add a process-level server handler for uncaught exceptions and unhandled promise rejections
  - shut the HTTP server down in a controlled way after a fatal server error and log the failure context safely
  - add a browser fatal-error boundary that surfaces unexpected client-side crashes in the app UI instead of leaving a dead screen
  - cover the new fatal-error behavior with focused tests before wiring it into the runtime entrypoints
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/styles.css
  - src/server/index.ts
  - src/server/global-handler.ts
  - src/server/global-handler.test.ts
  - src/ui/app.ts
  - src/ui/global-error.ts
  - src/ui/global-error.test.ts
- Do Not Touch:
  - data/spec/
  - src/ai/
- Dependencies:
  - None
- Validation:
  - `npm test`
- Definition of Done:
  - fatal server crashes are logged and trigger one controlled shutdown path
  - fatal browser errors show a plain-language recovery panel and disable turn submission
  - the new handlers are covered by focused automated tests
  - README notes how unexpected runtime crashes now surface during local troubleshooting
- Handoff Notes:
  - prefer safe logging and plain-language recovery copy over clever restart behavior
  - keep the client boundary generic so it can be reused by the launcher or packaged shell later
  - completed on 2026-03-08 with a new server-side `src/server/global-handler.ts` process handler for `uncaughtException` and `unhandledRejection`, wired into `src/server/index.ts` so fatal errors log once, close the HTTP server, and exit through one controlled shutdown path
  - completed on 2026-03-08 with a new browser-side `src/ui/global-error.ts` boundary and a fatal-error panel in `public/index.html`; `src/ui/app.ts` now registers global browser error listeners early, surfaces plain-language recovery copy, and disables interaction after an unexpected client crash
  - added focused automated coverage in `src/server/global-handler.test.ts` and `src/ui/global-error.test.ts`
  - validation on 2026-03-08: `docker compose build app` passed, `docker compose run --rm --no-deps app npx tsx --test src/server/global-handler.test.ts src/ui/global-error.test.ts` passed, and `docker compose run --rm --no-deps app npm test` now passes after the earlier unrelated `src/core/config.test.ts` failure was resolved elsewhere in the repo

### T06 - Turn Input, Output, And State Schemas

- Status: Done
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
  - BACKLOG.md
  - src/core/types.ts
  - src/rules/validator.ts
  - src/rules/validator.test.ts
  - src/server/index.ts
  - src/server/http-contract.ts
  - src/server/http-contract.test.ts
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
  - implemented on 2026-03-08 with three HTTP-boundary schema markers: `turn-input/v1`, `turn-output/v1`, and `authoritative-state/v1`
  - `/api/turn` now normalizes the legacy camelCase request body (`playerId`, `name`) into the versioned turn-input contract so the current UI keeps working while later tasks move fully to the explicit schema
  - `/api/state` and `/api/turn` now return versioned authoritative player snapshots, and `/api/turn` also returns a top-level `schema_version` for the turn-output payload
  - completed follow-up on 2026-03-08 to make the shared `/api/turn` response contract explicit before `T07`, `T08`, and `T09` build on it
  - added `StateResponsePayload` and `TurnResponsePayload` in `src/core/types.ts` so the Phase 1 server boundary has named response types instead of ad hoc object assembly
  - added `validateStateResponse` and `validateTurnResponse` plus focused coverage in `src/rules/validator.test.ts` so response envelopes are checked alongside the inner turn and player payloads
  - added `src/server/http-contract.ts` and `src/server/http-contract.test.ts` to stamp authoritative-state versions and assemble the shared `/api/state` and `/api/turn` payloads in one place
  - `/api/turn` now returns the full validated turn-output payload, including `memory_updates`, alongside the versioned authoritative player snapshot
  - added focused coverage in `src/rules/validator.test.ts` for turn-input parsing, turn-output validation, authoritative-state validation, and the new state or turn response envelopes
  - validation on 2026-03-08 passed with `git diff --check`, `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/http-contract.test.ts`, and `docker compose run --rm --no-deps app npm test`
  - note for future agents: the `app` service runs from the built image, not a bind-mounted workspace, so new source files require `docker compose build app` before Docker-based test runs will see them

### T11 - Minimal Player UI Loop

- Status: Done
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Provide a text-first browser UI that can serve as the player surface for both the dev loop and the future launched build.
- Scope:
  - keep a text-first browser play loop for player input and narrator output
  - add session controls that are clear without developer context
  - add a debug surface for session, model, timing, and turn payload inspection without overwhelming normal play
  - keep the implementation aligned with the existing server endpoints instead of creating a parallel UI contract
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - src/ui/app.ts
  - public/styles.css
  - src/server/index.ts
- Do Not Touch:
  - data/spec/
  - src/ai.ts
  - src/assist.ts
  - src/db.ts
- Dependencies:
  - T06
- Validation:
  - `docker compose run --rm --no-deps app npm test`
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - manual browser smoke test against the configured local AI path
- Definition of Done:
  - a player can create or resume a session in the browser and submit turns
  - narrator output, suggested options, and current state are visible without opening devtools
  - useful debug details are available when needed without exposing secrets
  - the same UI can be reused by the launcher or packaged path
- Handoff Notes:
  - user assigned this ahead of queue order on 2026-03-07 to make local AI iteration easier before deeper roadmap work
  - implemented a browser play shell with session refresh or new-session controls, multiline text input, suggestion chips, and a persistent debug panel
  - `/api/state` now returns safe runtime or session debug data and `/api/turn` now returns safe debug data including request id, latency, prompt preview, embedding fallback status, validation result, and before or after player snapshots
  - task card paths were aligned on 2026-03-08 with the current authoring layout: `src/ui/app.ts` is the browser source of truth and `src/server/index.ts` is the server entrypoint
  - validation completed on 2026-03-08 with `docker compose run --rm --no-deps app npm test`, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, a page-load smoke at `http://127.0.0.1:3100/`, and a live `/api/turn` submission returning narrative, options, debug payload, and versioned player state through the LiteLLM plus Ollama path
  - no additional implementation changes were required in this session because the existing UI loop already satisfied the task once the supported Docker-backed validation path was available

### T11a - Browser UI Module Decomposition Groundwork

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Break `src/ui/app.ts` into browser-only modules that preserve the current player flow while creating stable homes for future setup, recovery, tutorial, and save-surface work.
- Scope:
  - extract low-risk browser-side modules first, starting with DTO contracts, DOM lookup, HTTP helpers, storage helpers, and runtime-session selectors
  - reduce duplication inside `src/ui/app.ts` without changing the current HTTP contract, DOM ids, launch flow semantics, or localStorage keys
  - add focused tests for the extracted low-risk modules before larger controller or renderer splits begin
  - leave `src/ui/app.ts` as the active composition root during the groundwork phase rather than attempting the full controller split in one step
- Files to Touch:
  - BACKLOG.md
  - src/ui/app.ts
  - src/ui/contracts.ts
  - src/ui/debug-view.ts
  - src/ui/debug-view.test.ts
  - src/ui/dom.ts
  - src/ui/http-client.ts
  - src/ui/http-client.test.ts
  - src/ui/player-name.ts
  - src/ui/player-name.test.ts
  - src/ui/session-data.ts
  - src/ui/session-data.test.ts
  - src/ui/setup-view.ts
  - src/ui/setup-view.test.ts
- Do Not Touch:
  - data/spec/
  - src/server/
  - src/state/
  - src/story/
- Dependencies:
  - T11
  - T12b
- Validation:
  - `docker compose build app`
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/ui/global-error.test.ts src/ui/http-client.test.ts src/ui/player-name.test.ts src/ui/session-data.test.ts`
  - `docker compose run --rm --no-deps app npm run build:client`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - `src/ui/app.ts` no longer owns the low-risk DTO, DOM, storage, fetch, and runtime-selector logic directly
  - extracted modules have focused automated coverage where practical
  - the browser bundle still builds and the current launch/setup/play flow remains behaviorally unchanged
  - the refactor leaves clean seams for later controller and view extraction work
- Handoff Notes:
  - user explicitly requested on 2026-03-08 to start implementation of the `src/ui/app.ts` breakup plan
  - first extraction batch on 2026-03-08 created `src/ui/contracts.ts`, `src/ui/dom.ts`, `src/ui/http-client.ts`, `src/ui/player-name.ts`, and `src/ui/session-data.ts`, and rewired `src/ui/app.ts` to consume them
  - focused tests were added for the new modules in `src/ui/http-client.test.ts`, `src/ui/player-name.test.ts`, and `src/ui/session-data.test.ts`
  - validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/ui/global-error.test.ts src/ui/http-client.test.ts src/ui/player-name.test.ts src/ui/session-data.test.ts`, and `docker compose run --rm --no-deps app npm run build:client`
  - second extraction batch on 2026-03-08 created `src/ui/setup-view.ts` and `src/ui/debug-view.ts`, moved setup/preflight rendering plus debug snapshot rendering out of `src/ui/app.ts`, and added focused tests in `src/ui/setup-view.test.ts` and `src/ui/debug-view.test.ts`
  - second-batch validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/ui/global-error.test.ts src/ui/http-client.test.ts src/ui/player-name.test.ts src/ui/session-data.test.ts src/ui/setup-view.test.ts src/ui/debug-view.test.ts`, `docker compose run --rm --no-deps app npm run build:client`, and `docker compose run --rm --no-deps app npm test`
  - completed on 2026-03-08 after a follow-up selector fix that makes the preflight panel prefer the freshest runtime debug over the bootstrap setup snapshot while still falling back safely when runtime data is absent
  - the shared `/api/setup/status` contract now lives in `src/core/types.ts`; `src/ui/contracts.ts` keeps only UI-local response widening for error payloads
  - next safe extractions are tracked in `T11b` rather than as open-ended handoff notes

### T11b - Turn Surface Renderer Extraction

- Status: Done
- Queue: Next
- Phase: P1
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Continue shrinking `src/ui/app.ts` by moving turn-surface rendering into browser-only view modules without changing the async controller flow.
- Scope:
  - extract rendering helpers for the turn log, suggestion options, assist chips, and session summary text
  - keep DOM ids, CSS hooks, localStorage keys, and HTTP request timing unchanged
  - add focused tests for any new view-model or renderer helpers before rewiring `src/ui/app.ts`
  - leave network requests, retry logic, and state transitions in `src/ui/app.ts` for this slice
- Files to Touch:
  - BACKLOG.md
  - src/ui/app.ts
  - src/ui/
- Do Not Touch:
  - data/spec/
  - src/server/
  - src/state/
  - src/story/
- Dependencies:
  - T11a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts`
  - `docker compose run --rm --no-deps app npm run build:client`
- Definition of Done:
  - `src/ui/app.ts` no longer owns the direct rendering logic for the turn log, suggestion options, assist chips, and session summary
  - new renderer or view-model helpers have focused automated coverage
  - the turn surface remains behaviorally unchanged in the browser bundle
  - the async orchestration stays centralized enough that later controller work can proceed in a separate task
- Handoff Notes:
  - this task is intentionally the next narrow slice after `T11a`; do not mix it with setup-flow or save-slot behavior work
  - prefer pure renderer helpers or view-model builders over stateful mini-controllers in this phase
  - completed on 2026-03-08 by adding `src/ui/turn-surface.ts` and `src/ui/turn-surface.test.ts`, extracting log entry rendering, suggestion option rendering, assist chip rendering, and session-summary text generation out of `src/ui/app.ts` while leaving async flow control in the composition root
  - `src/ui/app.ts` now delegates turn-surface DOM work to the new helper module, and the UI-side setup or preflight contract types were realigned to the shared `src/core/types.ts` definitions to remove duplicate drift in `src/ui/contracts.ts`
  - focused test coverage now includes the new turn-surface helper plus updated shared-type fixtures in `src/ui/debug-view.test.ts`, `src/ui/session-data.test.ts`, and `src/ui/setup-view.test.ts`
  - validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts`, and `docker compose run --rm --no-deps app npm run build:client`

### T12 - New Game Onboarding

- Status: Review
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Get a first-time player from launch to the first turn with minimal explanation debt.
- Scope:
  - capture only the information needed to start or resume play
  - make new game and resume controls obvious from the first screen
  - explain the basic turn loop in plain language without requiring README reading
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.js
  - src/ui/app.ts
  - public/styles.css
- Do Not Touch:
  - src/ai/service.ts
  - src/core/db.ts
- Dependencies:
  - T06
- Validation:
  - manual new-game flow check
- Definition of Done:
  - a first-time player can start or resume without needing external docs mid-session
  - onboarding copy avoids developer jargon
  - the onboarding flow hands off cleanly to the tutorial and setup diagnostics paths
- Handoff Notes:
  - keep the first screen short enough that it still feels like an app launch, not a configuration checklist
  - updated on 2026-03-08 to add a browser-side onboarding gate in `src/ui/app.ts` so the page no longer auto-creates a session on load; instead it shows `Start New Game` and `Resume Last Game` actions before revealing the turn controls
  - the first-screen copy, toolbar labels, and input labels were rewritten in `public/index.html` and `public/styles.css` to remove more developer-facing wording from the initial player flow while keeping the existing debug panel intact
  - validation on 2026-03-08 ran `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npm run build:client`, `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`, and HTTP smoke checks against `/` plus `/api/state` on the launched app
  - the full interactive browser click-through for `Start New Game` and `Resume Last Game` was not completed cleanly in this session because the headless-browser automation attempt hung; leave this task in `Review` until a short manual browser check confirms both buttons reveal the expected flow end to end

### T12b - First-Run Setup Wizard And Connection Test

- Status: Done
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Turn configuration and AI connectivity into a guided first-run flow instead of README-only work.
- Scope:
  - add guided checks for the supported Docker-backed LiteLLM provider path and config before the first turn
  - expose a safe connection test and plain-language error states
  - explain missing Docker, missing LiteLLM readiness, and GPU-backed launcher prerequisites without requiring terminal knowledge
  - allow retrying setup without deleting saves or reopening the terminal
  - document the supported MVP AI path in the UI and README
- Files to Touch:
  - BACKLOG.md
  - README.md
  - public/index.html
  - public/app.js
  - src/ui/app.ts
  - public/styles.css
  - src/core/types.ts
  - src/core/config.ts
  - src/rules/validator.ts
  - src/rules/validator.test.ts
  - src/server/index.ts
  - src/server/setup-status.ts
  - src/server/setup-status.test.ts
  - src/server/runtime-preflight.ts
  - src/server/runtime-preflight.test.ts
- Do Not Touch:
  - data/spec/
  - src/state/game.ts
- Dependencies:
  - T02f
  - T11
  - T12
- Validation:
  - `npm test`
  - manual first-run flow check with reachable and unreachable AI paths
- Definition of Done:
  - the setup flow can confirm or clearly reject the current AI config
  - a user can fix config and retry without deciphering stack traces
  - diagnostics omit secrets while still giving enough support context
  - the setup flow matches launcher behavior and README guidance
- Handoff Notes:
  - treat the supported AI path as a product decision, not just a config screen
  - updated on 2026-03-08 with a new `/api/setup/status` route plus `src/server/setup-status.ts` so the browser can check setup and retry AI connectivity without creating or resuming a player session
  - the launch screen in `src/ui/app.ts` and `public/index.html` now includes a first-run setup wizard with a retryable connection test, supported-path messaging, and plain-language guidance derived from the shared preflight issue contract
  - `src/rules/validator.ts`, `src/rules/validator.test.ts`, and `src/server/setup-status.test.ts` now cover the setup-status response envelope before the browser consumes it
  - `README.md` and `REQUIREMENTS.md` were updated to document the launch-screen connection test and the new setup-status API surface
  - validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts src/server/setup-status.test.ts src/server/runtime-preflight.test.ts`, `docker compose run --rm --no-deps app npm run build:client`, and `docker compose run --rm --no-deps app npm test`
  - manual reachable-path smoke on 2026-03-08 used `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser` plus `GET /api/setup/status` and confirmed a `ready` setup payload for the supported Docker Desktop plus LiteLLM plus GPU-backed Ollama path
  - manual unreachable-path smoke on 2026-03-08 used a detached `docker compose run --service-ports --no-deps` app container with `AI_PROFILE=custom` and `LITELLM_PROXY_URL=http://host.docker.internal:59999`; querying `/api/setup/status` inside that container returned `action-required` with the expected `ai_endpoint_unreachable` blocker
  - closed on 2026-03-08 after `T12d` added the repeatable launch-screen setup smoke harness in `scripts/test-setup-browser-smoke.ps1`, which verifies the blocked-state launch gating, retry recovery, and saved browser session preservation path without relying on an ad hoc manual read-through
  - fresh closeout validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm test`, and `powershell -ExecutionPolicy Bypass -File scripts/test-setup-browser-smoke.ps1`
  - the user confirmed on 2026-03-08 that setup and diagnostics should stay UI-first for now
  - the user confirmed on 2026-03-08 that LiteLLM is the default AI control plane the setup flow should steer toward
  - treat the repo-managed Docker LiteLLM sidecar as the default recovery path, with GPU-backed local inference explained as an explicit opt-in

### T12d - First-Run Setup Browser Smoke Harness

- Status: Done
- Queue: Next
- Phase: P1
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Give the setup wizard one repeatable browser-level smoke path so `T12b` can close against a documented check instead of an ad hoc manual read-through.
- Scope:
  - define one repeatable browser smoke path for the launch-screen setup wizard in both a ready and blocked state, using the lightest feasible tooling
  - verify the launch screen disables start or resume while setup is blocked and re-enables the path after a successful retry
  - verify the saved browser session id is preserved across setup retries
  - document how the smoke path is run so later agents can repeat it before touching setup UX
- Files to Touch:
  - BACKLOG.md
  - README.md
  - scripts/
  - src/ui/
- Do Not Touch:
  - data/spec/
  - src/state/
  - src/story/
- Dependencies:
  - T12b
- Validation:
  - browser setup smoke path
- Definition of Done:
  - one documented smoke path exercises the setup wizard in a blocked state and a recovered ready state
  - the smoke path proves start gating and retry behavior without clearing the saved browser session
  - later setup-flow changes can point to this repeatable check instead of a one-off manual note
  - the chosen approach stays lightweight enough to run during normal UI refactor work
- Handoff Notes:
  - keep this as a smoke path, not a full end-to-end framework migration
  - prefer reusing the existing Docker or launcher setup contracts rather than inventing a UI-only fake backend unless deterministic blocking states require one
  - completed on 2026-03-08 by adding `src/ui/launch-view.ts`, `src/ui/launch-view.test.ts`, and `src/ui/setup-browser-smoke.test.ts`, giving the launch-screen setup gating logic a shared helper plus a focused blocked-to-ready smoke path
  - `src/ui/app.ts` now delegates launch-panel gating to `src/ui/launch-view.ts`, so later setup UX changes can reuse the same view-model logic instead of duplicating it in tests
  - added `scripts/test-setup-browser-smoke.ps1` as the repeatable wrapper command; it rebuilds the app image, runs `npm run type-check`, executes the targeted setup smoke tests, and rebuilds the browser bundle to confirm the current UI still compiles
  - `README.md` now documents the smoke harness command and what it verifies: blocked launch gating, retry recovery, saved browser session preservation, and bundle rebuild safety
  - validation on 2026-03-08 passed with `powershell -ExecutionPolicy Bypass -File scripts/test-setup-browser-smoke.ps1`

### T12c - Guided Recovery Actions And Advanced Setup Details

- Status: Done
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Turn setup blockers and warnings into a guided recovery flow with retry actions for end users and expandable advanced details for developers.
- Scope:
  - present blockers, warnings, and info in the setup UI with short summaries and one recommended action each
  - add retry flows and the smallest safe auto-fix actions for common issues such as restarting checks, choosing a smaller local profile, or repairing the GPU-backed path
  - expose advanced setup details on demand so developers can inspect resolved config, probe targets, and failing subsystems without overwhelming end users
  - keep save data intact while users retry setup or switch profiles
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - README.md
  - public/index.html
  - public/styles.css
  - src/ui/app.ts
  - src/ui/setup-view.ts
  - src/ui/setup-view.test.ts
  - src/core/types.ts
  - src/server/setup-status.ts
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T12b
  - T01c
  - T02i
  - T04a
  - T02j
- Validation:
  - manual recovery flow check
  - manual retry and profile-switch smoke test
- Definition of Done:
  - common setup blockers can be retried without reopening the terminal
  - end users get one obvious next step per issue while advanced users can expand for deeper diagnostics
  - setup repair flows do not require deleting saves or editing hidden files during normal recovery
  - the browser and launcher recovery language stay aligned
- Handoff Notes:
  - avoid turning the first-run screen into a wall of diagnostics
  - auto-fix actions should stay reversible and conservative
  - completed on 2026-03-08 by extending `/api/setup/status` with advanced config and local-GPU details, then teaching `src/ui/setup-view.ts` to render richer issue cards plus copyable recovery actions for retry, launcher restart guidance, smaller-profile guidance, and GPU repair checklists
  - `public/index.html` and `public/styles.css` now include a dedicated setup-actions area plus an expandable advanced-setup details surface so end-user recovery copy and developer diagnostics stay separated
  - `src/ui/app.ts` now handles setup recovery buttons through shared browser-side copy helpers, keeping the saved browser session intact while retrying setup checks
  - validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/server/setup-status.test.ts src/ui/setup-view.test.ts src/ui/launch-view.test.ts src/ui/setup-browser-smoke.test.ts`, `docker compose run --rm --no-deps app npm run build:client`, and `docker compose run --rm --no-deps app npm test`

### T29 - Save Slots UI

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Make session continuity visible and safe from the main player flow.
- Scope:
  - list available save slots in the main UI
  - create, update, and load slots without file browsing or terminal use
  - show compatibility or corruption problems in plain language
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.ts
  - public/styles.css
  - src/db.ts
  - src/server.ts
- Do Not Touch:
  - data/spec/
  - src/ai.ts
- Dependencies:
  - T08
  - T09
- Validation:
  - manual save or load check
- Definition of Done:
  - save slots are accessible from the main UI
  - save and load errors are actionable for non-developers
  - the supported player path can save and resume without manual file handling
- Handoff Notes:
  - keep slot naming and recovery wording plain because packaged builds will amplify confusion here

### T34 - Tutorial And First-Run Guidance

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Explain the core loop and controls inside the app so the README is optional for first-time play.
- Scope:
  - add short tutorial beats for the first session
  - explain suggested inputs, session controls, and recovery actions in plain language
  - ensure tutorial copy degrades cleanly once the player is familiar
- Files to Touch:
  - BACKLOG.md
  - REQUIREMENTS.md
  - public/index.html
  - public/app.ts
  - public/styles.css
- Do Not Touch:
  - data/spec/
  - src/ai.ts
  - src/db.ts
- Dependencies:
  - T11
  - T12
- Validation:
  - manual onboarding smoke test
- Definition of Done:
  - a first-time player can understand the first three turns without external docs
  - tutorial copy is concise enough to stay readable during launch
  - tutorial and recovery guidance do not hide save or repair actions
- Handoff Notes:
  - keep this focused on clarity, not lore dumping

### T02c - Windows Local AI Smoke-Test Path

- Status: Done
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
  - src/config.ts
  - setup_local_a.i.md
  - src/core/config.test.ts
- Do Not Touch:
  - public/
  - data/spec/
  - src/server.ts (legacy path note; do not add new server logic outside `src/server/index.ts`)
- Dependencies:
  - T02
- Validation:
  - `docker compose build app`
  - `docker compose run --rm --no-deps app npm run test:config`
  - manual Docker Ollama smoke with host-visible `/api/state`
- Definition of Done:
  - a Windows developer has one documented local AI setup path to follow
  - the app can resolve local-provider defaults without extra code edits
  - setup and config docs match the implemented env behavior
- Handoff Notes:
  - use this path for smoke tests only until structured-output reliability is measured against fixtures
  - user clarified on 2026-03-08 that Ollama or another local model is an optional larger-model path, not the default small-task setup
  - direct Ollama validation passed on 2026-03-07 for `POST /v1/chat/completions` with JSON schema, `POST /v1/embeddings`, and one full `game_turn`-shaped response using `gemma3:4b` plus `embeddinggemma`
  - this is still a developer smoke-test path, not the supported non-technical player path
  - `npm install`, `npm run dev`, and config runtime verification were not runnable in this session because `node` and `npm` were unavailable in the shell environment
  - re-audit on 2026-03-08 found the prior Docker smoke failure was a host-port publishing invocation issue, not an app runtime failure: Compose still tried to publish host port `3000` unless the host-side `PORT` env var was set before `docker compose run --service-ports`
  - closeout validation on 2026-03-08 passed with `docker compose build app`, `docker compose run --rm --no-deps app npm run test:config`, and `$env:PORT='3316'; docker compose run --rm --no-deps --service-ports -e PORT=3316 -e AI_PROFILE=custom -e AI_PROVIDER=ollama -e OLLAMA_BASE_URL=http://host.docker.internal:11434/v1 app npm run dev`, followed by a host `GET /api/state` returning `200`
  - the rebuilt smoke path now exposes `/api/state` on the host correctly and surfaces an expected preflight blocker when the host Ollama service is unreachable, which is the intended recovery behavior for this optional developer-only path

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
  - src/server.ts
  - src/ai.ts
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

### T43 - Budget Config File And API Contract

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: Tech lead
- Goal: Move latency, token, cost, and DB-growth budgets out of doc-only tables into one validated server-side config contract that later UI and fixture work can share.
- Scope:
  - add one repo-owned budget config source for the documented latency, token, cost-per-100-turns, and DB-growth defaults
  - include fixed context or retrieval budget slices for the live memory buckets rather than only one aggregate token ceiling
  - validate and load budget values on the server with a safe read or write API for non-gameplay consumers
  - keep budget config separate from authoritative player state, save payloads, and story content
  - align README, requirements, and engineering standards around the same runtime budget source of truth
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - ENGINEERING_STANDARDS.md
  - src/core/types.ts
  - src/core/config.ts
  - src/core/budgets.ts
  - src/core/budgets.test.ts
  - src/server/index.ts
- Do Not Touch:
  - data/spec/
  - src/ui/
- Dependencies:
  - D01
  - T07a
  - T09
  - T13a
  - T63a
- Validation:
  - `npm test`
  - manual budget API round-trip
- Definition of Done:
  - the documented default budgets live in one server-side config source instead of docs only
  - per-bucket context or retrieval ceilings are configurable through the same source as the overall token budget
  - invalid budget values are rejected before they can become the active runtime config
  - the current budget config can be retrieved and updated through a stable server contract for later UI and fixture consumers
  - the budget docs point at the implemented config source rather than implying a missing one
- Handoff Notes:
  - audit on 2026-03-08 found that the repo documents a server-side budget config file plus web UI adjustability, but the live implementation only exposes doc values
  - keep this task focused on the budget contract and persistence boundary; budget editing in the browser belongs to `T44`
  - prefer a deterministic file format and validation path that automated fixture work can read without scraping UI text
  - align bucket-level memory budgets with `T63a` instead of hard-coding context slices in prompts or scripts

### T47 - LiteLLM Default Route Integration Fixtures

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: AI systems lead
- Goal: Replace manual LiteLLM chat and embedding route checks with repeatable integration fixtures that prove the default alias contract and fallback behavior.
- Scope:
  - add a deterministic integration fixture or scripted test path for the default `game-chat` route
  - add a matching integration fixture or scripted test path for the default `game-embedding` route
  - cover at least one fallback or failure-classification path so route regressions do not collapse into a generic network error
  - keep the checks aligned with the stable LiteLLM alias names instead of provider-specific upstream model names
- Files to Touch:
  - BACKLOG.md
  - README.md
  - package.json
  - scripts/
  - src/ai/
  - src/server/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07a
  - T13a
- Validation:
  - LiteLLM route fixture run
- Definition of Done:
  - one documented path verifies the default LiteLLM chat alias end to end
  - one documented path verifies the default LiteLLM embedding alias end to end
  - route or fallback failures report which contract broke instead of only reporting a generic AI outage
  - later MVP exit checks can point at this automated route coverage instead of manual smoke notes
- Handoff Notes:
  - roadmap and backlog currently require automated chat and embedding route coverage, but the active Phase 2 queue still relies on manual verification paths for `T07a` and `T13a`
  - start with a deterministic test or harness update before changing implementation, per the repo AI workflow policy
  - keep the fixture output keyed to `game-chat` and `game-embedding` so upstream model swaps behind LiteLLM do not invalidate the contract

### T44 - Budget Controls UI

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Let advanced users inspect and adjust delivery budgets from the browser without editing files or opening devtools.
- Scope:
  - add a budget panel to the existing advanced or debug browser surface instead of the main player flow
  - show the active latency, token, cost, and DB-growth targets with plain-language descriptions
  - let users apply validated budget edits and recover from invalid values without losing the current session
  - keep the first-run and normal play surfaces uncluttered by treating budget tuning as advanced tooling
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - public/index.html
  - public/styles.css
  - src/ui/app.ts
  - src/server/index.ts
- Do Not Touch:
  - data/spec/
  - src/ai/
- Dependencies:
  - T11
  - T43
- Validation:
  - `npm test`
  - manual budget UI round-trip
- Definition of Done:
  - the browser can show the active budget targets without exposing secrets
  - validated budget changes can be applied from the UI without file edits
  - invalid edits produce clear recovery copy and leave the previous budget values intact
  - the budget controls stay in an advanced surface rather than reading like first-run onboarding
- Handoff Notes:
  - keep the player-facing launch path focused on setup and play; budget tuning is for advanced users and internal tuning
  - if the UI needs reset behavior, prefer explicit restore-defaults actions over silent auto-rewrites

### T46 - Save Schema Compatibility Rules And Migration Fixture

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P1
- Owner Role: Tech lead
- Goal: Make save compatibility an explicit tested contract instead of an implied property of the current SQLite schema.
- Scope:
  - define save compatibility rules for authoritative state and persisted session data across schema versions
  - add one deterministic migration fixture that upgrades an older save or DB snapshot into the current schema successfully
  - surface incompatible-save failures in plain language through the existing runtime or load path instead of raw DB errors
  - document which changes require a migration, which changes are backward-compatible, and when a save must be rejected
- Files to Touch:
  - BACKLOG.md
  - README.md
  - REQUIREMENTS.md
  - ENGINEERING_STANDARDS.md
  - src/core/db.ts
  - src/core/types.ts
  - src/server/index.ts
  - src/state/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T06
  - T09
  - T29
- Validation:
  - save migration fixture run
- Definition of Done:
  - save compatibility rules are written down where later save or load work can follow them
  - at least one older save fixture or DB snapshot upgrades successfully to the current runtime
  - incompatible saves fail with actionable recovery language instead of opaque storage errors
  - roadmap MVP migration claims can point at a real fixture instead of only documentation
- Handoff Notes:
  - roadmap audit on 2026-03-08 found MVP language that requires save or load behavior across at least one schema version change, but the backlog did not yet have an explicit compatibility-policy task
  - keep this task focused on migration rules and fixture proof; richer import or export UX still belongs to later save-surface tasks
  - prefer a fixture checked into the repo over ad hoc manual save editing so later agents can re-run the same path

### T45 - Budget Fixture Enforcement And Breach Reporting

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: AI systems lead
- Goal: Turn the documented delivery budgets into an automated fixture gate that reports exact breaches instead of relying on manual interpretation.
- Scope:
  - add a repeatable fixture or scripted suite that measures configured latency, token, cost, and DB-growth budgets against the baseline gameplay path
  - fail clearly when a budget is exceeded, including actual versus target values in the output
  - reuse the server-side budget config from `T43` and the telemetry work from `T26` instead of duplicating thresholds in test code
  - measure persisted DB growth from the fixture output on disk rather than estimating it from row counts alone
- Files to Touch:
  - BACKLOG.md
  - README.md
  - ENGINEERING_STANDARDS.md
  - package.json
  - scripts/
  - src/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T09
  - T24
  - T26
  - T43
- Validation:
  - fixture budget suite run
- Definition of Done:
  - one documented command or scripted entrypoint checks the baseline fixture against the configured budgets
  - budget breaches report target versus actual values clearly enough to debug regressions
  - the fixture suite reads the same budget config the app exposes elsewhere instead of hard-coding duplicate numbers
  - MVP budget exit claims can point at this repeatable validation path
- Handoff Notes:
  - audit on 2026-03-08 found that the budget numbers exist in docs, but the repo still lacks the runtime and fixture loop needed to prove them
  - keep the measurement path deterministic; if provider pricing is variable, capture one explicit pricing source or fixture assumption in the test output
  - this task should close the gap between documented budget targets and enforceable regression checks, not just add another dashboard

### T24 - Core Pipeline Tests

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: Tech lead
- Goal: Give the core gameplay path one repeatable automated test layer that exercises the server-authoritative turn pipeline instead of relying on isolated unit coverage alone.
- Scope:
  - add end-to-end integration coverage for the core turn pipeline using deterministic AI fixtures or stubs
  - cover at least one valid turn, one validator rejection path, and one persistence or replay-sensitive path
  - keep the test layer provider-neutral at the app boundary even when LiteLLM is the default runtime path
  - make the suite runnable in CI without requiring a live hosted provider
- Files to Touch:
  - BACKLOG.md
  - README.md
  - package.json
  - src/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07
  - T08
  - T10
- Validation:
  - CI-equivalent test run
- Definition of Done:
  - the core turn pipeline can be exercised automatically without a manual browser session
  - the suite proves request parsing, validation, state mutation, and persistence cooperate on the happy path
  - at least one broken path fails with targeted assertions instead of only a generic 500 expectation
  - the command is documented clearly enough for future agents to run before broader refactors
- Handoff Notes:
  - this task should become the stable automated base that later telemetry, replay, and budget-fixture tasks build on
  - keep fixtures deterministic and small; avoid turning this into a live-provider smoke suite

### T26 - Telemetry For Tokens, Latency, And Cost

- Status: Ready
- Queue: Later
- Phase: P4
- Priority: P1
- Owner Role: AI systems lead
- Goal: Capture the runtime numbers needed to debug model cost and performance regressions instead of inferring them from logs by hand.
- Scope:
  - record per-turn latency, token usage, retry count, model alias, validation failures, and estimated cost in one telemetry path
  - record context-entry accounting by bucket plus retrieval or prompt-inspection metadata that later tools can explain
  - keep the telemetry contract aligned with the documented `/api/turn` minimum fields in `ENGINEERING_STANDARDS.md`
  - expose the captured data through a developer-friendly inspection path or report suitable for later budget enforcement
  - omit secrets and avoid introducing provider-specific telemetry coupling outside the adapter boundary
- Files to Touch:
  - BACKLOG.md
  - README.md
  - ENGINEERING_STANDARDS.md
  - src/
  - scripts/
- Do Not Touch:
  - public/
  - data/spec/
- Dependencies:
  - T07
  - T63c
- Validation:
  - manual telemetry verification
- Definition of Done:
  - `/api/turn` telemetry captures the documented latency, token, retry, validation, and cost fields
  - context-entry data is inspectable enough to explain what memory entered the prompt and why
  - the captured output is inspectable without scraping unrelated server logs
  - telemetry data is structured enough for later fixture-budget enforcement to consume
  - provider credentials and other secrets are not emitted in the telemetry surface
- Handoff Notes:
  - keep cost accounting assumptions explicit so later budget checks can compare like with like
  - this task is a prerequisite for enforceable budget reporting, not a substitute for `T45`
  - do not collapse retrieval traces into human-only log text; later budget and replay tooling should be able to parse the data

### T36b - Packaged AI Prerequisite Detection And Repair Flow

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Make the packaged player path explain Docker and LiteLLM startup problems in plain language before the user is dumped into a broken shell.
- Scope:
  - detect whether Docker Desktop is missing, installed but not running, or running without a ready AI sidecar
  - distinguish LiteLLM-not-ready failures from app-server startup failures inside the packaged path
  - surface one recommended repair step per failure mode, with retry support that does not require deleting saves
  - explain when the GPU-backed launcher path is unsupported and steer the user toward the documented prerequisite repair flow cleanly
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
  - src/ui/
  - src/server/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T12c
  - T35a
- Validation:
  - packaged prerequisite smoke test
- Definition of Done:
  - the packaged path can tell Docker Desktop missing, Docker not running, LiteLLM not ready, and optional local GPU prerequisite failures apart
  - each packaged startup blocker has plain-language recovery copy and a retry path
  - packaged diagnostics stay aligned with the shared preflight contract instead of inventing a separate severity vocabulary
  - `T36` can focus on the Windows build itself instead of hiding prerequisite-repair work inside a broad packaging task
- Handoff Notes:
  - `packaging/decision-memo.md` already calls this out as required packaged behavior; this task makes that requirement executable in the backlog
  - preserve save data and runtime logs while users retry packaged setup failures

### T36 - Windows Playtest Build

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Produce one Windows-first playtest build that wraps the existing gameplay stack without reintroducing terminal-dependent setup.
- Scope:
  - build the packaged Windows playtest target from the chosen Electron path
  - keep the packaged shell using the same compiled server and browser UI stack as the launcher path
  - document save locations, logs, and supported recovery steps for playtesters
  - validate the portable or unpacked build on a clean-machine-style smoke path after packaged prerequisite handling is in place
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
  - src/ui/
  - src/server/
- Do Not Touch:
  - data/spec/
- Dependencies:
  - T35a
  - T12c
  - T29
  - T36b
- Validation:
  - build or install verification
- Definition of Done:
  - a Windows playtest build can be launched by double-click without requiring a terminal
  - the packaged build still uses the existing server-authoritative gameplay stack
  - save and log locations are documented in plain language for testers
  - the packaged smoke path proves the build works with the supported Docker-backed AI contract
- Handoff Notes:
  - keep this task focused on the playable Windows build and clean-machine validation, not on repackaging the AI gateway
  - prerequisite and repair messaging for Docker and LiteLLM belongs in `T36b`

### T38 - Installer Packaging

- Status: Ready
- Queue: Later
- Phase: P3
- Priority: P1
- Owner Role: Release lead
- Goal: Turn the validated Windows playtest build into an installer path that preserves the same runtime contract and recovery clarity.
- Scope:
  - add an installer-capable packaging path on top of the validated Windows playtest build
  - preserve user data, saves, and logs outside the install directory through install, upgrade, and uninstall flows
  - document installer behavior, repair expectations, and uninstall impact in plain language
  - validate that the installer does not break the packaged startup, preflight, or save-location assumptions already proven in `T36`
- Files to Touch:
  - BACKLOG.md
  - README.md
  - packaging/
  - scripts/
- Do Not Touch:
  - data/spec/
  - src/state/
- Dependencies:
  - T36
- Validation:
  - installer smoke test
- Definition of Done:
  - a Windows installer can produce the same supported playtest runtime that `T36` validated
  - install, uninstall, and reinstall flows do not store saves inside the install directory
  - installer docs explain what happens to saves, logs, and Docker-backed AI prerequisites
  - installer validation catches obvious regressions in launch or persistence behavior before Phase 5 work begins
- Handoff Notes:
  - do not silently change the packaged AI ownership model here; keep the installer path aligned with the packaged Docker-backed LiteLLM contract
  - signing, update channels, and release rehearsal still belong to later release tasks

### T48 - Server Route And Turn Pipeline Extraction

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Keep `src/server/index.ts` as a thin composition root by moving turn orchestration and reusable route behavior into focused modules before more Phase 1 work lands.
- Scope:
  - extract `/api/turn` orchestration out of `src/server/index.ts` so request parsing or response shaping stays separate from gameplay, AI, validation, and persistence sequencing
  - move reusable route helpers for setup or state handling into focused server modules instead of leaving them inline in the entrypoint
  - keep startup wiring, middleware registration, static asset hosting, and shutdown handling in `src/server/index.ts`
  - add or tighten focused route or pipeline tests before moving behavior so the current HTTP contract stays stable
- Files to Touch:
  - BACKLOG.md
  - src/server/
  - src/state/
  - src/story/
  - src/ai/
  - src/rules/
- Do Not Touch:
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T06
  - T12c
  - T61a
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/server/**/*.test.ts`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - `src/server/index.ts` can be described as server wiring without also describing gameplay orchestration
  - the turn pipeline can be exercised from a focused module boundary instead of only through inline route code
  - setup, state, and turn routes keep the current HTTP contract and debug payload shape
  - existing server tests still pass after the extraction
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/server/index.ts` mixing middleware, route registration, DB startup checks, turn orchestration, debug shaping, and shutdown helpers across the current entrypoint
  - the highest-risk hotspot is `/api/turn` in `src/server/index.ts`; upcoming `T07`, `T08`, `T09`, and `T10` should not add more behavior to that inline route
  - keep reusable gameplay logic out of `src/server/` when it does not need HTTP types
  - completed on 2026-03-08 by extracting the gameplay pipeline into `src/state/turn.ts`, moving the prompt to `src/ai/prompt.ts`, moving turn sanitizing to `src/state/turn-result.ts`, and registering thin setup, state, and turn handlers from `src/server/setup-route.ts`, `src/server/state-route.ts`, and `src/server/turn-route.ts`
  - `src/server/index.ts` now owns server startup, middleware, static hosting, route registration, and process shutdown wiring; the inline `/api/turn` orchestration was removed
  - request or response helper logic that still belongs to the transport layer now lives in `src/server/request-utils.ts`
  - validation on 2026-03-08 ran `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/server/http-contract.test.ts src/server/global-handler.test.ts src/server/host-preflight.test.ts src/server/runtime-preflight.test.ts src/server/setup-status.test.ts src/state/turn.test.ts`, and `docker compose run --rm --no-deps app npm test`

### T49 - App Shell Controller Extraction

- Status: Done
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Product/UI lead
- Goal: Keep `src/ui/app.ts` as a browser composition root by splitting session control, setup flow, and recovery action behavior into focused modules before save and onboarding work expands it further.
- Scope:
  - extract session or turn-flow state management out of `src/ui/app.ts` into focused UI modules
  - extract setup refresh or recovery-action behavior, including clipboard helpers, so rendering and control flow do not stay interleaved
  - keep `src/ui/app.ts` responsible for bootstrapping, DOM lookup, and top-level wiring only
  - preserve the current browser contract and user-visible flow while adding or tightening focused UI tests before moving behavior
- Files to Touch:
  - BACKLOG.md
  - src/ui/
- Do Not Touch:
  - src/server/
  - public/
  - data/spec/
- Dependencies:
  - T11a
  - T12c
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts`
  - `docker compose run --rm --no-deps app npm run build:client`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-setup-browser-smoke.ps1`
- Definition of Done:
  - `src/ui/app.ts` can be described as bootstrapping or wiring without also owning feature behavior
  - session flow, setup flow, and recovery-action logic each live behind focused UI module boundaries
  - current launch, resume, setup, and turn interactions still work without changing the HTTP contract
  - UI tests and the setup browser smoke path pass after the extraction
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/ui/app.ts` owning DOM lookup, app state, network calls, start or resume flow, assist debounce, pending-state policy, event binding, recovery copy actions, and fatal-error rendering
  - upcoming `T29` and `T34` should land on extracted controllers or view modules instead of extending the current file
  - preserve the existing `data-recovery-action` ids so current setup views stay compatible during the split
  - completed on 2026-03-08 by moving initial UI state creation into `src/ui/app-state.ts`, session and setup flow orchestration into `src/ui/session-controller.ts`, and recovery action handling into `src/ui/recovery-actions.ts`
  - `src/ui/app.ts` now owns DOM lookup, top-level render coordination, browser event wiring, clipboard fallback, and fatal-error rendering; launch, bootstrap, refresh, setup-check, and turn submission behavior were removed from the app shell
  - focused UI coverage now includes `src/ui/session-controller.test.ts` and `src/ui/recovery-actions.test.ts`
  - validation on 2026-03-08 ran `docker compose build app`, `docker compose run --rm --no-deps app npm run type-check`, `docker compose run --rm --no-deps app npx tsx --test src/ui/**/*.test.ts`, `docker compose run --rm --no-deps app npm run build:client`, `powershell -ExecutionPolicy Bypass -File scripts/test-setup-browser-smoke.ps1`, and `docker compose run --rm --no-deps app npm test`
  - the broader suite also required tightening `src/state/turn.test.ts` expectations so the extracted turn-service tests match the current server-side turn commit order and state-update payload shape

### T50 - Runtime Preflight Service Split

- Status: Ready
- Queue: Now
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Separate runtime preflight caching, HTTP probing, and issue classification so setup and packaged diagnostics can grow without turning one file into a protocol bucket.
- Scope:
  - split `src/server/runtime-preflight.ts` into focused modules for cache or service orchestration, JSON probe transport, and LiteLLM or model-issue classification
  - keep the public `createRuntimePreflightService` contract stable for existing callers
  - preserve the current issue codes, severity values, and recovery copy unless a test proves a bug
  - add or tighten focused tests before extraction so the current preflight contract stays locked
- Files to Touch:
  - BACKLOG.md
  - src/server/
- Do Not Touch:
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T02h
  - T12c
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/server/runtime-preflight.test.ts src/server/setup-status.test.ts src/server/host-preflight.test.ts`
- Definition of Done:
  - no single runtime-preflight file owns cache state, network probing, issue builders, and LiteLLM health parsing together
  - the setup status and runtime preflight payload shapes remain stable
  - extracted modules have focused tests that describe probe and classification behavior directly
  - later packaged prerequisite work can reuse the same preflight pieces without copying them
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/server/runtime-preflight.ts` combining service state, models probing, LiteLLM health probing, transport error classification, alias checks, and issue-shaping helpers
  - `T36b` and any future setup diagnostics work should build on extracted probe or classification modules instead of extending the current file
  - keep issue copy stable unless a concrete bug or mismatch is found during the test-first extraction

### T51 - Database Storage And Migration Boundary Split

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Split DB connection access, migration definitions, storage inspection, backup or reset helpers, and CLI dispatch into focused modules before replay and save-compatibility work deepens the storage layer.
- Scope:
  - extract migration definitions and migration-runner logic out of `src/core/db.ts`
  - extract storage health inspection, backup, and reset helpers so runtime callers do not import one mixed DB bucket
  - keep one stable public DB access surface for runtime modules that only need `getDb` or lifecycle helpers
  - add or tighten deterministic migration or reset checks before moving code so behavior stays stable
- Files to Touch:
  - BACKLOG.md
  - src/core/db.ts
  - src/core/db/
- Do Not Touch:
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T06
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx src/core/db.ts migrate`
  - `docker compose run --rm --no-deps app npx tsx src/core/db.ts reset`
- Definition of Done:
  - `src/core/db.ts` no longer owns runtime DB access, migrations, storage inspection, backup logic, and CLI command parsing together
  - migration and reset behavior still work through a documented command path
  - save or replay work can depend on focused DB modules instead of a catch-all storage file
  - the public runtime DB surface remains small and explicit
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/core/db.ts` combining singleton lifecycle, migration definitions, storage inspection, backup creation, file reset, env-path resolution, and CLI execution in one file
  - `T09` and `T46` will likely deepen this area; land the split before save or migration behavior grows further
  - avoid hiding new feature logic inside a replacement helper bucket under `src/core/db/`

### T52 - Validator Contract Module Split

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Split validator responsibilities by owning contract so schema, setup, and content validation stop accumulating in one file.
- Scope:
  - separate turn payload, authoritative state, setup or preflight, and content-spec validation into focused modules under `src/rules/`
  - keep a stable import surface for callers that do not need to know the new file layout
  - add or update focused tests so each validator module proves one contract area
  - avoid moving server or UI behavior into validator helpers during the split
- Files to Touch:
  - BACKLOG.md
  - src/rules/
- Do Not Touch:
  - src/server/
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T06
  - T12c
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/rules/validator.test.ts`
  - `docker compose run --rm --no-deps app npm test`
- Definition of Done:
  - no single validator file owns director or quest spec validation plus HTTP payload validation plus setup or preflight validation
  - callers can still import validators through one clear surface
  - tests map cleanly to the extracted contract areas
  - future schema tasks can add validation without reopening a mixed-purpose file
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/rules/validator.ts` mixing content-spec, turn-input, turn-output, authoritative-state, setup-status, and runtime-preflight validation
  - `T10`, `T16`, and `T19` should extend focused validator modules rather than the current catch-all file
  - keep contract-level error wording stable unless a failing test or schema mismatch requires a fix

### T53 - Launcher Entrypoint And Script Library Split

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P1
- Owner Role: Tech lead
- Goal: Keep `scripts/start-dev.ps1` orchestration-focused by moving preflight, Docker, port, and readiness implementation into reusable script-library modules before launcher and packaged-path work grows.
- Scope:
  - move reusable host preflight, Docker startup, port resolution, and readiness helpers out of `scripts/start-dev.ps1`
  - split `scripts/lib/shared.ps1` by concern instead of treating it as a second catch-all bucket
  - keep `scripts/start-dev.ps1` focused on sequencing the supported launcher path and reporting status
  - preserve the current GPU-first launcher contract and user-visible recovery copy while tightening any affected script checks first
- Files to Touch:
  - BACKLOG.md
  - scripts/start-dev.ps1
  - scripts/lib/
- Do Not Touch:
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T02h
  - T12c
- Validation:
  - `powershell -ExecutionPolicy Bypass -File scripts/start-dev.ps1 -NoBrowser`
  - `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1 -SelectionOnly`
- Definition of Done:
  - `scripts/start-dev.ps1` can be described as launcher sequencing without also describing all underlying preflight or Docker policy
  - shared script helpers are grouped by concern instead of one expanding library file
  - the supported launcher path still starts the GPU-backed Docker stack with the same recovery behavior
  - script changes are validated through the real launcher entrypoint, not only by reading helper code
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `scripts/start-dev.ps1` owning console formatting, preflight issue shaping, storage checks, port collision handling, Docker detection, NVIDIA detection, container startup, app readiness, and browser launch
  - the same audit found `scripts/lib/shared.ps1` mixing dotenv parsing, HTTP checks, GPU profile logic, path probes, and repo AI config resolution
  - `T36b` and later packaging work should build on split helpers rather than extending either current script bucket

### T54 - Setup View Model And Recovery Policy Split

- Status: Ready
- Queue: Next
- Phase: P1
- Priority: P2
- Owner Role: Product/UI lead
- Goal: Separate setup or preflight view-model building, DOM rendering, and recovery-action policy before more onboarding and packaged recovery UI work lands.
- Scope:
  - extract recovery-action policy out of `src/ui/setup-view.ts` so view decisions do not stay mixed with DOM rendering
  - split pure view-model builders from DOM renderers for the setup wizard and preflight panel
  - keep current setup copy, button ids, and browser interactions stable during the extraction
  - update focused UI tests first so the current setup surface remains locked
- Files to Touch:
  - BACKLOG.md
  - src/ui/setup-view.ts
  - src/ui/
- Do Not Touch:
  - src/server/
  - public/
  - data/spec/
- Dependencies:
  - T11a
  - T12c
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/ui/setup-view.test.ts src/ui/launch-view.test.ts src/ui/setup-browser-smoke.test.ts`
  - `docker compose run --rm --no-deps app npm run build:client`
- Definition of Done:
  - no single setup-view file owns view-model derivation, issue mapping, recovery policy, and DOM assembly together
  - current setup button ids and copy paths remain compatible with the app controller
  - the focused setup tests still pass after the split
  - future onboarding or packaged recovery work can extend focused modules instead of reopening one file
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/ui/setup-view.ts` combining setup wizard state mapping, preflight issue mapping, recovery-action classification, and DOM rendering
  - `T34` and `T36b` are likely to deepen this surface, so finish the split before those tasks add more UI behavior
  - preserve `data-recovery-action` ids during the extraction so the current click wiring stays stable

### T55 - Config Env Resolution And Diagnostics Split

- Status: Ready
- Queue: Later
- Phase: P2
- Priority: P2
- Owner Role: Tech lead
- Goal: Prevent config env resolution from becoming the default infrastructure bucket by separating env lookup, override diagnostics, and public runtime shaping before later runtime-config features expand it.
- Scope:
  - split `src/core/config/env.ts` into focused modules for env resolution, override diagnostics, and public runtime or local-GPU shaping
  - keep `loadConfig` as a thin orchestrator instead of the home for every config concern
  - preserve the current public diagnostics contract and local GPU runtime payload shape
  - extend focused config tests as needed before moving code
- Files to Touch:
  - BACKLOG.md
  - src/core/config/
  - src/core/config.ts
- Do Not Touch:
  - src/ui/
  - public/
  - data/spec/
- Dependencies:
  - T02h
- Validation:
  - `docker compose run --rm --no-deps app npm run type-check`
  - `docker compose run --rm --no-deps app npx tsx --test src/core/config.test.ts`
- Definition of Done:
  - no single env-config file owns provider inference, env resolution, override diagnostics, and runtime payload shaping together
  - `loadConfig` remains the stable entrypoint for callers
  - current config diagnostics and runtime payload tests still pass
  - later runtime-config work can add new concerns without reopening one large file
- Handoff Notes:
  - anti-monolith audit on 2026-03-08 found `src/core/config/env.ts` combining env var discovery, provider inference, config loading, profile override diagnostics, and local GPU runtime shaping
  - `T43` and `T44` will add more config surface area; land this split before config behavior starts spilling into another mixed-purpose file
  - keep the public diagnostics payload stable so setup and debug UI code do not need a concurrent contract rewrite

## Immediate Open Decisions

| ID | Decision | Needed By | Owner | Status |
| --- | --- | --- | --- | --- |
| D01 | Concrete default numeric budgets for latency, token use, cost, and DB growth in the configurable budget file | Phase 0 exit | Tech lead | Locked |
| D02 | Director spec format: JSON or YAML | Before T16 starts | Gameplay systems lead | Open |
| D03 | Sample MVP quest or story arc definition | Before Phase 1 exit | Product/UI lead | Open |
| D04 | MVP packaging shell: launcher-only, Tauri, or Electron | Before Phase 0 exit | Release lead | Locked |
| D05 | Default end-user AI setup: repo-managed LiteLLM Docker sidecar as the default control plane, with the GPU-backed Ollama launcher path as the normal local runtime contract | Before Phase 0 exit | Tech lead | Locked |
| D06 | MVP packaged AI runtime: require Docker Desktop for the LiteLLM sidecar, or stage the gateway another way while preserving the same app-facing contract | Before T36 starts | Release lead | Locked |
| D07 | Initial local GPU tier matrix: which VRAM tiers are officially supported first, and which model profiles map to them | Before T02h starts | AI systems lead | Locked |
| D08 | Preflight policy: which startup failures are blockers versus warnings versus info in end-user mode, and which actions can auto-fix safely | Before T01b starts | Tech lead | Locked |

## Agent Execution Rules

- Prefer the smallest task that unblocks the phase and removes the most player friction.
- Do not silently expand scope across multiple tasks.
- Do not mark a task `Done` without running its listed validation.
- If validation cannot be run, leave the task at `Review` and record exactly what is unverified.
- Update related docs in the same session when the task changes setup, scope, or behavior.
- If a task card is missing fields, repair the card before writing code.
- If the user request conflicts with the queue, follow the user request and then update this file to reflect reality.
- For AI-related work, require a test-first flow: add or tighten a test, fixture, replay case, or harness step before changing implementation, then run the focused check plus the relevant broader validation.
- For player-facing startup, setup, save or load, or packaging work, include a launcher or packaged-path smoke check whenever feasible.


