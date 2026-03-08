# Engineering Standards

This document holds the cross-cutting delivery rules for the project. It is intentionally operational and should change less often than the backlog but more often than the roadmap.
If an active standards-related task in [BACKLOG.md](/g:/text-game/BACKLOG.md) and this document disagree, treat the backlog as the execution source of truth and update this file to match.

## Definition of Done

A phase or backlog item is complete only when all relevant conditions below are met:

- Exit criteria are validated through tests or documented manual checks.
- `npm run type-check` passes for any task that changes TypeScript source, build scripts, or type-facing config.
- TypeScript source remains the only authoring source of truth. Generated JS assets and compiled output should be rebuilt or validated, not maintained as parallel hand-edited implementations.
- Schema changes include version updates and migrations where applicable.
- Replay-affecting changes include updated replay fixtures.
- Backlog state is updated in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- Scope or behavior changes are reflected in [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md).
- Setup, environment, or key path changes are reflected in [README.md](/g:/text-game/README.md).

## Delivery Budget Register

Numeric targets are required before Phase 0 closes. The source of truth for these defaults will be a server-side budget config file, and the same values should be adjustable from the web UI without code edits. The defaults below are now the Phase 0 baseline until later fixture data proves they should move.

| Metric | Target | Owner | Must Be Set By | Notes |
| --- | --- | --- | --- | --- |
| p95 `/api/turn` latency in local dev | 8 seconds | Tech lead | Phase 0 exit | Default comes from the budget config and is measured on the baseline fixture suite |
| Max total tokens per turn | 4,000 tokens | AI systems lead | Phase 0 exit | Default comes from the budget config; input plus output |
| Cost per 100 turns | $0.12 USD | AI systems lead | Phase 0 exit | Default comes from the budget config and is based on the LiteLLM-managed default aliases |
| Schema validation pass rate in CI fixtures | 100% | Tech lead | Phase 0 exit | Any failure blocks release progression |
| DB growth per 1,000 turns | 40 MB | Tech lead | Phase 0 exit | Default comes from the budget config; event log plus memory storage |

### Budget Baseline Assumptions

- The default budget model path is LiteLLM alias `game-chat` -> `gpt-4o-mini` and LiteLLM alias `game-embedding` -> `text-embedding-3-small`.
- Until `T43` and `T63a` land, treat the hot-context baseline as intentionally small: current scene, current goal, nearby world state, a few high-priority recalled facts, and only explicitly budgeted recent-event slices.
- The current implementation still uses fixed caps such as short-history entries, retrieved memories, summary lines, suggested options, and memory updates, but those are transitional guardrails rather than the long-term memory contract.
- The $0.12 per 100 turns budget assumes the prompt is kept comfortably under the 4,000-token ceiling on the default alias pair and leaves small headroom for embedding calls.
- The 40 MB per 1,000 turns budget assumes SQLite growth is dominated by event text plus JSON-serialized embedding vectors stored with memories; this target should be revisited once replay fixtures and save-slot usage are measured.

## Schema and Migration Policy

- All external payloads are versioned: turn input, turn output, and authoritative state.
- Backward compatibility rules must be written before save/load is implemented.
- SQLite schema changes are applied by migrations only.
- Any change that affects replay determinism requires a golden fixture update.
- Version compatibility for saves must be tested before Phase 5 can close.
- Replay-affecting storage must preserve committed semantic outcomes, authoritative transitions, and the ruleset or schema version needed to reproduce state without rerunning model generation.
- Canonical replay-event typing should use the versioned `committed-event/v1` contract, and transcript, prompt, or presentation fields must remain clearly supplementary to that canonical shape.

## Test Minimums

- TypeScript compile and `npm run type-check` must pass before unit, integration, or manual validation is counted as complete for TS changes
- Local development should execute the server directly from TypeScript, while Docker and launcher validation should exercise the compiled server output.
- Shared script behavior should be validated through the script entrypoints that consume it after helper changes, not only by reading the helper file in isolation.
- Unit tests for reducers, validators, ranking, and other pure functions
- Integration tests for the turn pipeline using fixtures
- Golden replay tests for deterministic scripted runs
- Replay-affecting persistence work should include a rerunnable local fixture path such as `npx tsx scripts/replay-fixture.ts`, not only ad hoc inspection.
- Replay tests must prove the final state can be reconstructed from committed event semantics even if raw model prose changes or is unavailable.
- Fuzz tests for validator and sanitizer inputs
- CI execution on every push by Phase 4
- Any change to AI prompts, schemas, model defaults, or adapter request shapes must run the local AI workflow harness before and after the change when a local compatible provider is available

## Script Maintainability Policy

