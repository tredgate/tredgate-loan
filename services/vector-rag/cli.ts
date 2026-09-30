import { vectorConfig } from "./config";
import { createOllamaEmbedder } from "./embed";
import { buildVectorIndex, ensureVectorIndex } from "./indexer";
import { compare, vectorSearch } from "./search";
import { createQdrantStore } from "./store";
import type { SearchResult } from "../../rag/core/search";

/**
 * Usage:
 *   npm run search -- "How much can be approved automatically?"   vector search, print the best chunks
 *   npm run search -- "..." --compare                              the same question through BM25 and vectors, side by side
 *   npm run search -- "..." --k 3 --json                           fewer chunks, machine-readable output
 *   npm run index                                                  re-embed the handbook into Qdrant
 */
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const query = args
  .filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--k")
  .join(" ")
  .trim();

const log = (line: string) => console.error(`[vector] ${line}`); // stderr, so --json output stays clean
const embedder = createOllamaEmbedder({
  url: vectorConfig.ollamaUrl,
  model: vectorConfig.model,
  prefixes: vectorConfig.prefixes,
  batchSize: vectorConfig.batchSize,
  onProgress: (done, total) => log(`embedded ${done}/${total}`),
});
const store = createQdrantStore({ url: vectorConfig.qdrantUrl, collection: vectorConfig.collection });
const indexer = { docsRoot: vectorConfig.docsRoot, statePath: vectorConfig.statePath, embedder, store, log };

if (flag("index")) {
  const state = await buildVectorIndex(indexer);
  console.log(
    `Indexed ${state.fileCount} files into ${state.chunkCount} vectors (${state.dimensions} dimensions, ~${state.totalTokens.toLocaleString()} tokens)`,
  );
  console.log(`Collection "${vectorConfig.collection}" in ${vectorConfig.qdrantUrl}, dashboard: ${vectorConfig.qdrantUrl}/dashboard`);
  process.exit(0);
}

if (!query) {
  console.error('Usage: npm run search -- "<question>" [--k 5] [--json] [--compare]');
  process.exit(1);
}

const { state, rebuilt } = await ensureVectorIndex(indexer);
const context = { embedder, store, state };
const k = Number(option("k") ?? vectorConfig.defaultK);

const printResults = (results: SearchResult[], full: boolean) => {
  for (const [i, { chunk, score }] of results.entries()) {
    console.log(`--- ${i + 1}. ${chunk.docId} · ${chunk.heading}  [${chunk.file}, score ${score}, ~${chunk.tokens} tokens]`);
    if (full) {
      console.log(chunk.text.trim());
      console.log();
    }
  }
};

if (flag("compare")) {
  const response = await compare(context, { docsRoot: vectorConfig.docsRoot, indexPath: vectorConfig.bm25IndexPath }, query, k);
  if (flag("json")) {
    console.log(JSON.stringify(response, null, 2));
    process.exit(0);
  }
  console.log(`Query: ${response.query}\n`);
  console.log("=== BM25 (keywords, rag/) ===");
  printResults(response.bm25, false);
  console.log(`\n=== Vectors (meaning, ${vectorConfig.model} + Qdrant) ===`);
  printResults(response.vector, false);
  process.exit(0);
}

const response = await vectorSearch(context, query, k);
if (flag("json")) {
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}

if (rebuilt) console.log("(index rebuilt because the documentation or the model changed)\n");
console.log(`Query: ${response.query}\n`);
printResults(response.results, true);
const r = response.report;
console.log("=== Token report (approximate) ===");
console.log(`Whole documentation: ${r.documentationTokens.toLocaleString()} tokens in ${r.fileCount} files (${r.chunkCount} chunks)`);
console.log(`Retrieved context:   ${r.retrievedTokens.toLocaleString()} tokens in ${r.retrievedCount} chunks`);
console.log(`Saved:               ${r.savedPercent}%`);
