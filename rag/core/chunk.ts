import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { estimateTokens } from './tokens'

/**
 * One retrievable piece of documentation: a `##` section (or part of one)
 * together with the document it comes from.
 */
export interface Chunk {
  id: string        // e.g. "POL-040#3"
  file: string      // path relative to the documentation root
  docId: string     // frontmatter id
  docTitle: string  // frontmatter title
  section: string   // frontmatter section (Policy, Runbooks, ...)
  heading: string   // the `##` heading, or "Introduction" for text before the first one
  text: string
  tokens: number
}

/** Sections longer than this are split at paragraph boundaries */
export const MAX_CHUNK_TOKENS = 400

/**
 * All markdown files under a folder, recursively, in a stable order
 */
export function listMarkdownFiles(root: string): string[] {
  const files: string[] = []
  for (const name of readdirSync(root).sort()) {
    const full = path.join(root, name)
    if (statSync(full).isDirectory()) {
      files.push(...listMarkdownFiles(full))
    } else if (name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

/**
 * Split "---\nkey: value\n---\nbody" into its frontmatter and body.
 * Only simple "key: value" lines are understood, which is all the handbook uses.
 */
export function parseFrontmatter(markdown: string): { meta: Record<string, string>; body: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/)
  if (!match) {
    return { meta: {}, body: markdown }
  }
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split(/\r?\n/)) {
    const colon = line.indexOf(':')
    if (colon > 0) {
      meta[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
    }
  }
  return { meta, body: markdown.slice(match[0].length).replace(/^\s+/, '') }
}

/**
 * Chunk one markdown document by its `##` headings
 */
export function chunkMarkdown(markdown: string, file: string): Chunk[] {
  const { meta, body } = parseFrontmatter(markdown)
  const docId = meta.id ?? path.basename(file, '.md')
  const docTitle = meta.title ?? docId
  const section = meta.section ?? ''

  const chunks: Chunk[] = []
  let heading = 'Introduction'
  let lines: string[] = []

  const flush = () => {
    const text = lines.join('\n').replace(/^# .+\n?/, '').trim()
    if (text) {
      for (const [part, piece] of splitLongSection(text).entries()) {
        const label = part === 0 ? heading : `${heading} (part ${part + 1})`
        chunks.push({
          id: `${docId}#${chunks.length + 1}`,
          file,
          docId,
          docTitle,
          section,
          heading: label,
          text: piece,
          tokens: estimateTokens(piece)
        })
      }
    }
    lines = []
  }

  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('## ')) {
      flush()
      heading = line.slice(3).trim()
    } else {
      lines.push(line)
    }
  }
  flush()
  return chunks
}

/**
 * Keep sections under MAX_CHUNK_TOKENS by cutting them at blank lines
 */
function splitLongSection(text: string): string[] {
  if (estimateTokens(text) <= MAX_CHUNK_TOKENS) {
    return [text]
  }
  const pieces: string[] = []
  let current = ''
  for (const paragraph of text.split(/\n\s*\n/)) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph
    if (current && estimateTokens(candidate) > MAX_CHUNK_TOKENS) {
      pieces.push(current)
      current = paragraph
    } else {
      current = candidate
    }
  }
  if (current) pieces.push(current)
  return pieces
}

/**
 * Chunk every markdown file under the documentation root
 */
export function chunkDirectory(root: string): Chunk[] {
  return listMarkdownFiles(root).flatMap(file =>
    chunkMarkdown(readFileSync(file, 'utf8'), path.relative(root, file))
  )
}