- Reusable PowerShell logic belongs under `scripts/lib/`.
- Entry scripts should orchestrate shared helpers rather than redefine them.
- Cross-script concerns such as dotenv loading, config precedence, Docker invocation, readiness polling, and common error formatting should have one shared implementation whenever practical.
- Script output should stay easy to debug: prefer consistent step logging, clear failure messages, and one canonical place to change shared behavior.
- Treat mixed orchestration and implementation as a design defect. If an entry script starts owning reusable retry policy, environment resolution, port probing, readiness logic, or other shared behavior, move that logic into `scripts/lib/`.

## Responsibility Boundary Policy

- Design around responsibilities, not file length. Split when a file begins owning multiple layers or subordinate concerns, not only after it becomes large.
- Keep one layer per file: orchestration, domain logic, UI rendering, and transport or setup logic should not accumulate in the same module.
- Treat a new subordinate responsibility as an extraction trigger. If a file starts handling a distinct sub-problem with its own inputs, outputs, branching, or tests, give that behavior its own module.
- Treat reusable decision-making as an extraction trigger. If logic would be useful to another route, screen, script, or test, it should not stay inline in the current file by default.
- Composition roots must stay thin. `src/server/`, `src/ui/app.ts`, and entry scripts may assemble modules, but they should not become the home for feature behavior.
- UI modules should not own both page flow and distinct subview behavior. Extract panels, dialogs, setup steps, and turn surfaces once they become separate concerns.
- Server modules should not own gameplay, AI, validation, or state decisions that can live outside request parsing and HTTP shaping.
- Keep data shaping separate from presentation, and keep validation separate from authoritative mutation when both concerns appear in the same file.
- Do not let helper or utility files become catch-all buckets for unrelated logic from multiple domains.
- Review touched files with the sentence test: if the file's responsibility cannot be described in one sentence without the word `and`, split or extract before continuing.

## Authority Boundary Policy

- Treat model output as advisory until the server accepts it. Proposed state changes, quest progression, director progress, and memory facts must not become authoritative solely because the model emitted them.
- Transitional `turn-output/v1` field names such as `state_updates`, `director_updates`, and `memory_updates` must be treated as proposal slots only until a later schema revision renames them.
- Server-side validation and adjudication must run before any authoritative mutation, memory persistence, or player-facing turn finalization.
- Player-facing narrative and suggested options must be reconciled against committed state; if prose contradicts the accepted outcome, rewrite, trim, or reject it before returning it to the player.
- Turn-pipeline changes must include at least one deterministic rejection case where the model invents facts, implies unearned progress, or otherwise attempts authority drift.

## Agency And Pacing Policy

- Preserve player agency by separating attempt interpretation, simulation resolution, and pacing decisions instead of collapsing them into one model or director step.
- Plausibility and failure should be decided by simulation rules or server adjudication, not by beat order alone.
- Director rules should frame and capitalize on accepted outcomes after simulation, including when the player goes off the expected path.
- Tests for turn-pipeline or director changes should include at least one off-beat but plausible action that succeeds without forced beat advancement, and at least one implausible action that fails for simulation reasons rather than hidden pacing reasons.

## Memory Authority Policy

- Memory classes must be explicit and carry clear admission and retrieval rules rather than using one undifferentiated `fact` bucket.
- Only authority-relevant memory classes may participate in state-sensitive retrieval or downstream decision support, and even those memories must not override committed state.
- Flavor-oriented memories may support narration and continuity, but they must stay non-authoritative and be safe to drop, trim, or ignore without changing truth.
- Memory or retrieval changes should include tests or fixtures that prove flavor memories cannot smuggle new authoritative facts into gameplay decisions.

## NPC Memory Significance Policy

- Do not treat raw dialogue logs as durable NPC memory. Transcript retention exists for replay and debugging; durable NPC recall must come from committed structured encounter facts and server-owned significance scoring.
- NPC memory should use explicit tiers with sparse defaults. Cheap identity facts such as names may persist broadly, but richer summaries, relationship state, open threads, and retrieval priority require higher cumulative significance.
- Retrieval policy must keep NPC memory, world memory, player journal memory, and short-lived scene context separate enough that one pool cannot crowd out the others by default.
- NPC memory changes should include fixtures proving both that meaningful returning NPCs are recognized from committed facts and that irrelevant prior chat does not flood the turn context.

## Memory Storage Hierarchy Policy

- Keep semantic classes and storage tiers distinct. Class answers what a record means; storage tier answers how hot, compressed, or durable it should be.
- Treat live prompt context as a small hot layer, not as the primary storage surface. Everything not needed for the current turn should stay in durable storage.
- Default live context should be budgeted by bucket, with explicit slices for scene state, current goal, nearby world state, recalled quest or canon facts, NPC or relationship memory, and any approved recent-event window.
- Durable storage should stay legible as explicit buckets such as hard canon facts, quest or progression facts, relationship summaries, and cold history logs.
- Raw history or transcript text must stay cold by default. If a turn needs transcript recovery, the retrieval mode, reason, and budget should be explicit and inspectable.
- Run compression passes after scenes and larger recap merges after chapters or beats so hot memory sheds verbose dialogue quickly.
- Version summary and recap artifacts so they can be recomputed later from canonical records when extraction or summarization logic changes.
- Memory tooling must expose token accounting, prompt diffs, retrieval traces, and replay-oriented checks that explain what entered context and why.

