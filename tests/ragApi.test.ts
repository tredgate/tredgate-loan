// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRagApp } from '../rag/app'
import type { SearchResponse } from '../rag/core/search'

let server: Server
let baseUrl: string
let docsRoot: string

describe('rag HTTP API', () => {
  beforeAll(async () => {
    docsRoot = mkdtempSync(path.join(tmpdir(), 'rag-api-docs-'))
    writeFileSync(
      path.join(docsRoot, 'POL-040.md'),
      '---\nid: POL-040\ntitle: Automated Decisioning\nsection: Policy\n---\n\n## The standard risk envelope\n\nApproved automatically when amount is at most 100,000 USD and term at most 60 months.\n'
    )
    const app = createRagApp({ docsRoot, indexPath: path.join(docsRoot, 'cache', 'index.json') })
    await new Promise<void>(resolve => {
      server = app.listen(0, () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())))
  })

  it('describes itself in plain text at /', async () => {
    const response = await fetch(`${baseUrl}/`)
    expect(response.headers.get('content-type')).toContain('text/plain')
    expect(await response.text()).toContain('GET  /search')
  })

  it('reports health with index statistics', async () => {
    const body = await (await fetch(`${baseUrl}/health`)).json() as { ok: boolean; files: number; chunks: number }
    expect(body.ok).toBe(true)
    expect(body.files).toBe(1)
    expect(body.chunks).toBe(1)
  })

  it('searches and returns chunks with a token report', async () => {
    const response = await fetch(`${baseUrl}/search?q=${encodeURIComponent('maximum amount approved automatically')}&k=3`)
    expect(response.status).toBe(200)
    const body = (await response.json()) as SearchResponse
    expect(body.results[0]?.chunk).toMatchObject({ docId: 'POL-040', heading: 'The standard risk envelope' })
    expect(body.report.retrievedTokens).toBeGreaterThan(0)
    expect(body.report.documentationTokens).toBeGreaterThanOrEqual(body.report.retrievedTokens)
  })

  it('rejects a missing query and an invalid k with 400', async () => {
    expect((await fetch(`${baseUrl}/search`)).status).toBe(400)
    expect((await fetch(`${baseUrl}/search?q=x&k=0`)).status).toBe(400)
    expect((await fetch(`${baseUrl}/search?q=x&k=abc`)).status).toBe(400)
  })

  it('reindexes on request and picks up new documents', async () => {
    writeFileSync(path.join(docsRoot, 'KI-009.md'), '---\nid: KI-009\ntitle: Printer on fire\n---\n\n## Summary\n\nThe branch printer caught fire.\n')
    const body = await (await fetch(`${baseUrl}/reindex`, { method: 'POST' })).json() as { ok: boolean; files: number }
    expect(body.ok).toBe(true)
    expect(body.files).toBe(2)
    const found = (await (await fetch(`${baseUrl}/search?q=printer+fire&k=1`)).json()) as SearchResponse
    expect(found.results[0]?.chunk.docId).toBe('KI-009')
  })
})
