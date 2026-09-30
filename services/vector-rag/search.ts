import { ensureIndex } from "../../rag/core/index";
import { search as bm25Search, type SearchResponse, type SearchResult } from "../../rag/core/search";
import type { Embedder } from "./embed";
import type { VectorState } from "./indexer";
import type { VectorStore } from "./store";

/**
 * Retrieval with vectors: embed the question, ask the store for the nearest
 * chunks. The response has the same shape as the BM25 search, so any client
 * of the keyword API can talk to this one unchanged.
 */
export async function vectorSearch(
  { embedder, store, state }: { embedder: Embedder; store: VectorStore; state: VectorState },
  query: string,
  k = 5,
): Promise<SearchResponse> {
  const vector = await embedder.embedQuery(query);
  const hits = await store.query(vector, k);
  const results: SearchResult[] = hits.map(({ chunk, score }) => ({
    chunk,
    score: Math.round(score * 1000) / 1000, // cosine similarity, 1 = identical direction
  }));
  const retrievedTokens = results.reduce((sum, result) => sum + result.chunk.tokens, 0);
  return {
    query,
    results,
    report: {
      documentationTokens: state.totalTokens,
      retrievedTokens,
      savedPercent: state.totalTokens ? Math.round((1 - retrievedTokens / state.totalTokens) * 1000) / 10 : 0,
      fileCount: state.fileCount,
      chunkCount: state.chunkCount,
      retrievedCount: results.length,
    },
  };
}

export interface CompareResponse {
  query: string;
  bm25: SearchResult[]; // keyword ranking from rag/core (the tool participants use)
  vector: SearchResult[]; // this service
}

/** The same question through both retrievers, for the side-by-side demo */
export async function compare(
  context: { embedder: Embedder; store: VectorStore; state: VectorState },
  bm25: { docsRoot: string; indexPath: string },
  query: string,
  k = 5,
): Promise<CompareResponse> {
  const keyword = bm25Search(ensureIndex(bm25.docsRoot, bm25.indexPath).index, query, k);
  const semantic = await vectorSearch(context, query, k);
  return { query, bm25: keyword.results, vector: semantic.results };
}
