# Roadmap

## Vision
Build a portable text-based adventure that gives players maximum freedom while a director layer steers toward a defined end goal using compact memory and structured state updates.

## Guiding Principles
- Deterministic state updates and replayable history.
- Safety and validation over raw model output.
- Authorable content with versioned schemas.
- Portability across web and desktop.
- Observability for token usage, latency, and failures.

## Project Standards (Cross-Cutting)

### Definition of Done (All Milestones)
Each milestone is considered complete only when:
- Exit criteria are met and validated (tests or documented manual checks).
- Any schema changes are versioned and migrations are included (if applicable).
- ROADMAP.md tracker rows are updated (status/notes/blockers).
- REQUIREMENTS.md is updated if scope/behavior changed.
- README.md is updated if setup, env vars, or key file paths changed.

### Budgets and Success Metrics
Define budgets early and treat them as acceptance criteria (especially M4/M5).
- **Latency**: p95 `/api/turn` under an agreed target on local dev.
- **Tokens/turn**: max input+output tokens per turn under an agreed budget.
- **Cost**: $/100 turns under an agreed budget (based on selected model).
- **Stability**: % of turns passing schema validation (target ~100% in CI fixtures).
- **DB growth**: event log + memories growth per 1k turns under an agreed limit.

### Schema Versioning and Migrations Policy
- All external payloads are versioned: turn input schema, turn output schema, state schema.
- Backward compatibility rules are explicit before Save/Export (M5) and Packaging (M6).
- SQLite schema changes are applied via migrations; avoid ad-hoc ALTERs in runtime.
- Any change that affects replay determinism must include a replay/golden fixture update.

### Test Strategy (Minimum)
- **Unit tests**: pure functions (reducers, validators, ranking).
- **Integration tests**: turn pipeline end-to-end with fixtures.
- **Golden replay fixtures**: scripted runs that must replay deterministically.
- **Fuzz tests**: validator/sanitizer inputs and adversarial outputs.

### Observability Event Contract (Minimum)
Each `/api/turn` should emit logs/telemetry with:
- request id, player id/session id
- model name, retries, timeout path
- tokens in/out, latency, validation errors
- state schema version + output schema version

### Operational Runbook (Living Docs)
Keep a short runbook up to date:
- local setup + reset DB steps
- backup/restore procedure
- how to replay an event log and debug a bad turn
- incident checklist for model failures/timeouts

## Milestone Order (High-Level)
1. M0 - Foundations and project scaffolding
2. M1 - Core loop and deterministic state
3. M2 - Memory and director layer
4. M3 - Quest system and world tools
5. M4 - Quality, safety, and observability hardening
6. M5 - UX polish, saves, and accessibility
7. M6 - Packaging and distribution

## Milestones (Detailed, Ordered With Blockers)

1. M0 - Foundations and Scaffolding (Target window: Feb 5-16, 2026)
Goal: Establish a clean, repeatable dev environment and baseline architecture.
Entry criteria: Repo initialized and local dev runs.
Exit criteria:
- Local dev server starts with one command.
- Basic health endpoint and UI shell render.
- Configuration and secrets management documented.
- Baseline linting and formatting are enforced.
Key tasks:
- Define runtime config shape and environment variables.
- Add logging primitives with log levels.
- Establish database migrations and seed flow.
- Add error boundary and global error handler.
- Document project structure and contribution workflow.
Deliverables:
- Config module, logging module, migration scripts.
- Developer setup docs and runbook.
Blockers:
- None.
Dependencies:
- None.
Validation:
- Smoke test script for server + UI boot.
Risks:
- Premature architecture decisions without feedback.

2. M1 - Core Loop v1 (Target window: Feb 17-Mar 10, 2026)
Goal: A complete player turn cycle with deterministic state writes and safe model output.
Entry criteria:
- M0 exit criteria met.
Exit criteria:
- Player can start a new game, submit a turn, and receive structured output.
- State persists to SQLite and can replay from event log.
- Output validation blocks malformed or unsafe content.
- Schema versioning exists for state and output payloads.
- New game onboarding captures player preferences and applies defaults to director settings.
Key tasks:
- Define turn input schema and response schema.
- Implement turn handler and model orchestration.
- Persist events with causal ordering and idempotency.
- Build a minimal UI loop with input, log, and options.
- Add new game bootstrap flow with player preference onboarding (story tone + playstyle).
- Add deterministic state reducer and replay tool.
- Add basic rate limiting and turn timeout handling.
Deliverables:
- API routes, state schema, UI shell, validator.
- Event log replay tool.
Blockers:
- Stable schema definitions.
- Deterministic reducer contract.
Dependencies:
- M0 logging and migrations.
Validation:
- Golden test replaying a scripted run.
- Schema validation tests for inputs and outputs.
Risks:
- Model output variance causing inconsistent state.

