import { QdrantClient } from "@qdrant/js-client-rest";
import type { Chunk } from "../../rag/core/chunk";

/**
 * The vector store: keeps one vector per chunk and finds the nearest ones to a
 * query vector. The demo uses Qdrant; the tests use a tiny in-memory version
 * of the same interface, which is also the simplest explanation of what a
 * vector database does.
 */
export interface StoredPoint {
  id: number; // Qdrant wants integer or UUID ids, so chunks are numbered
  vector: number[];
  payload: Chunk; // everything we want back with a hit: text, document, heading, tokens
}

export interface VectorStore {
  exists(): Promise<boolean>;
  /** Drop everything and prepare for vectors of the given size */
  reset(dimensions: number): Promise<void>;
  upsert(points: StoredPoint[]): Promise<void>;
  /** The k points closest to the vector, best first, with a similarity score */
  query(vector: number[], k: number): Promise<{ chunk: Chunk; score: number }[]>;
  count(): Promise<number>;
}

export function createQdrantStore({ url, collection }: { url: string; collection: string }): VectorStore {
  const client = new QdrantClient({ url });

  // Wrap every call so a Qdrant that is not running gives a message that says what to do
  const call = async <T>(what: string, run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      const message = (error as Error).message ?? String(error);
      throw new Error(`Qdrant ${what} failed at ${url}: ${message}. Is it running? Start it with "npm run up".`);
    }
  };

  return {
    exists: () => call("collection check", async () => (await client.collectionExists(collection)).exists),

    reset: (dimensions) =>
      call("collection create", async () => {
        if ((await client.collectionExists(collection)).exists) {
          await client.deleteCollection(collection);
        }
        // Cosine distance: only the direction of the vectors matters, not their length
        await client.createCollection(collection, { vectors: { size: dimensions, distance: "Cosine" } });
      }),

    upsert: (points) =>
      call("upsert", async () => {
        await client.upsert(collection, {
          wait: true,
          points: points.map(({ id, vector, payload }) => ({ id, vector, payload: { ...payload } })),
        });
      }),

    query: (vector, k) =>
      call("query", async () => {
        const { points } = await client.query(collection, { query: vector, limit: k, with_payload: true });
        return points.map((point) => ({ chunk: point.payload as unknown as Chunk, score: point.score }));
      }),

    count: () => call("count", async () => (await client.count(collection, { exact: true })).count),
  };
}

/**
 * The same interface without a database: an array and cosine similarity.
 * Used in tests, and handy to show what Qdrant does under the hood.
 */
export function createMemoryStore(): VectorStore {
  let points: StoredPoint[] = [];
  let ready = false;
  return {
    async exists() {
      return ready;
    },
    async reset() {
      points = [];
      ready = true;
    },
    async upsert(batch) {
      points.push(...batch);
    },
    async query(vector, k) {
      return points
        .map(({ payload, vector: stored }) => ({ chunk: payload, score: cosine(vector, stored) }))
        .sort((a, b) => b.score - a.score)
        .slice(0, k);
    },
    async count() {
      return points.length;
    },
  };
}

/** cos(angle between a and b): 1 = same direction, 0 = unrelated */
export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  return normA && normB ? dot / Math.sqrt(normA * normB) : 0;
}