## AI Schema Governance Policy

- Keep the model-facing turn schema compact and transport-oriented. Narrative, candidate actions, structured intents, and proposed deltas are preferred over scene-shaped contracts.
- Validators for turn-output payloads must reject extra scene, world, beat, pacing, or other design-shaped fields instead of silently tolerating schema creep.
- Do not encode gameplay rules, beat policy, quest semantics, or world-simulation logic into model schema shape when those concepts can live in validators, adjudication, reducers, or content specs.
- Treat new model-facing fields as requiring a transport justification. If the reason for a field is really game design or engine behavior, the change belongs outside the schema.
- Schema or prompt changes should include at least one deterministic check that rejects mixed-authority or over-modeled payloads before they reach authoritative mutation.

## AI Test-First Change Policy

- Treat AI-related work as test-based by default, not as prompt tinkering followed by hope.
- Treat TypeScript type safety as a guardrail, not a substitute for runtime validation.
- Before changing prompts, schemas, model defaults, adapter request shapes, retrieval logic, director rules, or validation behavior, first add or update at least one verification artifact that captures the intended behavior.
- Acceptable verification artifacts are:
  - a unit test for pure logic
  - an integration test using fixtures
  - a golden replay fixture
  - an extension to `scripts/test-local-ai-workflow.ps1` for provider-compatible contract checks
- The preferred loop is: define or tighten the expectation, run it to observe the current failure or gap, make the smallest implementation change, then re-run the focused check plus the relevant broader suite.
- If fully automated verification is not yet possible, add the smallest deterministic fixture or scripted harness step that proves the contract and record the limitation in [BACKLOG.md](/g:/text-game/BACKLOG.md).
- AI-related changes are not complete unless the changed behavior is covered by a test, fixture, or scripted harness path that another agent can re-run.
- Authority-boundary changes are not complete unless the test, fixture, or harness path proves at least one rejected model proposal does not leak into committed state, replay data, or player-facing narrative.

## Telemetry Contract

Each `/api/turn` should record, at minimum:

- request id
- player id or session id
- model alias
- retry count
- timeout path
- input tokens
- output tokens
- per-bucket context-entry accounting
- retrieval-trace or selection metadata sufficient to explain why context items were included
- latency
- validation errors
- state schema version
- output schema version

## Replay And Event Log Policy

- Treat the event log as a canonical semantic record of committed gameplay outcomes, not as a transcript-only debug stream.
- Player text and narrator prose may be stored for UX or debugging, but deterministic replay must depend on committed event semantics and authoritative transitions.
- Event-log design changes should decide explicitly which fields are canonical for replay, which are diagnostics only, and which version or ruleset marker is required to interpret them safely.
- The minimum canonical replay-event fields are: player attempt, accepted or rejected outcome, committed transitions, and the relevant event, turn-output, authoritative-state, and ruleset version markers.

## Operational Runbook Checklist

The runbook may live in this file or a dedicated operations document later, but the following content is mandatory before Phase 4 closes:

- local setup and reset steps
- backup and restore procedure
- event-log replay and bad-turn debugging steps
- incident checklist for model failures and timeouts
- release rollback notes for packaged builds

## Issue Intake And Documentation Sync Policy

- User-assigned future issues should be grounded against the current roadmap, backlog, dependencies, and open decisions before task authoring.
- Default non-trivial issue capture to one parent backlog item plus explicit child tasks. Use a single standalone task only when the issue is clearly small enough not to need decomposition.
- Future issues that are real but not implementation-ready must still be captured with explicit dependencies, `Blocked` status, queue placement, or an open decision instead of staying as undocumented notes.
- Each child task must name concrete validation, even when the work is planning-only or documentation-only.
- When an issue changes sequencing, user-visible scope, runtime boundaries, or delivery policy, sync the owning planning docs in the same session rather than treating `BACKLOG.md` as sufficient by itself.

## Documentation Ownership

| Document | Owner Role | Update Trigger |
| --- | --- | --- |
| [ROADMAP.md](/g:/text-game/ROADMAP.md) | Tech lead | Phase change, scope change, or milestone resequencing |
| [BACKLOG.md](/g:/text-game/BACKLOG.md) | Current phase owner | Any status, dependency, or priority change |
| [REQUIREMENTS.md](/g:/text-game/REQUIREMENTS.md) | Product/UI lead | User-visible behavior or scope change |
| [ARCHITECTURE.md](/g:/text-game/ARCHITECTURE.md) | Tech lead | Runtime boundary, module ownership, packaging-direction, or provider-boundary change |
| [README.md](/g:/text-game/README.md) | Tech lead | Setup or environment change |