3. M2 - Memory and Director Layer (Target window: Mar 11-Mar 31, 2026)
Goal: Director steering with compact memory and beat enforcement.
Entry criteria:
- M1 exit criteria met.
Exit criteria:
- Memory retrieval returns top-k relevant summaries per turn.
- Director rules enforce pacing and quest beats server-side.
- Director spec reload works without restart.
- Summaries are compact and token usage stays within budget.
Key tasks:
- Add embedding pipeline and similarity search.
- Implement per-scene and per-quest summarizer jobs.
- Create director spec format with versioning.
- Enforce director constraints at turn resolution.
- Add admin endpoint for director reload and validation.
- Add fallback behavior for missing memory entries.
Deliverables:
- Embeddings and retrieval service.
- Director spec loader, validator, and enforcement module.
Blockers:
- M1 output schema stability.
- Summarization policy defined and approved.
Dependencies:
- M1 event log and state reducer.
Validation:
- Retrieval accuracy test using fixture scenes.
- Director enforcement integration tests.
Risks:
- Overly strict director rules reduce player agency.

4. M3 - Quest System and World Tools (Target window: Apr 1-Apr 30, 2026)
Goal: Authorable quests with tooling and live inspection.
Entry criteria:
- M2 exit criteria met.
Exit criteria:
- Quest specs validate and can be reloaded live.
- Admin UI can create and edit quests.
- World state changes are logged and replayable.
- Quest progress is visible in the admin UI.
Key tasks:
- Define quest schema and state transitions.
- Implement quest importer and exporter.
- Build quest editor UI with validation errors inline.
- Build world state inspector with diff view.
- Add quest triggers and hooks into the turn pipeline.
Deliverables:
- Quest editor and world state inspector UI.
- Quest tools for import/export.
Blockers:
- Director layer integration points defined.
- Stable world state schema.
Dependencies:
- M2 director enforcement and memory retrieval.
Validation:
- Quest lifecycle tests with scripted runs.
- Live reload tests for quest spec changes.
Risks:
- Quest specs become brittle without authoring guidance.

5. M4 - Quality, Safety, and Observability (Target window: May 1-May 31, 2026)
Goal: Harden the system for reliability and safe gameplay.
Entry criteria:
- M3 exit criteria met.
Exit criteria:
- Automated test suite covers core pipeline.
- Telemetry captures tokens, latency, errors, and costs.
- Safety filters and redaction are applied consistently.
- Backups and recovery procedures are documented.
Key tasks:
- Add unit and integration tests for turn pipeline.
- Add fuzz tests for output validation and sanitization.
- Add telemetry and budget alarms for token usage.
- Add audit log export and retention policy.
- Add graceful degradation for model failures.
Deliverables:
- Test suite and CI configuration.
- Telemetry dashboards and budget policy.
Blockers:
- Stable API surface for test harness.
- Defined safety policy and redaction rules.
Dependencies:
- M1 core loop and M2 director enforcement.
Validation:
- CI runs on every push with minimum coverage target.
- Chaos test that simulates model timeouts.
Risks:
- Telemetry costs and privacy implications.

6. M5 - UX Polish, Save/Load, and Accessibility (Target window: Jun 1-Jun 20, 2026)
Goal: A polished and accessible player experience.
Entry criteria:
- M4 exit criteria met.
Exit criteria:
- Save slots and import/export are complete.
- Keyboard navigation and contrast requirements met.
- Theming and typography are consistent and readable.
- Performance meets defined latency budget.
Key tasks:
- Add save slot UI and export/import flow.
- Add optional save encryption with passphrase.
- Apply accessibility audit fixes.
- Add player preference onboarding to guide story tone and playstyle.
- Add tutorial and onboarding flows.
- Add theme and typography pass with legibility checks.
Deliverables:
- Save/load UI and export/import tools.
- Accessibility report and fixes.
Blockers:
- Stable state versioning for save compatibility.
- Performance budget defined.
Dependencies:
- M1 state schema and M4 observability.
Validation:
- Manual accessibility checklist.
- Save/import compatibility tests.
Risks:
- Backward compatibility issues for older saves.

7. M6 - Packaging and Distribution (Target window: Jun 21-Jul 31, 2026)
Goal: Deliver desktop builds with installers and updates.
Entry criteria:
- M5 exit criteria met.
Exit criteria:
- Desktop wrapper builds on macOS and Windows.
- Installer and auto-update flow verified.
- Optional Linux build validated if supported.
- Release checklist and rollback plan documented.
Key tasks:
- Evaluate Tauri vs Electron with a small prototype.
- Configure build pipeline and signing requirements.
- Add auto-update channel and release notes flow.
- Add crash reporting for desktop builds.
Deliverables:
- Desktop builds and installer packages.
- Release process documentation.
Blockers:
- Platform signing credentials.
- Final UX and save format stability.
Dependencies:
- M5 UX and save/load completion.
Validation:
- Install/uninstall tests on macOS and Windows.
- Update test from previous version.
Risks:
- Packaging tool limitations or platform-specific bugs.

