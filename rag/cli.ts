import { buildIndex, ensureIndex, saveIndex } from './core/index'
import { search } from './core/search'
import { ragConfig } from './config'

/**
 * Usage:
 *   npm run rag -- "How much can be approved automatically?"   search, print the best chunks
 *   npm run rag -- "..." --k 3 --json                           fewer chunks, machine-readable output
 *   npm run rag:index                                           rebuild the index and print statistics
 */
const args = process.argv.slice(2)
const flag = (name: string) => args.includes(`--${name}`)
const option = (name: string) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : undefined
}
const query = args.filter((arg, i) => !arg.startsWith('--') && args[i - 1] !== '--k').join(' ').trim()

if (flag('index')) {
  const index = buildIndex(ragConfig.docsRoot)
  saveIndex(index, ragConfig.indexPath)
  console.log(`Indexed ${index.fileCount} files into ${index.chunks.length} chunks (~${index.totalTokens.toLocaleString()} tokens)`)
  console.log(`Index written to ${ragConfig.indexPath}`)
  process.exit(0)
}

if (!query) {
  console.error('Usage: npm run rag -- "<question>" [--k 5] [--json]')
  process.exit(1)
}

const { index, rebuilt } = ensureIndex(ragConfig.docsRoot, ragConfig.indexPath)
const k = Number(option('k') ?? ragConfig.defaultK)
const response = search(index, query, k)

if (flag('json')) {
  console.log(JSON.stringify(response, null, 2))
  process.exit(0)
}

if (rebuilt) console.log('(index rebuilt because the documentation changed)\n')
console.log(`Query: ${response.query}\n`)
for (const [i, { chunk, score }] of response.results.entries()) {
  console.log(`--- ${i + 1}. ${chunk.docId} · ${chunk.heading}  [${chunk.file}, score ${score}, ~${chunk.tokens} tokens]`)
  console.log(chunk.text.trim())
  console.log()
}
const r = response.report
console.log('=== Token report (approximate) ===')
console.log(`Whole documentation: ${r.documentationTokens.toLocaleString()} tokens in ${r.fileCount} files (${r.chunkCount} chunks)`)
console.log(`Retrieved context:   ${r.retrievedTokens.toLocaleString()} tokens in ${r.retrievedCount} chunks`)
console.log(`Saved:               ${r.savedPercent}%`)
