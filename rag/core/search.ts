import type { Chunk } from './chunk'
import { tokenize, type SearchIndex } from './index'

export interface SearchResult {
  chunk: Chunk
  score: number
}

/**
 * How many tokens the retrieved chunks cost compared with sending everything
 */
export interface TokenReport {
  documentationTokens: number
  retrievedTokens: number
  savedPercent: number
  fileCount: number
  chunkCount: number
  retrievedCount: number
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  report: TokenReport
}

// Standard BM25 parameters
const K1 = 1.2
const B = 0.75

/**
 * Rank chunks with BM25 and return the top `k` with a token report
 */
export function search(index: SearchIndex, query: string, k = 5): SearchResponse {
  const queryTerms = [...new Set(tokenize(query))]
  const n = index.chunks.length

  const scored = index.chunks
    .map(chunk => {
      let score = 0
      for (const term of queryTerms) {
        const tf = chunk.terms[term]
        if (!tf) continue
        const df = index.df[term] ?? 0
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5))
        score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * chunk.length) / index.avgLength)))
      }
      return { chunk, score }
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, k)

  const results = scored.map(({ chunk, score }) => {
    // Drop the term statistics from the public result
    const { terms: _terms, length: _length, ...plain } = chunk
    return { chunk: plain, score: Math.round(score * 1000) / 1000 }
  })

  const retrievedTokens = results.reduce((sum, result) => sum + result.chunk.tokens, 0)
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
      retrievedCount: results.length
    }
  }
}
