import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { chunkDirectory, listMarkdownFiles } from "../../rag/core/chunk";
import type { Embedder } from "./embed";
import type { VectorStore } from "./store";

/**
 * Indexing = chunk, embed, store. The chunks are the same ones the BM25 tool
 * uses (rag/core/chunk.ts); only what happens to them afterwards differs.
 *
 * Qdrant keeps the vectors. This small state file remembers what they were
 * built from, so a changed handbook or a changed model triggers a rebuild.
 */
export interface VectorState {
  version: 1;
  builtAt: string;
  root: string;
  model: string;
  dimensions: number;
  fileCount: number;
  chunkCount: number;
  totalTokens: number; // estimated tokens of the whole documentation, for the token report
}

export interface IndexerOptions {
  docsRoot: string;
  statePath: string;
  embedder: Embedder;
  store: VectorStore;
  log?: (line: string) => void;
}

export async function buildVectorIndex({ docsRoot, statePath, embedder, store, log = () => {} }: IndexerOptions): Promise<VectorState> {
  const chunks = chunkDirectory(docsRoot);
  log(`embedding ${chunks.length} chunks with ${embedder.model} ...`);

  // The document title and heading are embedded together with the text, so a
  // section knows what it is about even when its own words are generic
  const texts = chunks.map((chunk) => `${chunk.docTitle} · ${chunk.heading}\n\n${chunk.text}`);
  const vectors = await embedder.embedDocuments(texts);
  const dimensions = vectors[0]?.length ?? 0;

  // Fresh collection, then all points in batches of 64
  await store.reset(dimensions);
  for (let start = 0; start < chunks.length; start += 64) {
    await store.upsert(
      chunks.slice(start, start + 64).map((chunk, i) => ({ id: start + i, vector: vectors[start + i]!, payload: chunk })),
    );
  }

  const state: VectorState = {
    version: 1,
    builtAt: new Date().toISOString(),
    root: docsRoot,
    model: embedder.model,
    dimensions,
    fileCount: listMarkdownFiles(docsRoot).length,
    chunkCount: chunks.length,
    totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
  };
  mkdirSync(path.dirname(statePath), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2));
  log(`indexed ${state.fileCount} files into ${state.chunkCount} vectors of ${dimensions} dimensions`);
  return state;
}

export function loadState(statePath: string): VectorState | undefined {
  if (!existsSync(statePath)) return undefined;
  return JSON.parse(readFileSync(statePath, "utf8")) as VectorState;
}

/** Stale when the handbook changed after indexing, or the index was built from another folder or model */
export function isStale(state: VectorState, docsRoot: string, model: string): boolean {
  if (state.version !== 1 || state.root !== docsRoot || state.model !== model) return true;
  if (!existsSync(docsRoot)) return true;
  const builtAt = Date.parse(state.builtAt);
  return listMarkdownFiles(docsRoot).some((file) => Math.floor(statSync(file).mtimeMs) > builtAt);
}

/** Use the existing index when it is current, rebuild otherwise */
export async function ensureVectorIndex(options: IndexerOptions): Promise<{ state: VectorState; rebuilt: boolean }> {
  const state = loadState(options.statePath);
  if (state && !isStale(state, options.docsRoot, options.embedder.model) && (await options.store.exists())) {
    return { state, rebuilt: false };
  }
  return { state: await buildVectorIndex(options), rebuilt: true };
}