## Tracker (Ordered, Draft)
| ID | Milestone | Priority | Item | Status | Blocker | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| T01 | M0 | P1 | Dev environment bootstrap script | Planned | None | one-command setup |
| T02 | M0 | P1 | Config module with schema validation | Planned | None | env var validation |
| T03 | M0 | P2 | Logging with levels and redaction | Planned | None | structured logs |
| T04 | M0 | P2 | DB migrations + seed flow | Planned | None | minimal seed world |
| T05 | M0 | P3 | Error boundary + global handler | Planned | None | UI + API |
| T06 | M1 | P1 | Turn input/output schemas | Planned | T02 | versioned schemas |
| T07 | M1 | P1 | Turn handler + model orchestration | Planned | T06 | retry + timeout |
| T08 | M1 | P1 | Deterministic state reducer | Planned | T06 | idempotent |
| T09 | M1 | P1 | Event log persistence + replay | Planned | T04 | ordered events |
| T10 | M1 | P2 | Output validator and sanitizer | Planned | T06 | block unsafe text |
| T11 | M1 | P2 | Minimal UI loop | Planned | T06 | input + log |
| T12 | M1 | P2 | Player preference onboarding | Planned | T06 | story tone + playstyle |
| T12a | M1 | P3 | Rate limiting + abuse guard | Planned | T07 | per session |
| T13 | M2 | P1 | Embeddings pipeline | Planned | T07 | batch + cache |
| T14 | M2 | P1 | Retrieval and top-k ranking | Planned | T13 | cosine similarity |
| T15 | M2 | P1 | Memory summarizer job | Planned | T09 | compact per scene |
| T16 | M2 | P1 | Director spec format + versioning | Planned | T06 | JSON or YAML |
| T17 | M2 | P1 | Director enforcement in turn pipeline | Planned | T16 | server-side |
| T18 | M2 | P2 | Director reload endpoint | Planned | T16 | live reload |
| T19 | M3 | P1 | Quest schema + validation | Planned | T16 | quest state rules |
| T20 | M3 | P1 | Quest state transitions | Planned | T19 | deterministic |
| T21 | M3 | P2 | Quest editor UI | Planned | T19 | inline validation |
| T22 | M3 | P2 | World state inspector UI | Planned | T20 | diff view |
| T23 | M3 | P2 | Quest import/export | Planned | T19 | JSON I/O |
| T24 | M4 | P1 | Core pipeline tests | Planned | T07 | unit + integration |
| T25 | M4 | P1 | Fuzz tests for validator | Planned | T10 | safety focus |
| T26 | M4 | P1 | Telemetry for tokens + latency | Planned | T07 | budget alarms |
| T27 | M4 | P2 | Audit log export | Planned | T09 | retention policy |
| T28 | M4 | P2 | Model failure fallback | Planned | T07 | safe degrade |
| T29 | M5 | P1 | Save slots UI | Planned | T08 | multiple slots |
| T30 | M5 | P2 | Save import/export | Planned | T29 | versioned format |
| T31 | M5 | P2 | Optional save encryption | Planned | T29 | passphrase |
| T32 | M5 | P2 | Accessibility pass | Planned | T11 | keyboard + contrast |
| T33 | M5 | P3 | Theme + typography pass | Planned | T11 | legibility |
| T34 | M5 | P3 | Onboarding tutorial | Planned | T11 | first-run guide |
| T35 | M6 | P1 | Wrapper prototype (Tauri/Electron) | Planned | T33 | evaluate tradeoffs |
| T36 | M6 | P1 | macOS + Windows builds | Planned | T35 | signing needed |
| T37 | M6 | P2 | Auto-update channel | Planned | T36 | update flow |
| T38 | M6 | P2 | Installer packaging | Planned | T36 | rollback plan |
| T39 | M6 | P3 | Linux build (optional) | Planned | T35 | if supported |
| T40 | M6 | P3 | Release checklist | Planned | T36 | QA gate |

## P1-P4 Priority List
P1. Core loop, state, director steering, stable JSON outputs
P2. Memory retrieval, quest tooling, safety rails
P3. Save/load, export, polish, accessibility
P4. Desktop packaging and distribution

## Blockers (Global)
- Stable schema versioning is required before save/export and desktop releases.
- Director spec must be stable before quest tools can finalize.
- Observability must be in place before UX performance targets are enforced.

## Risks
- Prompt drift could weaken the director layer without tight schema checks.
- Token usage could spike if summaries are not compact.
- Quest authoring could become brittle without strong validation and tooling.
- Save/import formats could ossify without early versioning.
- Desktop distribution can stall on platform signing requirements.

## Decisions Locked
- Node.js backend + SQLite.
- Web frontend for portability.
- OpenAI Responses API + structured outputs.
- Server-side director enforcement remains authoritative.
