import path from 'node:path'

/**
 * Where the documentation lives and where the generated index is cached.
 */
const ragDir = import.meta.dirname
const rootDir = path.resolve(ragDir, '..')

export const ragConfig = {
  docsRoot: process.env.RAG_DOCS ?? path.join(rootDir, 'docs', 'handbook'),
  indexPath: process.env.RAG_INDEX ?? path.join(ragDir, 'index.json'),
  defaultK: 5
}
