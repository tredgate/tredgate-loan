// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { chunkMarkdown, parseFrontmatter, MAX_CHUNK_TOKENS } from '../rag/core/chunk'
import { buildIndex, ensureIndex, stem, tokenize } from '../rag/core/index'
import { search } from '../rag/core/search'

const sample = `---
id: POL-040
title: Automated Decisioning
section: Policy
tags: [auto-decide]
---

# POL-040 Automated Decisioning

Intro paragraph before the first heading.

## The standard risk envelope

Approved when amount is at most 100,000 USD and term at most 60 months.

## Audit trail

Every automated decision writes the log line loan auto-decided.
`

describe('rag chunking', () => {
  it('parses simple frontmatter', () => {
    const { meta, body } = parseFrontmatter(sample)
    expect(meta.id).toBe('POL-040')
    expect(meta.title).toBe('Automated Decisioning')
    expect(body.startsWith('# POL-040')).toBe(true)
  })

  it('splits a document into one chunk per ## heading plus the introduction', () => {
    const chunks = chunkMarkdown(sample, 'policy/POL-040.md')
    expect(chunks.map(c => c.heading)).toEqual(['Introduction', 'The standard risk envelope', 'Audit trail'])
    expect(chunks[1]).toMatchObject({ id: 'POL-040#2', docId: 'POL-040', docTitle: 'Automated Decisioning', section: 'Policy' })
    expect(chunks[0]?.text).not.toContain('# POL-040') // the H1 line is not content
    expect(chunks[1]?.tokens).toBeGreaterThan(0)
  })

  it('splits very long sections at paragraph boundaries', () => {
    const paragraph = 'word '.repeat(300).trim()
    const long = `## Long\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}`
    const chunks = chunkMarkdown(long, 'x.md')
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every(c => c.tokens <= MAX_CHUNK_TOKENS)).toBe(true)
    expect(chunks[1]?.heading).toBe('Long (part 2)')
  })
})

describe('rag search', () => {
  it('tokenizes to lowercase terms, drops stop words and stems', () => {
    expect(tokenize('The Installments of POL-040 are due')).toEqual(['install', 'pol', '040', 'due'])
    expect(new Set(['approval', 'approved', 'approve'].map(stem)).size).toBe(1)
    expect(new Set(['automatic', 'automatically', 'automated'].map(stem)).size).toBe(1)
  })

  it('finds the most relevant chunk and reports token savings', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rag-docs-'))
    mkdirSync(path.join(root, 'policy'))
    writeFileSync(path.join(root, 'policy', 'POL-040.md'), sample)
    writeFileSync(
      path.join(root, 'RB-004.md'),
      '---\nid: RB-004\ntitle: Port Already in Use\n---\n\n## Symptoms\n\nThe process logs EADDRINUSE and exits with code 1.\n'
    )
    const index = buildIndex(root)
    expect(index.fileCount).toBe(2)
    expect(index.chunks.length).toBe(4)

    const { results, report } = search(index, 'What amount is approved automatically?', 2)
    expect(results[0]?.chunk.heading).toBe('The standard risk envelope')
    expect(report.documentationTokens).toBe(index.totalTokens)
    expect(report.retrievedTokens).toBe(results.reduce((sum, r) => sum + r.chunk.tokens, 0))
    expect(report.savedPercent).toBeGreaterThan(0)
    expect(report.savedPercent).toBeLessThan(100)

    const port = search(index, 'port already in use', 1)
    expect(port.results[0]?.chunk.docId).toBe('RB-004')
  })

  it('rebuilds a cached index only when the documentation changed', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'rag-docs-'))
    const indexPath = path.join(root, 'cache', 'index.json')
    writeFileSync(path.join(root, 'a.md'), '---\nid: A\ntitle: A\n---\n\n## One\n\nfirst version\n')

    expect(ensureIndex(root, indexPath).rebuilt).toBe(true)
    expect(ensureIndex(root, indexPath).rebuilt).toBe(false)

    const later = new Date(Date.now() + 5000)
    writeFileSync(path.join(root, 'a.md'), '---\nid: A\ntitle: A\n---\n\n## One\n\nsecond version\n')
    utimesSync(path.join(root, 'a.md'), later, later)
    const { index, rebuilt } = ensureIndex(root, indexPath)
    expect(rebuilt).toBe(true)
    expect(index.chunks[0]?.text).toContain('second version')
  })
})

describe('rag on the real handbook', () => {
  it('answers the demo questions from the right documents', () => {
    const index = buildIndex(path.resolve('docs/handbook'))
    expect(index.fileCount).toBeGreaterThan(30)

    const top = (q: string, k = 3) => search(index, q, k).results.map(r => r.chunk.docId)
    expect(top('What is the maximum amount for automatic approval?')[0]).toBe('POL-040')
    expect(top('How is the monthly installment calculated?')).toContain('POL-030')
    expect(top('Every request returns 500 and the log shows SyntaxError', 5)).toContain('RB-003')
    expect(top('What does the interest rate 0.08 mean?')[0]).toBe('POL-030')
    expect(top('port already in use')[0]).toBe('RB-004')
  })
})
