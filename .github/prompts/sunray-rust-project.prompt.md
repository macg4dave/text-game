---
name: "SunRay Rust Project Assistant"
description: "Repository-aware prompt template for Rust changes in launcher/SunRay. Use for new subcommands, harness work, validators, process orchestration, and Rust-side tests in this repo."
---

Context
-------
- Project: `text-game`
- Rust crate: `launcher/Cargo.toml` (crate name `sunray`)
- Main Rust source: `launcher/src/`
- Primary validation: `cargo check --manifest-path launcher/Cargo.toml` and `cargo test --manifest-path launcher/Cargo.toml`
- Supported command surface:
  - `start-dev`
  - `test-local-ai-workflow`
  - `test-setup-browser-smoke`
  - `validate-local-gpu-profile-matrix`
  - `validate-litellm-default-config`
  - `start-desktop-prototype`

Project-specific constraints
----------------------------
- `SunRay` is an automation launcher and harness runtime only.
- Do not turn `SunRay` into a webview shell, installer, updater, package manager, Electron replacement, or app-runtime rewrite.
- Preserve command names and user-facing behavior unless explicitly allowed to change.
- Migrate one legacy script at a time: reach parity in Rust first, then delete the matching legacy script.
- Do not add new PowerShell, Bash, or batch automation.
- Reuse shared Rust modules for process execution, env loading, logging, config, and error shaping.
- Keep Docker, Node, npm, Electron, and the TypeScript app as invoked dependencies rather than reimplementing them in Rust.

Hard constraints
----------------
- Make the smallest possible change that solves the request.
- Add or update tests for any behavioral change.
- Run `cargo check --manifest-path launcher/Cargo.toml`.
- Run `cargo test --manifest-path launcher/Cargo.toml`.
- If a subcommand changes, run the matching `cargo run --manifest-path launcher/Cargo.toml -- <subcommand>` validation path too.
- Preserve public CLI semantics unless explicitly allowed to change them.
- Avoid removing features, tests, or migration notes without a replacement.

Prompt template
---------------
Task:
"""
<One-line summary of the requested SunRay Rust change>

Details:
- What to change: <behavior, module, command, or helper to add/update>
- Files to consider: <launcher/src/*.rs, launcher/Cargo.toml, launcher/README.md, README.md, BACKLOG.md>
- Tests/validation: <tests to add/update and command paths to run>
- Constraints / do not modify: <boundaries that must remain unchanged>
"""

Assistant instructions
----------------------
1. Explain the plan in 2–3 bullets.
2. Make the smallest possible Rust change consistent with repo boundaries.
3. Add or update focused tests for new behavior.
4. Run the required Cargo validation commands and any command-specific parity check.
5. If tests fail, iterate briefly and keep the fix scoped.
6. Return:
   - a short summary of changes with file paths
   - validation results
   - any follow-up needed before deleting legacy script surfaces

Example prompts
---------------
- "Task: Implement `validate-local-gpu-profile-matrix` in SunRay. Details: port the current matrix check from the legacy script into Rust, keep the failure messages readable, and add focused tests for malformed JSON. Files to consider: `launcher/src/main.rs`, `launcher/src/config.rs`, `launcher/src/error.rs`. Tests/validation: add unit tests plus run the validator subcommand. Constraints / do not modify: `docker-compose.yml`, `src/` application code."
- "Task: Add shared process-runner helper for SunRay. Details: extract common command invocation and output handling from multiple subcommands. Files to consider: `launcher/src/process.rs`, `launcher/src/main.rs`. Tests/validation: add unit tests for argument formatting and error wrapping. Constraints / do not modify: CLI names or launcher behavior."
