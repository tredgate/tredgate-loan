import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { chunkDirectory, listMarkdownFiles, type Chunk } from './chunk'

/**
 * A chunk plus the term statistics BM25 needs
 */
export interface IndexedChunk extends Chunk {
  terms: Record<string, number>  // term -> occurrences in this chunk (heading and title included)
  length: number                 // total term count
}

export interface SearchIndex {
  version: 1
  builtAt: string     // ISO timestamp, compared with file modification times to detect staleness
  root: string        // documentation root the index was built from
  fileCount: number
  totalTokens: number // estimated tokens of the whole documentation
  avgLength: number   // average chunk length in terms
  df: Record<string, number> // term -> number of chunks containing it
  chunks: IndexedChunk[]
}

const STOP_WORDS = new Set(
  'a an and are as at be by for from has have in is it its of on or that the this to was were will with'.split(' ')
)

// Suffixes stripped by the light stemmer, tried in this order
const SUFFIXES: [string, string][] = [
  ['ies', 'y'], ['ational', 'ate'], ['ization', 'ize'], ['ation', 'ate'], ['ness', ''],
  ['ment', ''], ['ally', ''], ['ical', 'ic'], ['ing', ''], ['ed', ''], ['es', ''],
  ['ly', ''], ['al', ''], ['ion', ''], ['ic', ''], ['s', '']
]

/**
 * A light stemmer: "approval", "approved" and "approve" all become "approv",
 * "automatic", "automatically" and "automated" become "automat".
 * Not linguistically perfect, but good enough for keyword search over a handbook.
 */
export function stem(term: string): string {
  if (/^\d+$/.test(term)) return term
  let current = term
  for (let round = 0; round < 3; round++) {
    const rule = SUFFIXES.find(([suffix]) => current.endsWith(suffix) && current.length - suffix.length >= 3)
    if (!rule) break
    if (rule[0] === 's' && current.endsWith('ss')) break
    current = current.slice(0, -rule[0].length) + rule[1]
  }
  if (current.length > 4 && current.endsWith('e')) current = current.slice(0, -1)
  return current
}

/**
 * Lowercase words and numbers, drop stop words, stem
 */
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter(term => !STOP_WORDS.has(term))
    .map(stem)
}

/**
 * Build the index for every markdown file under `root`
 */
export function buildIndex(root: string): SearchIndex {
  const chunks = chunkDirectory(root)
  const df: Record<string, number> = {}
  let totalLength = 0

  const indexed = chunks.map(chunk => {
    // Title and heading terms count three times: a section about "automated decisioning"
    // should outrank a section that merely mentions approval in passing
    const terms: Record<string, number> = {}
    const titleTokens = tokenize(`${chunk.docId} ${chunk.docTitle} ${chunk.heading}`)
    const tokens = [...titleTokens, ...titleTokens, ...titleTokens, ...tokenize(chunk.text)]
    for (const term of tokens) {
      terms[term] = (terms[term] ?? 0) + 1
    }
    for (const term of Object.keys(terms)) {
      df[term] = (df[term] ?? 0) + 1
    }
    totalLength += tokens.length
    return { ...chunk, terms, length: tokens.length }
  })

  return {
    version: 1,
    builtAt: new Date().toISOString(),
    root,
    fileCount: listMarkdownFiles(root).length,
    totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
    avgLength: indexed.length ? totalLength / indexed.length : 0,
    df,
    chunks: indexed
  }
}

export function saveIndex(index: SearchIndex, indexPath: string): void {
  mkdirSync(path.dirname(indexPath), { recursive: true })
  writeFileSync(indexPath, JSON.stringify(index))
}

export function loadIndex(indexPath: string): SearchIndex {
  return JSON.parse(readFileSync(indexPath, 'utf8')) as SearchIndex
}

/**
 * An index is stale when any documentation file changed after it was built
 */
export function isStale(index: SearchIndex): boolean {
  if (!existsSync(index.root)) return true
  const builtAt = Date.parse(index.builtAt)
  return listMarkdownFiles(index.root).some(file => Math.floor(statSync(file).mtimeMs) > builtAt)
}

/**
 * Load the index, rebuilding it when it is missing or stale
 */
export function ensureIndex(root: string, indexPath: string): { index: SearchIndex; rebuilt: boolean } {
  if (existsSync(indexPath)) {
    const index = loadIndex(indexPath)
    if (index.version === 1 && index.root === root && !isStale(index)) {
      return { index, rebuilt: false }
    }
  }
  const index = buildIndex(root)
  saveIndex(index, indexPath)
  return { index, rebuilt: true }
}
