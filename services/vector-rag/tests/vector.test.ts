import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { createVectorApp } from "../app";
import type { Embedder } from "../embed";
import { createOllamaEmbedder, ollamaStatus } from "../embed";
import { buildVectorIndex, ensureVectorIndex } from "../indexer";
import { vectorSearch } from "../search";
import { cosine, createMemoryStore, createQdrantStore } from "../store";
import type { CompareResponse } from "../search";
import type { SearchResponse } from "../../../rag/core/search";

const policy = `---
id: POL-040
title: Automated Decisioning
section: Policy
---

## The standard risk envelope

Approved automatically when amount is at most 100,000 USD and term at most 60 months.
`;
const runbook = `---
id: RB-004
title: Port Already in Use
section: Runbooks
---

## Symptoms

The process logs EADDRINUSE and exits with code 1.
`;

/**
 * A stand-in for the embedding model: a bag-of-words vector over a fixed
 * vocabulary. Deterministic, instant, and enough to test the plumbing.
 */
const VOCAB = ["approved", "automatically", "amount", "term", "port", "eaddrinuse", "exits", "printer", "fire"];
const fakeEmbedder: Embedder = {
  model: "fake-bag-of-words",
  async embedDocuments(texts) {
    return texts.map(toVector);
  },
  async embedQuery(text) {
    return toVector(text);
  },
};
function toVector(text: string): number[] {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return VOCAB.map((term) => words.filter((w) => w === term).length);
}

function writeDocs(): string {
  const root = mkdtempSync(path.join(tmpdir(), "vector-docs-"));
  writeFileSync(path.join(root, "POL-040.md"), policy);
  writeFileSync(path.join(root, "RB-004.md"), runbook);
  return root;
}

describe("cosine similarity", () => {
  it("is 1 for the same direction, 0 for orthogonal vectors", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBe(0);
    expect(cosine([0, 0], [1, 1])).toBe(0);
  });
});

describe("vector indexing and search (in-memory store)", () => {
  it("embeds every chunk, finds the closest one and reports token savings", async () => {
    const docsRoot = writeDocs();
    const store = createMemoryStore();
    const statePath = path.join(docsRoot, ".cache", "state.json");
    const state = await buildVectorIndex({ docsRoot, statePath, embedder: fakeEmbedder, store });
    expect(state).toMatchObject({ fileCount: 2, chunkCount: 2, dimensions: VOCAB.length, model: "fake-bag-of-words" });
    expect(await store.count()).toBe(2);

    const context = { embedder: fakeEmbedder, store, state };
    const approval = await vectorSearch(context, "what amount is approved automatically", 1);
    expect(approval.results[0]?.chunk.docId).toBe("POL-040");
    expect(approval.results[0]?.score).toBeGreaterThan(0);
    expect(approval.report.retrievedTokens).toBe(approval.results[0]?.chunk.tokens);
    expect(approval.report.documentationTokens).toBe(state.totalTokens);

    const port = await vectorSearch(context, "port eaddrinuse", 1);
    expect(port.results[0]?.chunk.docId).toBe("RB-004");
  });

  it("reuses the index until the documentation or the model changes", async () => {
    const docsRoot = writeDocs();
    const store = createMemoryStore();
    const statePath = path.join(docsRoot, ".cache", "state.json");
    const options = { docsRoot, statePath, embedder: fakeEmbedder, store };
    expect((await ensureVectorIndex(options)).rebuilt).toBe(true);
    expect((await ensureVectorIndex(options)).rebuilt).toBe(false);
    const otherModel = { ...fakeEmbedder, model: "another-model" };
    expect((await ensureVectorIndex({ ...options, embedder: otherModel })).rebuilt).toBe(true);
  });
});

