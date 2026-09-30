import { vectorConfig } from "./config";
import { ollamaStatus, pullModel } from "./embed";

// `npm run model:pull`: download the embedding model into Ollama (once, ~300 MB for nomic-embed-text)
const { ollamaUrl, model } = vectorConfig;
const status = await ollamaStatus(ollamaUrl, model);
if (!status.reachable) {
  console.error(`Cannot reach Ollama at ${ollamaUrl}: ${status.error}\nStart it with "npm run up" (or run Ollama natively) and try again.`);
  process.exit(1);
}
if (status.modelPresent) {
  console.log(`Model ${model} is already available in Ollama at ${ollamaUrl}`);
  process.exit(0);
}
console.log(`Pulling ${model} through Ollama at ${ollamaUrl} ... (this downloads the model once)`);
await pullModel(ollamaUrl, model);
console.log(`Done. ${model} is ready.`);
