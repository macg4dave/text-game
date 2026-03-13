import "dotenv/config";
import process from "node:process";
import { getEmbedding } from "../src/ai/service.js";
import { getAiRouteSummary, loadConfig } from "../src/core/config.js";

const loaded = loadConfig(process.env);
const route = getAiRouteSummary(loaded);
const input = readArg("--input") || "Recall the route Nila Vale shared through Stormglass Causeway.";

if (route.provider !== "litellm") {
  throw new Error(
    `Expected AI_PROVIDER=litellm for this validation path, but found ${route.provider}. Route summary: ${JSON.stringify(route)}`
  );
}

const embedding = await getEmbedding({
  model: loaded.ai.embeddingModel,
  input
});

if (!Array.isArray(embedding) || embedding.length === 0) {
  throw new Error(
    `Embedding request returned no vector data for alias ${loaded.ai.embeddingModel}. Route summary: ${JSON.stringify(route)}`
  );
}

console.log(
  JSON.stringify(
    {
      route,
      input,
      embedding_length: embedding.length,
      embedding_preview: embedding.slice(0, 5)
    },
    null,
    2
  )
);

function readArg(name: string): string | null {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return null;
  }

  const value = process.argv[index + 1];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
