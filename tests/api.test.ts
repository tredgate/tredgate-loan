// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pino } from 'pino'
import { createApp } from '../server/app'
import { createLoanStore } from '../server/loanStore'
import type { LoanApplication } from '../shared/loan'

const SEED_FILE = path.resolve('server/data/loans.seed.json')

type ErrorBody = { error: string }

let server: Server
let baseUrl: string
let dataDir: string

async function api<T>(route: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}/api${route}`, {
    headers: { 'Content-Type': 'application/json' },
    ...init
  })
  return { status: response.status, body: (await response.json()) as T }
}

const newLoan = {
  applicantName: 'Alice Smith',
  amount: 25000,
  termMonths: 12,
  interestRate: 0.05
}

describe('loan API', () => {
  beforeEach(async () => {
    // Every test gets a fresh copy of the seed data in a temp folder
    dataDir = await mkdtemp(path.join(tmpdir(), 'tredgate-loan-'))
    const store = createLoanStore({ filePath: path.join(dataDir, 'loans.json'), seedPath: SEED_FILE })
    const app = createApp({ store, logger: pino({ level: 'silent' }) })

    await new Promise<void>(resolve => {
      server = app.listen(0, () => resolve())
    })
    const { port } = server.address() as AddressInfo
    baseUrl = `http://127.0.0.1:${port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
    await rm(dataDir, { recursive: true, force: true })
  })

  it('reports health', async () => {
    const { status, body } = await api<{ status: string }>('/health')
    expect(status).toBe(200)
    expect(body.status).toBe('ok')
  })

  it('lists the seeded loans', async () => {
    const { status, body } = await api<LoanApplication[]>('/loans')
    expect(status).toBe(200)
    expect(body.length).toBeGreaterThan(0)
    expect(body[0]).toMatchObject({ id: 'ln-1001', applicantName: 'Amara Ndlovu', status: 'approved' })
  })

  it('creates a loan with pending status and persists it', async () => {
    const created = await api<LoanApplication>('/loans', { method: 'POST', body: JSON.stringify(newLoan) })
    expect(created.status).toBe(201)
    expect(created.body).toMatchObject({ ...newLoan, status: 'pending' })
    expect(created.body.id).toBeDefined()
    expect(created.body.createdAt).toBeDefined()

    const list = await api<LoanApplication[]>('/loans')
    expect(list.body.some(loan => loan.id === created.body.id)).toBe(true)
  })

  it('rejects an invalid loan with 400 and the validation message', async () => {
    const { status, body } = await api<ErrorBody>('/loans', {
      method: 'POST',
      body: JSON.stringify({ ...newLoan, amount: -5 })
    })
    expect(status).toBe(400)
    expect(body.error).toBe('Amount must be a number greater than 0')
  })

  it('rejects an amount sent as a string', async () => {
    const { status } = await api<ErrorBody>('/loans', {
      method: 'POST',
      body: JSON.stringify({ ...newLoan, amount: '25000' })
    })
    expect(status).toBe(400)
  })

  it('rejects a request without a JSON body with 400', async () => {
    // No Content-Type header: express.json() leaves req.body undefined
    const response = await fetch(`${baseUrl}/api/loans`, { method: 'POST', body: 'applicantName=Alice' })
    const body = (await response.json()) as ErrorBody
    expect(response.status).toBe(400)
    expect(body.error).toBe('Request body must be a JSON object')
  })

  it('rejects malformed JSON with 400', async () => {
    const { status } = await api<ErrorBody>('/loans', { method: 'POST', body: '{ not json' })
    expect(status).toBe(400)
  })

  it('approves a pending loan', async () => {
    const { status, body } = await api<LoanApplication>('/loans/ln-1003/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    })
    expect(status).toBe(200)
    expect(body.status).toBe('approved')
  })

  it('rejects an unknown status value with 400', async () => {
    const { status, body } = await api<ErrorBody>('/loans/ln-1003/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'maybe' })
    })
    expect(status).toBe(400)
    expect(body.error).toContain('Status must be')
  })

  it('returns 404 for a loan that does not exist', async () => {
    const { status, body } = await api<ErrorBody>('/loans/does-not-exist/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    })
    expect(status).toBe(404)
    expect(body.error).toBe('Loan with id does-not-exist not found')
  })

  it('returns 409 when a decided loan is approved again', async () => {
    // ln-1001 is already approved in the seed
    const { status, body } = await api<ErrorBody>('/loans/ln-1001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    })
    expect(status).toBe(409)
    expect(body.error).toBe('Loan with id ln-1001 has already been decided (approved)')
  })

  it('returns 409 when auto-deciding a decided loan', async () => {
    const { status } = await api<ErrorBody>('/loans/ln-1002/auto-decide', { method: 'POST' })
    expect(status).toBe(409)
  })

  it('auto-decides: approves a loan within the limits', async () => {
    // ln-1004: amount 100000, term 60 (exactly at the limits)
    const { status, body } = await api<LoanApplication>('/loans/ln-1004/auto-decide', { method: 'POST' })
    expect(status).toBe(200)
    expect(body.status).toBe('approved')
  })

  it('auto-decides: rejects a loan above the limits', async () => {
    const created = await api<LoanApplication>('/loans', {
      method: 'POST',
      body: JSON.stringify({ ...newLoan, amount: 150000, termMonths: 72 })
    })
    const { body } = await api<LoanApplication>(`/loans/${created.body.id}/auto-decide`, { method: 'POST' })
    expect(body.status).toBe('rejected')
  })

  it('returns 404 JSON for unknown API routes', async () => {
    const { status, body } = await api<ErrorBody>('/nope')
    expect(status).toBe(404)
    expect(body.error).toContain('not found')
  })
})
