# Roadmap

This document is the strategic delivery plan for the project. It describes the intended product shape, the MVP boundary, the order of work, and the conditions for advancing between phases.

Kickoff-relative timing is used on purpose. "Week 1" means the first week active development begins after this roadmap is accepted.

## Current Status

- Roadmap baseline date: 2026-03-07
- Delivery status: pre-MVP
- Planning status: baselined, not yet tracked against phase exit gates

## Vision

Build a portable text-based adventure where players can act freely while a server-side director layer keeps the story coherent, state transitions deterministic, and long-running sessions manageable through compact memory.

## Product Outcomes

The roadmap is successful if the project reaches all of the following:

- A player can start a game, play multiple turns, save, load, and finish a guided story arc.
- The game state can be replayed from the event log with deterministic results.
- AI output is validated before it affects authoritative state.
- Content authors can change quests and director rules without code edits.
- The app can run in the browser first and be packaged for desktop later without a separate gameplay stack.

## MVP

### MVP Definition

The MVP is the first release that proves the core product loop:

- Start a new game with basic onboarding.
- Submit turns through the web UI.
- Generate structured responses through LiteLLM by default.
- Persist turns, state, and replayable events in SQLite.
- Enforce server-side validation and deterministic state updates.
- Retrieve compact memory summaries during play.
- Apply director rules to keep pacing and quest progression on track.
- Ship at least one playable quest/story arc end to end.

### MVP Exit Criteria

The MVP is complete only when all of the following are true:

- A new player can complete a scripted story arc without manual intervention.
- A golden replay fixture reproduces the same final state from the stored event log.
- Save and load work across at least one schema version change using documented migration rules.
- The default LiteLLM chat route and embedding route are both exercised in automated integration tests.
- Numeric budgets for latency, tokens per turn, and cost per 100 turns are recorded in [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md) and met in the MVP test fixture suite.
- The MVP scope in [BACKLOG.md](/g:/text-game/BACKLOG.md) has no open P1 items.

### Explicitly Out of Scope for MVP

- Desktop installers and auto-update flows
- Rich quest-authoring UX beyond the minimum needed to prove authorable content
- Optional Linux packaging
- Advanced theming beyond readability and accessibility requirements

## Phase Plan

Each phase below has a user-visible outcome, a clear owner role, and measurable gates. Detailed implementation tasks live in [BACKLOG.md](/g:/text-game/BACKLOG.md).

### Phase 0 - Foundations (Weeks 1-2)

Owner: Tech lead

Outcome:
- The repo can be cloned, configured, started, and reset repeatably by another developer.

Entry gate:
- Roadmap, requirements, and architecture docs accepted as the current baseline.

Exit gate:
- One documented command starts the server and web client in local development.
- One documented command resets the local database and seed content.
- Environment variables are validated at startup.
- Logging, migrations, and error handling are wired into the baseline app.
- LiteLLM default alias names for chat and embeddings are documented and exercised manually.
- Numeric delivery budgets are added to [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md).

### Phase 1 - First Playable Core Loop (Weeks 3-5)

Owner: Backend lead

Outcome:
- A player can create a new game, submit turns, and receive structured story responses in the browser.

Entry gate:
- Phase 0 exit gate met.

Exit gate:
- Turn input, turn output, and authoritative state schemas are versioned.
- A new game can be created and played for at least 10 scripted turns in a row.
- Every turn writes an event that can be replayed deterministically.
- Invalid or unsafe model output is rejected before state mutation.
- The default turn path uses LiteLLM without direct provider SDK usage outside the adapter boundary.
- A golden replay test passes in CI for the baseline quest fixture.

### Phase 2 - Memory and Director Control (Weeks 6-8)

Owner: AI systems lead

Outcome:
- The game can remember prior context compactly and the director can steer story beats without restarting the app.

Entry gate:
- Phase 1 exit gate met.

Exit gate:
- Retrieval returns ranked memory summaries for each turn.
- Director rules are loaded from versioned specs and can be reloaded without restart.
- Director enforcement runs server-side before authoritative state is committed.
- The embedding route, chat route, and fallback behavior are covered by integration tests.
- Token use for the baseline replay fixture stays within the documented budget.

### Phase 3 - Authorable Quests and World Tools (Weeks 9-12)

Owner: Gameplay systems lead

Outcome:
- Designers can define, validate, and inspect quests and world changes without editing core code.

Entry gate:
- Phase 2 exit gate met.

Exit gate:
- Quest specs validate against a versioned schema.
- Quest progression is visible in an admin surface or equivalent inspection tool.
- World state changes are diffable and replayable.
- A non-engineer can modify the sample quest content using documented tooling.

