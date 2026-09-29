// @vitest-environment node

// Pin the timezone so all Date arithmetic in the legacy module is reproducible
// regardless of the CI or developer machine locale.
process.env.TZ = 'Europe/Prague'

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pino } from 'pino'
import { createApp } from '../../server/app'
import { createLoanStore } from '../../server/loanStore'

// ---------------------------------------------------------------------------
// Seed data
// createdAt strings are chosen so that installment due dates are predictable:
//
//   sq-001  : start 2026-08-03  → inst 1 due 2026-09-03  (main test loan)
//   sq-rej  : rejected loan     → verifies 409
//   sq-spring: start 2026-02-19 → inst 1 due 2026-03-19  (spring-forward DST)
//   sq-fall  : start 2026-09-16 → inst 1 due 2026-10-16  (fall-back DST)
//
// pd() takes only the first 10 characters of createdAt so the time component
// and the UTC offset are irrelevant; only the date portion matters.
// ---------------------------------------------------------------------------
const SEED = [
  {
    id: 'sq-001',
    applicantName: 'Test User',
    amount: 25000,
    termMonths: 24,
    interestRate: 0.08,
    status: 'approved',
    createdAt: '2026-08-03T00:00:00.000Z'
  },
  {
    id: 'sq-rej',
    applicantName: 'Rejected User',
    amount: 10000,
    termMonths: 12,
    interestRate: 0.05,
    status: 'rejected',
    createdAt: '2026-08-01T00:00:00.000Z'
  },
  {
    id: 'sq-spring',
    applicantName: 'DST Spring',
    amount: 12000,
    termMonths: 12,
    interestRate: 0.06,
    status: 'approved',
    createdAt: '2026-02-19T00:00:00.000Z'
  },
  {
    id: 'sq-fall',
    applicantName: 'DST Fall',
    amount: 12000,
    termMonths: 12,
    interestRate: 0.06,
    status: 'approved',
    createdAt: '2026-09-16T00:00:00.000Z'
  }
]

let server: Server
let baseUrl: string
let dataDir: string

