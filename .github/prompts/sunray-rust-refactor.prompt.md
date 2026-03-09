---
name: "SunRay Rust Refactor"
description: "Prompt template for small, boundary-safe refactors in launcher/SunRay Rust code."
---

Scope
-----
Use this for Rust refactors inside `launcher/` such as extracting helpers, splitting modules, tightening error handling, or reorganizing command logic without changing the supported launcher contract.

Typical files
-------------
- `launcher/src/main.rs`
- `launcher/src/process.rs`
- `launcher/src/env.rs`
- `launcher/src/logging.rs`
- `launcher/src/error.rs`
- `launcher/src/config.rs`
- `launcher/README.md`

Hard constraints
----------------
- Keep the refactor minimal and focused.
- Preserve CLI behavior and command names unless explicitly allowed to change them.
- Do not widen scope into Docker, Electron, or TypeScript app changes.
- Prefer extracting reusable logic into focused modules over growing `main.rs`.
- Run `cargo check --manifest-path launcher/Cargo.toml`.
- Run `cargo test --manifest-path launcher/Cargo.toml`.
- If command behavior could be affected, run the relevant `cargo run --manifest-path launcher/Cargo.toml -- <subcommand>` path.

Prompt template
---------------
Task:
"""
<Brief summary of the SunRay refactor>

Details:
- What to change: <extract helper, rename module, move logic, simplify errors, tighten parsing>
- Files: <launcher files to update>
- Tests: <tests to add/update>
- Constraints / do not modify: <CLI semantics, user-facing output, non-launcher code>
"""

Assistant instructions
----------------------
1. Give a concise 2–3 bullet plan.
2. Keep the public command surface stable.
3. Add or update focused tests for the refactor.
4. Run the Cargo validation commands.
5. Return a short summary, validation results, and any remaining cleanup opportunities.

Example prompts
---------------
- "Task: Extract shared environment-loading logic from `main.rs` into `launcher/src/env.rs`. Details: keep CLI behavior unchanged and add unit tests for `.env` parsing edge cases. Files: `launcher/src/main.rs`, `launcher/src/env.rs`. Tests: add focused unit tests. Constraints / do not modify: subcommand names or any `src/` app code."
- "Task: Refactor SunRay error formatting. Details: centralize external-process failure messages into `launcher/src/error.rs` and preserve existing plain-language launcher output. Files: `launcher/src/error.rs`, `launcher/src/process.rs`, `launcher/src/main.rs`. Tests: add tests for formatted error text. Constraints / do not modify: Cargo dependencies unless necessary."
