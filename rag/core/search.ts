import type { Chunk } from "./chunk";
import { tokenize, type SearchIndex } from "./index";

export interface SearchResult {
  chunk: Chunk;
  score: number;
}

/**
 * How many tokens the retrieved chunks cost compared with sending everything
 */
export interface TokenReport {
  documentationTokens: number;
  retrievedTokens: number;
  savedPercent: number;
  fileCount: number;
  chunkCount: number;
  retrievedCount: number;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  report: TokenReport;
}

// Standard BM25 parameters
const K1 = 1.2; // BM25 term frequency saturation parameter - controls how quickly the term frequency contribution saturates
const B = 0.75; // BM25 length normalization parameter - controls the impact of document length on the score

/**
 * Rank chunks with BM25 and return the top `k` with a token report. This is the core of the BM25-based search functionality including the formulas used to compute relevance scores for each chunk.
 *
 * @param index The search index containing the chunks and term statistics
 * @param query The search query string
 * @param k The number of top results to return
 * @returns The search response containing the top `k` results and a token report
 */
export function search(
  index: SearchIndex,
  query: string,
  k = 5,
): SearchResponse {
  // queryTerms = unique, tokenized terms from the query string
  const queryTerms = [...new Set(tokenize(query))];
  // n = total number of chunks in the index
  const n = index.chunks.length;

  // Calculate BM25 scores for each chunk based on the query terms
  const scored = index.chunks
    .map((chunk) => {
      let score = 0;
      // Cycle through each query term to calculate its contribution to the BM25 score for this chunk
      for (const term of queryTerms) {
        const tf = chunk.terms[term]; // Term frequency of the current query term in this chunk
        if (!tf) continue; // Skip this term if it does not appear in the current chunk
        const df = index.df[term] ?? 0; // Document frequency of the current query term across all chunks
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5)); // Inverse document frequency of the current query term. Inverse document frequency is used to downweight terms that appear in many chunks
        score +=
          idf *
          ((tf * (K1 + 1)) /
            (tf + K1 * (1 - B + (B * chunk.length) / index.avgLength))); // Formula for BM25 term score contribution, taking into account term frequency, document length, and average chunk length
      }
      return { chunk, score };
    })
    .filter((result) => result.score > 0) // Only keep chunks with a positive BM25 score
    .sort((a, b) => b.score - a.score) // Sort chunks by descending BM25 score
    .slice(0, k); // Keep only the top `k` scoring chunks

  const results = scored.map(({ chunk, score }) => {
    // Drop the term statistics from the public result
    const { terms: _terms, length: _length, ...plain } = chunk;
    return { chunk: plain, score: Math.round(score * 1000) / 1000 }; // Round the score to three decimals, e.g. 11.5934... -> 11.593
  });

  // Calculate the total number of tokens retrieved across all top `k` chunks
  const retrievedTokens = results.reduce(
    (sum, result) => sum + result.chunk.tokens, // Sum the number of tokens in each retrieved chunk
    0,
  );
  // Return the search results along with a report summarizing the retrieval statistics
  return {
    query,
    results,
    report: {
      documentationTokens: index.totalTokens,
      retrievedTokens,
      savedPercent: index.totalTokens
        ? Math.round((1 - retrievedTokens / index.totalTokens) * 1000) / 10
        : 0,
      fileCount: index.fileCount,
      chunkCount: index.chunks.length,
      retrievedCount: results.length,
    },
  };
}