describe("vector HTTP API (in-memory store)", () => {
  let server: Server;
  let baseUrl: string;
  let docsRoot: string;

  beforeAll(async () => {
    docsRoot = writeDocs();
    const app = createVectorApp({
      docsRoot,
      statePath: path.join(docsRoot, ".cache", "state.json"),
      bm25IndexPath: path.join(docsRoot, ".cache", "bm25.json"),
      embedder: fakeEmbedder,
      store: createMemoryStore(),
    });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
  });

  it("describes itself at / and reports health without indexing", async () => {
    expect(await (await fetch(`${baseUrl}/`)).text()).toContain("GET  /compare");
    const health = (await (await fetch(`${baseUrl}/health`)).json()) as { ok: boolean; indexed: boolean };
    expect(health.ok).toBe(true);
    expect(health.indexed).toBe(false);
  });

  it("indexes on the first search and returns the BM25-compatible shape", async () => {
    const response = await fetch(`${baseUrl}/search?q=${encodeURIComponent("amount approved automatically")}&k=2`);
    expect(response.status).toBe(200);
    const body = (await response.json()) as SearchResponse;
    expect(body.results[0]?.chunk).toMatchObject({ docId: "POL-040", heading: "The standard risk envelope" });
    expect(body.report.chunkCount).toBe(2);
    const health = (await (await fetch(`${baseUrl}/health`)).json()) as { indexed: boolean; chunks: number };
    expect(health).toMatchObject({ indexed: true, chunks: 2 });
  });

  it("compares BM25 and vectors for the same question", async () => {
    const body = (await (await fetch(`${baseUrl}/compare?q=port+already+in+use&k=1`)).json()) as CompareResponse;
    expect(body.bm25[0]?.chunk.docId).toBe("RB-004");
    expect(body.vector[0]?.chunk.docId).toBe("RB-004");
  });

  it("rejects a missing query and an invalid k with 400", async () => {
    expect((await fetch(`${baseUrl}/search`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/search?q=x&k=0`)).status).toBe(400);
    expect((await fetch(`${baseUrl}/compare?q=x&k=abc`)).status).toBe(400);
  });

  it("reindexes on request and picks up new documents", async () => {
    writeFileSync(path.join(docsRoot, "KI-009.md"), "---\nid: KI-009\ntitle: Printer on fire\n---\n\n## Summary\n\nThe branch printer caught fire.\n");
    const body = (await (await fetch(`${baseUrl}/reindex`, { method: "POST" })).json()) as { ok: boolean; chunks: number };
    expect(body).toMatchObject({ ok: true, chunks: 3 });
    const found = (await (await fetch(`${baseUrl}/search?q=printer+fire&k=1`)).json()) as SearchResponse;
    expect(found.results[0]?.chunk.docId).toBe("KI-009");
  });

  it("answers 503 with the reason when the embedder fails", async () => {
    const broken: Embedder = {
      model: "broken",
      embedDocuments: async () => {
        throw new Error("Cannot reach Ollama");
      },
      embedQuery: async () => {
        throw new Error("Cannot reach Ollama");
      },
    };
    const root = writeDocs();
    const app = createVectorApp({ docsRoot: root, statePath: path.join(root, "state.json"), embedder: broken, store: createMemoryStore() });
    const s = await new Promise<Server>((resolve) => {
      const instance = app.listen(0, () => resolve(instance));
    });
    const response = await fetch(`http://127.0.0.1:${(s.address() as AddressInfo).port}/search?q=x`);
    expect(response.status).toBe(503);
    expect(((await response.json()) as { error: string }).error).toContain("Ollama");
    await new Promise<void>((resolve) => s.close(() => resolve()));
  });
});

/**
 * Against the real services, only when they are running (npm run up, npm run model:pull).
 * Uses its own collection so the demo data is untouched.
 */
const OLLAMA = process.env.OLLAMA_URL ?? "http://localhost:11434";
const QDRANT = process.env.QDRANT_URL ?? "http://localhost:6333";
const MODEL = process.env.EMBED_MODEL ?? "nomic-embed-text";
const live = await (async () => {
  const ollama = await ollamaStatus(OLLAMA, MODEL);
  if (!ollama.reachable || !ollama.modelPresent) return false;
  try {
    return (await fetch(QDRANT, { signal: AbortSignal.timeout(1000) })).ok;
  } catch {
    return false;
  }
})();

describe.skipIf(!live)("with Ollama and Qdrant running", () => {
  it("finds the right section for a paraphrase that shares no words with it", async () => {
    const docsRoot = writeDocs();
    const embedder = createOllamaEmbedder({
      url: OLLAMA,
      model: MODEL,
      prefixes: { document: "search_document: ", query: "search_query: " },
    });
    const store = createQdrantStore({ url: QDRANT, collection: "tredgate-vector-test" });
    const state = await buildVectorIndex({ docsRoot, statePath: path.join(docsRoot, "state.json"), embedder, store });
    expect(state.dimensions).toBeGreaterThan(100);
    expect(await store.count()).toBe(2);

    const response = await vectorSearch({ embedder, store, state }, "how big a loan can the system green-light on its own", 1);
    expect(response.results[0]?.chunk.docId).toBe("POL-040");
    const crash = await vectorSearch({ embedder, store, state }, "the server refuses to start because something else listens there", 1);
    expect(crash.results[0]?.chunk.docId).toBe("RB-004");
  }, 60_000);
});
