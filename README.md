# Text Game

A portable, text-based adventure with a director layer that nudges the story toward a defined end goal while letting the player attempt anything.

## Quick Start
1. Copy `.env.example` to `.env` and add your OpenAI API key.
2. Install dependencies and start the server.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Key Files
- `src/server.js` - API server and routing
- `src/ai.js` - OpenAI Responses API call + JSON schema
- `src/game.js` - State, memory, director updates + retrieval scoring
- `src/assist.js` - Local spellcheck + autocomplete
- `src/validator.js` - Spec and update validation
- `public/` - Web UI
- `ROADMAP.md` - Roadmap, tracker, blockers
- `AI_CONTROL.md` - Director/AI control system design
- `TOOLS.md` - Control endpoints and spec reloads

## Environment
- `OPENAI_API_KEY` - required
- `OPENAI_MODEL` - defaults to `gpt-4o-mini`
- `OPENAI_EMBEDDING_MODEL` - defaults to `text-embedding-3-small`

## Assist Endpoint
`POST /api/assist` returns lightweight, local spellcheck and autocomplete suggestions so you can reduce token use in the main model.
