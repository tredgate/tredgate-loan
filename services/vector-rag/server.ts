import { createVectorApp } from "./app";
import { vectorConfig } from "./config";
import { createOllamaEmbedder } from "./embed";
import { createQdrantStore } from "./store";

// The vector RAG API: `npm run dev` (watch) or `npm start`
const log = (line: string) => console.log(`[vector] ${line}`);

const app = createVectorApp({
  docsRoot: vectorConfig.docsRoot,
  statePath: vectorConfig.statePath,
  embedder: createOllamaEmbedder({
    url: vectorConfig.ollamaUrl,
    model: vectorConfig.model,
    prefixes: vectorConfig.prefixes,
    batchSize: vectorConfig.batchSize,
    onProgress: (done, total) => log(`embedded ${done}/${total}`),
  }),
  store: createQdrantStore({ url: vectorConfig.qdrantUrl, collection: vectorConfig.collection }),
  ollamaUrl: vectorConfig.ollamaUrl,
  bm25IndexPath: vectorConfig.bm25IndexPath,
  defaultK: vectorConfig.defaultK,
  log,
});

app.listen(vectorConfig.port, (err?: Error) => {
  if (err) {
    console.error(`[vector] failed to start on port ${vectorConfig.port}: ${err.message}`);
    process.exit(1);
  }
  log(`vector search API listening on http://localhost:${vectorConfig.port}`);
  log(`model ${vectorConfig.model} via ${vectorConfig.ollamaUrl}, collection "${vectorConfig.collection}" in ${vectorConfig.qdrantUrl}`);
  log(`the first search indexes the handbook if needed; check GET /health`);
});
