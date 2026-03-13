# Tools and Control Endpoints

## Director Spec

- `GET /api/director/spec` returns the current director spec.
- `POST /api/director/reload` reloads `data/spec/director.json`.

## Quest Spec

- `GET /api/quests/spec` returns the current quest spec.
- `POST /api/quests/reload` reloads `data/spec/quests.json`.

## Notes

- Reload endpoints validate specs and return errors if invalid.
- Specs are used to steer AI behavior and enforce pacing rules.

## SunRay Note

- Shared launcher and harness logic lives under `launcher/src/`.
- Prefer extending `SunRay` modules instead of adding repo shell wrappers.
- Launcher-owned GPU profile data lives under `launcher/assets/`; use `LOCAL_GPU_PROFILE_ID` or `LOCAL_GPU_VRAM_GB` for manual overrides instead of forking launcher logic.
