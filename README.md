# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

The project uses the OpenAI Node SDK through a provider-neutral config layer, so you can keep the same app code while swapping between providers that support OpenAI-compatible generation and embeddings endpoints.

## Quick Start

1. Copy `.env.example` to `.env` and choose either hosted API credentials or the local Ollama settings.
2. Install dependencies and start the server.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For a Windows-only local model setup, use [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).

For local AI regression checks, run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1`.

## Key Files

- `src/server.js` - API server and routing
- `src/config.js` - runtime config and provider-neutral AI settings
- `src/ai.js` - OpenAI-compatible chat completions + JSON schema
- `src/game.js` - State, memory, director updates + retrieval scoring
- `src/assist.js` - Local spellcheck + autocomplete
- `src/validator.js` - Spec and update validation
- `public/` - Web UI
- `ROADMAP.md` - Roadmap, tracker, blockers
- `AI_CONTROL.md` - Director/AI control system design
- `ARCHITECTURE.md` - provider strategy and integration direction
- `TOOLS.md` - Control endpoints and spec reloads

## Environment

- `AI_PROVIDER` - optional label; defaults to `openai-compatible`; supported repo presets are `openai-compatible`, `litellm`, and `ollama`
- `AI_API_KEY` - primary key for generic OpenAI-compatible mode
- `AI_BASE_URL` - optional; point this at any OpenAI-compatible provider endpoint
- `AI_CHAT_MODEL` - defaults to `gpt-4o-mini`
- `AI_EMBEDDING_MODEL` - defaults to `text-embedding-3-small`
- `LITELLM_PROXY_URL` - LiteLLM proxy URL when `AI_PROVIDER=litellm`
- `LITELLM_API_KEY` - LiteLLM proxy key; defaults to `anything` when unset
- `LITELLM_CHAT_MODEL` - LiteLLM chat alias; defaults to `game-chat`
- `LITELLM_EMBEDDING_MODEL` - LiteLLM embedding alias; defaults to `game-embedding`
- `OLLAMA_BASE_URL` - Ollama OpenAI-compatible base URL when `AI_PROVIDER=ollama`; defaults to `http://127.0.0.1:11434/v1`
- `OLLAMA_API_KEY` - optional Ollama key placeholder; defaults to `ollama`
- `OLLAMA_CHAT_MODEL` - Ollama chat model; defaults to `gemma3:4b`
- `OLLAMA_EMBEDDING_MODEL` - Ollama embedding model; defaults to `embeddinggemma`
- Legacy `OPENAI_*` env vars still work for backward compatibility

### Provider notes

- Default setup works with OpenAI directly.
- To use another OpenAI-compatible provider, set `AI_BASE_URL` and update the model names.
- For a local Windows smoke-test path, set `AI_PROVIDER=ollama` and follow [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md).
- Best compatibility comes from providers that support:
  - `POST /v1/chat/completions` or an equivalent compatible generation endpoint
  - JSON schema response formatting
  - embeddings endpoints for memory retrieval
- Examples of providers/gateways you can often target this way include OpenRouter, Together, Groq-compatible gateways, and local OpenAI-style gateways such as Ollama or LM Studio adapters.

If you want maximum provider portability, avoid provider-specific features in the main turn pipeline unless they are wrapped behind a fallback layer.

## LiteLLM

LiteLLM is now a first-class setup path for this project.

Recommended local setup:

1. Run a LiteLLM proxy and point it at your upstream model providers.
2. Use the included [litellm.config.yaml](./litellm.config.yaml) as a starting point.
3. Set `AI_PROVIDER=litellm` in `.env`.
4. Set `LITELLM_PROXY_URL=http://127.0.0.1:4000`.
5. Set `LITELLM_CHAT_MODEL=game-chat` and `LITELLM_EMBEDDING_MODEL=game-embedding`.

The runtime will automatically prefer LiteLLM-specific env vars when `AI_PROVIDER=litellm`, while still using the same game turn pipeline.

## Windows Local AI

The repo now includes an `ollama` preset intended for local smoke tests on Windows dev machines. It keeps the same OpenAI-compatible adapter boundary and only swaps config defaults:

- chat model default: `gemma3:4b`
- embedding model default: `embeddinggemma`
- base URL default: `http://127.0.0.1:11434/v1`

Setup steps and download links live in [setup_local_a.i.md](/g:/text-game/setup_local_a.i.md). Treat this path as a cheap local test harness, not as the default production-quality model setup.

## AI Workflow Test Loop

Use a test-first loop as the default workflow for prompt, schema, adapter, retrieval, and director-rule changes:

1. Add or tighten a test, fixture, replay case, or harness assertion that captures the desired behavior.
2. Run that focused check first so the missing behavior or coverage gap is visible.
3. Run `powershell -ExecutionPolicy Bypass -File scripts/test-local-ai-workflow.ps1` before changing AI behavior when a compatible local provider is available.
4. Make the smallest change.
5. Re-run the focused check, then re-run the same local AI harness immediately after the change.
6. Only move on to broader app testing after the focused check and harness both pass.

If `npm` is available on your machine, the same check is exposed as `npm run test:local-ai`.

## Assist Endpoint

`POST /api/assist` returns lightweight, local spellcheck and autocomplete suggestions so you can reduce token use in the main model.
