# Packaging Prototype Decision Memo

## Goal

Pick the earliest Windows-first packaging direction that preserves the current browser-plus-server gameplay stack, reduces clean-machine playtest friction, and stays compatible with later installer work.

## Options Compared

| Option | Fit With Current Runtime | Clean-Machine Friction | Build Complexity | Packaging Readiness | Decision |
| --- | --- | --- | --- | --- | --- |
| Browser launcher only | Strong: already starts Docker and opens the UI | High: still depends on Docker Desktop, browser handoff, and external service awareness | Low | Good as a fallback launcher, weak as a packaged player path | Keep as fallback only |
| Tauri | Medium: can host a window, but the game still needs a Node server sidecar or a larger runtime rewrite | Medium for players, higher for contributors because Rust, WebView2, and native packaging prerequisites must be added | High right now | Better once the runtime is flatter and packaging is the main focus | Defer |
| Electron | Strong: wraps the existing local HTTP UI, can ship the Node-based server with the window, and keeps one gameplay stack | Medium: larger bundle, but no Rust toolchain and the shell can own startup and logs | Moderate | Best match for a thin Windows prototype that can grow into portable and installer builds | **Choose now** |

## Decision

Choose **Electron** as the packaging spike direction for Windows-first playtest builds.

Why this wins now:

- The current app is already a Node/Express server plus browser UI. Electron matches that architecture instead of fighting it.
- Electron can launch the compiled server with its bundled runtime, so the player does not need a separate local Node install for the packaged path.
- The same HTTP gameplay stack remains authoritative. No gameplay logic moves into the desktop shell.
- The gap from a dev prototype to a portable Windows build is smaller than the Tauri gap for this repo today.

Why not stop at the current launcher:

- The PowerShell launcher is a strong dev and recovery path, but it still depends on Docker Desktop and an external browser.
- That is not yet the clean-machine player experience described in the roadmap.

Why not Tauri yet:

- Tauri adds a Rust toolchain and Windows build prerequisites immediately.
- The repo would still need a sidecar strategy for the Node server or a larger runtime refactor before Tauri pays off.
- That makes it a better revisit candidate after the Windows packaging path is already stable, not the earliest spike.

## Prototype Shape

The prototype shell lives under `packaging/electron/` and works like this:

1. Build the existing TypeScript server and browser asset.
2. Start an Electron main process.
3. Mirror `dist/`, `public/`, and `data/spec/` into a writable runtime folder under Electron user data.
4. Copy `package.json` and link the packaged `node_modules/` into that runtime folder so the staged server keeps its runtime dependency graph.
5. Load configuration from `.env` if found beside the executable, in Electron user data, or in the repo root.
6. Start `dist/server.js` using Electron's bundled runtime with `ELECTRON_RUN_AS_NODE=1`.
7. Wait for `/api/state` readiness.
8. Open a native window pointed at the existing local HTTP UI.

This keeps the server authoritative and replayable while giving the player one obvious desktop action.

## Runtime File Implications

### Saves

- Prototype save path: `%APPDATA%\text-game\runtime\data\game.db` through Electron's `userData` folder.
- The shell copies only `data/spec/`; it does **not** overwrite `game.db` between launches.
- Follow-on task for T36: expose the exact user-facing save location in the app and recovery docs.

### Logs

- Prototype desktop-shell log: `%APPDATA%\text-game\logs\desktop-shell.log`.
- The shell pipes server stdout and stderr into that log so startup failures are captured without requiring a terminal.
- Follow-on task for T38: split player-safe logs from support logs and add rotation.

### AI Config

- Prototype `.env` search order:
  1. beside the packaged executable
  2. Electron `userData`
  3. repo root during development
- This is enough for the spike, but the packaged MVP still needs a first-run setup or repair path that avoids manual file editing.
- The existing browser preflight work remains the recovery surface after the shell starts.

## Clean-Machine Windows Smoke Checklist

Use this checklist for a dry run before T36 starts:

1. Confirm Windows opens the packaged app from one double-click action.
2. Confirm the first window appears without an already-open browser.
3. Confirm the shell creates writable runtime and log directories under the user's profile.
4. Confirm startup fails with a plain error if the local server cannot start.
5. Confirm a valid `.env` beside the executable is picked up without editing internal packaged files.
6. Confirm the browser UI preflight still reports missing API keys or unreachable AI endpoints in player language.
7. Confirm an existing save database survives closing and reopening the packaged shell.
8. Confirm the fallback local port behavior still works when the default port is busy.
9. Confirm the shell log captures server startup and shutdown lines.
10. Confirm the package can be deleted without leaving save data in the install directory.

## Open Blockers For T36 And T38

- App icons, signing, version metadata, and installer polish are intentionally deferred.
- The packaged MVP still needs a non-terminal config repair flow; `.env` discovery is only a bridge.
- Antivirus and SmartScreen behavior on unsigned Windows builds remains unknown.
- The current prototype packages the existing local server stack, but future telemetry and crash-reporting paths need explicit desktop ownership.

## Suggested Validation Once Tooling Is Available

- `docker compose build app`
- `docker compose run --rm app npm run desktop:prototype:dir`
- `npm run desktop:prototype:dev`
- `npm run desktop:prototype:dir`
- Dry-run the clean-machine checklist above on a Windows test box

## Validation Completed On 2026-03-08

- Built the unpacked Windows prototype with `npm run desktop:prototype:dir` on a host Windows temp validation copy using official Node `v22.22.1`.
- Launched `packaging/out/electron/win-unpacked/Text Game Prototype.exe` directly and confirmed it created `%APPDATA%\text-game\runtime\data\game.db` plus `%APPDATA%\text-game\logs\desktop-shell.log`.
- Confirmed the packaged shell read `.env` beside the executable, kept save data out of the install directory, and preserved the same DB across restart.
- Confirmed packaged startup preflight still blocked a missing API key through `/api/state`.
- Confirmed fallback port selection was exercised on this machine, choosing `3002` when lower local ports were already occupied.
