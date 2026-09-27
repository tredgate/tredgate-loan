import express from 'express'
import { buildIndex, ensureIndex, saveIndex, type SearchIndex } from './core/index'
import { search } from './core/search'

export interface RagAppOptions {
  docsRoot: string
  indexPath: string
  defaultK?: number
  log?: (line: string) => void
}

const USAGE = `Tredgate Loan documentation search (RAG API)

GET  /health                  -> { ok, files, chunks, documentationTokens, indexedAt }
GET  /search?q=<text>&k=<n>   -> { query, results: [{ chunk: { id, file, docId, docTitle, section, heading, text, tokens }, score }], report }
POST /reindex                 -> rebuilds the index from the documentation folder

Example: curl "http://localhost:3001/search?q=maximum+amount+for+automatic+approval&k=3"
The report says how many tokens the retrieved sections cost compared with the whole documentation.
`

/**
 * The RAG HTTP API. Same search as the CLI, callable by anything that can send an HTTP request.
 * Kept separate from index.ts so tests can start it on any port with their own documentation folder.
 */
export function createRagApp({ docsRoot, indexPath, defaultK = 5, log = () => {} }: RagAppOptions) {
  const app = express()
  let index: SearchIndex | undefined

  const getIndex = () => {
    const result = ensureIndex(docsRoot, indexPath)
    if (result.rebuilt || !index) {
      index = result.index
      if (result.rebuilt) log(`index rebuilt: ${index.chunks.length} chunks from ${index.fileCount} files`)
    }
    return index
  }

  app.get('/', (_req, res) => {
    res.type('text/plain').send(USAGE)
  })

  app.get('/health', (_req, res) => {
    const current = getIndex()
    res.json({
      ok: true,
      files: current.fileCount,
      chunks: current.chunks.length,
      documentationTokens: current.totalTokens,
      indexedAt: current.builtAt
    })
  })

  app.get('/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : ''
    if (!q) {
      res.status(400).json({ error: 'Missing query parameter q' })
      return
    }
    const k = req.query.k === undefined ? defaultK : Number(req.query.k)
    if (!Number.isInteger(k) || k < 1 || k > 20) {
      res.status(400).json({ error: 'k must be a whole number between 1 and 20' })
      return
    }
    const response = search(getIndex(), q, k)
    log(`search "${q}" k=${k} -> ${response.results.length} chunks, ${response.report.retrievedTokens} tokens`)
    res.json(response)
  })

  app.post('/reindex', (_req, res) => {
    index = buildIndex(docsRoot)
    saveIndex(index, indexPath)
    log(`index rebuilt on request: ${index.chunks.length} chunks from ${index.fileCount} files`)
    res.json({ ok: true, files: index.fileCount, chunks: index.chunks.length, documentationTokens: index.totalTokens })
  })

  return app
}