### Phase 4 - Reliability, Safety, and Operational Readiness (Weeks 13-15)

Owner: Platform lead

Outcome:
- The system is testable, observable, and resilient enough to support broader playtesting.

Entry gate:
- Phase 3 exit gate met.

Exit gate:
- Unit, integration, replay, and fuzz tests run in CI on every push.
- Telemetry captures latency, token usage, validation failures, retries, and model costs.
- Safety policy, redaction rules, and failure fallback behavior are documented and implemented.
- Backup, restore, and incident debugging steps are verified from the runbook.

### Phase 5 - Player Experience, Saves, and Accessibility (Weeks 16-18)

Owner: Product/UI lead

Outcome:
- The game is comfortable to play for repeat sessions and accessible enough for external testers.

Entry gate:
- Phase 4 exit gate met.

Exit gate:
- Save slots and import/export work with versioned compatibility checks.
- Keyboard navigation and contrast checks pass the documented accessibility checklist.
- Onboarding and tutorial flows exist for first-time players.
- The baseline playtest path meets the documented latency budget.

### Phase 6 - Packaging and Release (Weeks 19-22)

Owner: Release lead

Outcome:
- The web-first game can be distributed as a supported desktop build.

Entry gate:
- Phase 5 exit gate met.

Exit gate:
- Tauri vs Electron evaluation is documented with a final decision and rationale.
- Signed Windows and macOS builds are produced and tested.
- Installer, update, rollback, and release checklist steps are documented and rehearsed.
- Crash reporting is enabled for packaged builds.

## Sequencing Rules

- No phase may close with unresolved P1 items assigned to that phase in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- Save/load cannot be treated as stable until schema compatibility rules are documented and tested.
- Quest tooling cannot be treated as stable until director integration points and world-state boundaries are frozen for MVP.
- Packaging work must not force provider-specific gameplay logic into the app runtime.

## Now / Next / Later

### Now

- Finalize numeric engineering budgets and LiteLLM alias conventions.
- Stand up repeatable local development, migrations, and logging.
- Lock the schema boundaries needed for the first playable loop.

### Next

- Ship the deterministic turn pipeline.
- Add memory retrieval and director control.
- Prove one complete story arc end to end.

### Later

- Expand quest tooling and admin inspection.
- Harden operations and safety posture for playtesting.
- Package for desktop after the web-first loop is stable.

## Risks

| Risk | Owner | Mitigation | Review Trigger |
| --- | --- | --- | --- |
| Structured output through LiteLLM is less reliable than expected for the chosen upstream models. | AI systems lead | Maintain strict validation, fixture-based replay tests, and a fallback response path before state mutation. | First failed replay caused by model variance |
| Memory summaries exceed token budgets and make turns too expensive. | AI systems lead | Track summary size, cap retrieval inputs, and test against the baseline fixture budget before Phase 2 closes. | Budget breach in baseline fixture suite |
| Quest authoring becomes brittle because content rules are under-specified. | Gameplay systems lead | Publish schema examples, validation errors, and one worked sample quest before Phase 3 closes. | First quest change requiring code intervention |
| Save compatibility becomes expensive because versioning rules are delayed. | Tech lead | Freeze compatibility rules before Phase 5 implementation starts and require migration coverage in CI. | First incompatible save format change |
| Desktop release work stalls on signing and packaging constraints. | Release lead | Decide packaging stack in Phase 6 only after collecting signing prerequisites during Phase 4. | Missing signing prerequisites by start of Phase 6 |

## Decision Log

| Decision | Status | Owner | Rationale | Next Review |
| --- | --- | --- | --- | --- |
| Node.js backend with SQLite | Locked | Tech lead | Matches current project shape and keeps the first release operationally simple. | After MVP |
| Web frontend first | Locked | Product/UI lead | Preserves portability and reduces release complexity while the core loop is still changing. | After MVP |
| LiteLLM as the default AI interface | Locked | AI systems lead | Minimizes provider lock-in and keeps switching costs out of gameplay code. | End of Phase 2 |
| Provider-neutral internal adapter boundary | Locked | Tech lead | Prevents provider-specific logic from leaking across the app. | End of Phase 1 |
| Server-side director enforcement is authoritative | Locked | Gameplay systems lead | Keeps story control and state integrity outside the client. | After first external playtest |

## References

- Product scope: [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md)
- Detailed execution backlog: [BACKLOG.md](/g:/text-game/BACKLOG.md)
- Cross-cutting delivery policy: [ENGINEERING_STANDARDS.md](/g:/text-game/ENGINEERING_STANDARDS.md)
- Technical structure: [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md)