async function api<T>(route: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}/api${route}`, {
    headers: { 'Content-Type': 'application/json' }
  })
  return { status: response.status, body: (await response.json()) as T }
}

describe('GET /api/loans/:id/settlement-quote', () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'tredgate-sq-'))
    const seedPath = path.join(dataDir, 'seed.json')
    await writeFile(seedPath, JSON.stringify(SEED))
    const store = createLoanStore({ filePath: path.join(dataDir, 'loans.json'), seedPath })
    const app = createApp({ store, logger: pino({ level: 'silent' }) })
    await new Promise<void>(resolve => {
      server = app.listen(0, () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close(err => (err ? reject(err) : resolve()))
    })
    await rm(dataDir, { recursive: true, force: true })
  })

  // ── Baseline ──────────────────────────────────────────────────────────────

  it('returns a full quote when the loan is current (DPD 0)', async () => {
    // asOf 2026-08-04 is 30 days before inst 1 due (2026-09-03), so DPD = 0
    // rp = 25000 × 24/24 = 25000; fee = 25000 × 0.01 = "250.00"; total = 25250
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=0&date=2026-08-04'
    )
    expect(status).toBe(200)
    expect(body).toEqual({
      st: 'OK',
      id: 'sq-001',
      asOf: '2026-08-04',
      paid: 0,
      left: 24,
      rp: 25000,
      fee: '250.00',
      waived: false,
      total: 25250,
      dpd: 0,
      stage: 'CURRENT',
      lateFees: '0.00'
    })
  })

  it('returns correct values at DPD 7 — no late fee', async () => {
    // inst 1 due 2026-09-03; asOf 2026-09-10 → dd = 7 (both UTC+2, no DST crossing)
    // calc_late: 7 >= 10 → false → "0.00"
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=0&date=2026-09-10'
    )
    expect(status).toBe(200)
    expect(body).toEqual({
      st: 'OK',
      id: 'sq-001',
      asOf: '2026-09-10',
      paid: 0,
      left: 24,
      rp: 25000,
      fee: '250.00',
      waived: false,
      total: 25250,
      dpd: 7,
      stage: 'STAGE_1',
      lateFees: '0.00'
    })
  })

  // ── DPD 10 / 11 boundary ─────────────────────────────────────────────────

  it('charges late fee at exactly DPD=10 (current behavior; policy says > 10)', async () => {
    // inst 1 due 2026-09-03; asOf 2026-09-13 → dd = 10 exactly
    // fees.calc_late uses >= 10 (fires on day 10) vs nightly-fees.js which uses > 10
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=0&date=2026-09-13'
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ dpd: 10, stage: 'STAGE_1', lateFees: '25.00' })
  })

  it('charges late fee at DPD=11', async () => {
    // inst 1 due 2026-09-03; asOf 2026-09-14 → dd = 11
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=0&date=2026-09-14'
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ dpd: 11, stage: 'STAGE_1', lateFees: '25.00' })
  })

  // ── Waiver boundary ───────────────────────────────────────────────────────

  it('does NOT waive the fee when exactly half of installments are paid (current behavior; policy says waive)', async () => {
    // paid=12 of 24: code checks 12*2 > 24 → 24 > 24 → false → not waived
    // policy says "at least half" (paid*2 >= term) → should be waived, but code uses strict >
    // rp = 25000 × 12/24 = 12500; fee = 12500 × 0.01 = "125.00"; total = 12625
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=12&date=2026-09-10'
    )
    expect(status).toBe(200)
    expect(body).toEqual({
      st: 'OK',
      id: 'sq-001',
      asOf: '2026-09-10',
      paid: 12,
      left: 12,
      rp: 12500,
      fee: '125.00',
      waived: false,
      total: 12625,
      dpd: 0,
      stage: 'CURRENT',
      lateFees: '0.00'
    })
  })

  it('waives the fee when more than half of installments are paid', async () => {
    // paid=13 of 24: 13*2 > 24 → 26 > 24 → true → waived
    // rp = 25000 × 11/24 = 11458.333… → r2 = 11458.33; total = r2(rp) = 11458.33
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-001/settlement-quote?paid=13&date=2026-09-10'
    )
    expect(status).toBe(200)
    expect(body).toEqual({
      st: 'OK',
      id: 'sq-001',
      asOf: '2026-09-10',
      paid: 13,
      left: 11,
      rp: 11458.33,
      fee: '0.00',
      waived: true,
      total: 11458.33,
      dpd: 0,
      stage: 'CURRENT',
      lateFees: '0.00'
    })
  })

  // ── Error paths ───────────────────────────────────────────────────────────

  it('returns 409 when the loan is not approved', async () => {
    const { status } = await api('/loans/sq-rej/settlement-quote?paid=0&date=2026-09-10')
    expect(status).toBe(409)
  })

  it('returns 404 for a loan id that does not exist', async () => {
    const { status } = await api('/loans/no-such/settlement-quote?paid=0&date=2026-09-10')
    expect(status).toBe(404)
  })

  it('returns 400 with ERR_1 message when paid is negative', async () => {
    // parseInt("-1") = -1 < 0 → ERR_1
    const { status, body } = await api<{ error: string }>(
      '/loans/sq-001/settlement-quote?paid=-1&date=2026-09-10'
    )
    expect(status).toBe(400)
    expect(body.error).toBe('paid must be a whole number of installments, 0 or more')
  })

  it('returns 400 with ERR_2 message when paid equals the loan term', async () => {
    // paid=24, termMonths=24: parseInt("24") >= 24 → ERR_2
    const { status, body } = await api<{ error: string }>(
      '/loans/sq-001/settlement-quote?paid=24&date=2026-09-10'
    )
    expect(status).toBe(400)
    expect(body.error).toBe('paid must be less than the loan term')
  })

  it('returns 400 with ERR_3 message for an unparseable date', async () => {
    const { status, body } = await api<{ error: string }>(
      '/loans/sq-001/settlement-quote?paid=0&date=not-a-date'
    )
    expect(status).toBe(400)
    expect(body.error).toBe('date must be a valid date in YYYY-MM-DD format')
  })

  // ── DST boundaries ────────────────────────────────────────────────────────

  it('spring-forward: 11 calendar days across 2026-03-29 yields DPD 10.96, not 11 — late fee charged', async () => {
    // sq-spring start 2026-02-19; inst 1 due 2026-03-19
    // Prague clocks spring forward 2026-03-29 02:00→03:00 (CET+1 → CEST+2).
    // asOf 2026-03-30: midnight is already CEST (+2) = UTC 2026-03-29T22:00Z
    // due midnight CET (+1)  = UTC 2026-03-18T23:00Z
    // diff = 10d 23h → / 86400s = 10.9583 → r2 = 10.96
    // 10.96 >= 10 → calc_late fires (current behavior)
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-spring/settlement-quote?paid=0&date=2026-03-30'
    )
    expect(status).toBe(200)
    expect(body).toMatchObject({ dpd: 10.96, stage: 'STAGE_1', lateFees: '25.00' })
  })

  it('fall-back: 10 calendar days across 2026-10-25 yields DPD 10.04, not 10 — late fee charged', async () => {
    // sq-fall start 2026-09-16; inst 1 due 2026-10-16
    // Prague clocks fall back 2026-10-25 03:00→02:00 (CEST+2 → CET+1).
    // asOf 2026-10-26: midnight is CET (+1) = UTC 2026-10-25T23:00Z
    // due midnight CEST (+2) = UTC 2026-10-15T22:00Z
    // diff = 10d 1h → / 86400s = 10.0417 → r2 = 10.04
    // 10.04 >= 10 → calc_late fires
    // rp = 12000; fee = "120.00"; total = 12120
    const { status, body } = await api<Record<string, unknown>>(
      '/loans/sq-fall/settlement-quote?paid=0&date=2026-10-26'
    )
    expect(status).toBe(200)
    expect(body).toEqual({
      st: 'OK',
      id: 'sq-fall',
      asOf: '2026-10-26',
      paid: 0,
      left: 12,
      rp: 12000,
      fee: '120.00',
      waived: false,
      total: 12120,
      dpd: 10.04,
      stage: 'STAGE_1',
      lateFees: '25.00'
    })
  })
})
