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
3. Keep edits inside `Files to Touch` unless the task card is updated first.
4. Run the listed validation commands.
5. Update docs affected by the change.
6. Move the task to `Review` or `Done`.

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

## Project Constraints

- Keep the app provider-neutral internally even when LiteLLM is the default external interface.
- Keep authoritative state server-side and replayable.
- Validate AI output before state mutation.
- Prefer deterministic behavior and small, verifiable edits.
