import express, { type NextFunction, type Request, type Response } from "express";
import { ollamaStatus, type Embedder } from "./embed";
import { buildVectorIndex, ensureVectorIndex, loadState, type VectorState } from "./indexer";
import { compare, vectorSearch } from "./search";
import type { VectorStore } from "./store";

export interface VectorAppOptions {
  docsRoot: string;
  statePath: string;
  embedder: Embedder;
  store: VectorStore;
  ollamaUrl?: string; // for /health only
  bm25IndexPath?: string; // for /compare
  defaultK?: number;
  log?: (line: string) => void;
}

const USAGE = `Tredgate Loan documentation search (vector RAG demo: Ollama embeddings + Qdrant)

GET  /health                  -> { ok, ollama, qdrant, indexed, model, files, chunks, documentationTokens, indexedAt }
GET  /search?q=<text>&k=<n>   -> same shape as the BM25 API on port 3001: { query, results: [{ chunk, score }], report }
GET  /compare?q=<text>&k=<n>  -> { query, bm25: [...], vector: [...] }  the same question through both retrievers
POST /reindex                 -> re-embeds the handbook and rebuilds the Qdrant collection

Example: curl "http://localhost:3002/compare?q=how+big+a+loan+can+be+green-lit+without+a+human&k=3"
Scores are cosine similarities (1 = identical meaning); BM25 scores are keyword weights, so compare ranks, not numbers.
`;

/**
 * The HTTP API. Same routes as rag/app.ts plus /compare. The embedder and the
 * store are passed in, so tests can run it without Ollama and Qdrant.
 */
export function createVectorApp({
  docsRoot,
  statePath,
  embedder,
  store,
  ollamaUrl,
  bm25IndexPath,
  defaultK = 5,
  log = () => {},
}: VectorAppOptions) {
  const app = express();
  let state: VectorState | undefined;
  let indexing: Promise<VectorState> | undefined; // one rebuild at a time, concurrent requests wait for it

  const indexerOptions = { docsRoot, statePath, embedder, store, log };

  const getState = async (): Promise<VectorState> => {
    if (!indexing) {
      indexing = ensureVectorIndex(indexerOptions).then((result) => {
        state = result.state;
        indexing = undefined;
        return state;
      });
    }
    return indexing;
  };

  const readK = (req: Request): number | undefined => {
    const k = req.query.k === undefined ? defaultK : Number(req.query.k);
    return Number.isInteger(k) && k >= 1 && k <= 20 ? k : undefined;
  };

  const readQuery = (req: Request, res: Response): { q: string; k: number } | undefined => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    if (!q) {
      res.status(400).json({ error: "Missing query parameter q" });
      return undefined;
    }
    const k = readK(req);
    if (k === undefined) {
      res.status(400).json({ error: "k must be a whole number between 1 and 20" });
      return undefined;
    }
    return { q, k };
  };

  app.get("/", (_req, res) => {
    res.type("text/plain").send(USAGE);
  });

  // Cheap: reports what is running and what was indexed, never triggers indexing
  app.get("/health", async (_req, res) => {
    const ollama = ollamaUrl ? await ollamaStatus(ollamaUrl, embedder.model) : { reachable: true, modelPresent: true };
    let qdrant: { reachable: boolean; collection: boolean; error?: string };
    try {
      qdrant = { reachable: true, collection: await store.exists() };
    } catch (error) {
      qdrant = { reachable: false, collection: false, error: (error as Error).message };
    }
    const current = state ?? loadState(statePath);
    res.json({
      ok: ollama.reachable && ollama.modelPresent && qdrant.reachable,
      ollama,
      qdrant,
      indexed: Boolean(current) && qdrant.collection,
      model: embedder.model,
      files: current?.fileCount ?? 0,
      chunks: current?.chunkCount ?? 0,
      dimensions: current?.dimensions ?? 0,
      documentationTokens: current?.totalTokens ?? 0,
      indexedAt: current?.builtAt ?? null,
    });
  });

  app.get("/search", async (req, res) => {
    const params = readQuery(req, res);
    if (!params) return;
    const response = await vectorSearch({ embedder, store, state: await getState() }, params.q, params.k);
    log(`search "${params.q}" k=${params.k} -> ${response.results.length} chunks, ${response.report.retrievedTokens} tokens`);
    res.json(response);
  });

  app.get("/compare", async (req, res) => {
    const params = readQuery(req, res);
    if (!params) return;
    if (!bm25IndexPath) {
      res.status(404).json({ error: "compare is not configured" });
      return;
    }
    const context = { embedder, store, state: await getState() };
    const response = await compare(context, { docsRoot, indexPath: bm25IndexPath }, params.q, params.k);
    log(`compare "${params.q}" k=${params.k}`);
    res.json(response);
  });

  app.post("/reindex", async (_req, res) => {
    if (!indexing) {
      indexing = buildVectorIndex(indexerOptions).then((result) => {
        state = result;
        indexing = undefined;
        return result;
      });
    }
    const result = await indexing;
    res.json({ ok: true, files: result.fileCount, chunks: result.chunkCount, dimensions: result.dimensions, documentationTokens: result.totalTokens });
  });

  // Ollama or Qdrant not reachable, model missing, ...: say so instead of a bare 500
  app.use((error: Error, _req: Request, res: Response, _next: NextFunction) => {
    log(`error: ${error.message}`);
    res.status(503).json({ error: error.message });
  });

  return app;
}
