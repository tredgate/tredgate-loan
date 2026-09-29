// @vitest-environment node

// Pin the timezone so all Date arithmetic in the legacy module is reproducible.
process.env.TZ = 'Europe/Prague'

import { createRequire } from 'node:module'
import { describe, it, expect } from 'vitest'

const require = createRequire(import.meta.url)

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F = require('../../legacy/servicing/fees.js') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const S = require('../../legacy/servicing/settlement.js') as any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const A = require('../../legacy/servicing/arrears.js') as any

// ---------------------------------------------------------------------------
// Shared fixtures — POL-060 worked examples
// ---------------------------------------------------------------------------

// POL-060 Fee schedule (part 2): "an application for 25,000 USD over 24 months at Band C (0.08)"
const LOAN_24 = {
  id: 'pol060-24',
  amount: 25000,
  termMonths: 24,
  interestRate: 0.08,
  createdAt: '2026-01-01'
}

// POL-060 Hardship worked example: "45,000 USD loan over 36 months at 0.075"
const LOAN_36 = {
  id: 'pol060-36',
  amount: 45000,
  termMonths: 36,
  interestRate: 0.075,
  createdAt: '2026-01-01'
}

// A stable as-of date. For LOAN_24 with paid=12 or 13 the next-due installment
// (13th = 2027-02-01, 14th = 2027-03-01) is in the future, so no overdue
// installments are generated and they cannot affect rp/fee/waived/total.
const AS_OF = '2026-09-30'

// ---------------------------------------------------------------------------
// Origination fee — POL-060 · Fee schedule
// ---------------------------------------------------------------------------

describe('Origination fee (POL-060 · Fee schedule)', () => {
  it('is 1.5% of the approved amount — worked example: 25,000 → $375.00', () => {
    expect(F.fee('orig', { amount: 25000 })).toBe('375.00')
  })

  it('applies a $50 minimum — 1,000 USD loan: 1.5% = $15 → capped at $50', () => {
    // "At the edges of the product range, a 1,000 USD loan pays the 50 USD minimum"
    expect(F.fee('orig', { amount: 1000 })).toBe('50.00')
  })

  it('applies a $1,500 maximum — 100,000 USD loan: 1.5% = $1,500 (at the cap)', () => {
    // "any loan of 100,000 USD or more pays the 1,500 USD maximum"
    expect(F.fee('orig', { amount: 100000 })).toBe('1500.00')
  })

  it('caps at $1,500 for loans above 100,000 USD', () => {
    expect(F.fee('orig', { amount: 200000 })).toBe('1500.00')
  })

  it('net proceeds = amount − origination fee — worked example: 25,000 − 375 = $24,625', () => {
    // "the applicant receives 24,625.00 USD"
    expect(F.netProceeds({ amount: 25000, termMonths: 24, interestRate: 0.08 })).toBe(24625)
  })
})

// ---------------------------------------------------------------------------
// Late payment fee — POL-060 · Fee schedule + Collections process
// ---------------------------------------------------------------------------

describe('Late payment fee (POL-060 · Fee schedule)', () => {
  it('is $25 when the installment is more than 10 days past due — DPD=11', () => {
    // Collections process: "The late payment fee of 25 USD is applied on day 11."
    expect(F.fee('late', { dpd: 11 })).toBe('25.00')
  })

  it('is $25 for any DPD well above the threshold — DPD=30', () => {
    expect(F.fee('late', { dpd: 30 })).toBe('25.00')
  })

  it('is $0 when the installment is 9 days past due (under the threshold)', () => {
    expect(F.fee('late', { dpd: 9 })).toBe('0.00')
  })

  it('is $0 when the installment is current (DPD=0)', () => {
    expect(F.fee('late', { dpd: 0 })).toBe('0.00')
  })

  // Bug: calc_late uses `d >= 10` which charges at DPD=10 (day 10).
  // POL-060 says "more than 10 days past due" (DPD > 10, i.e. day 11+).
  // nightly-fees.js correctly uses `dd > 10`; calc_late is off by one.
  it.fails('is $0 when exactly 10 days past due (bug: calc_late uses d >= 10, policy says d > 10)', () => {
    expect(F.fee('late', { dpd: 10 })).toBe('0.00')
  })
})

// ---------------------------------------------------------------------------
// At most one late fee per installment — POL-060 · Fee schedule
// ---------------------------------------------------------------------------

describe('At most one late fee per installment (POL-060 · Fee schedule)', () => {
  // The deduplication guard (lfc flag) is in nightly-fees.js and is fully
  // tested in nightly-fees.test.ts. calc_late is stateless; it charges one $25
  // per call, so it naturally produces one fee per overdue installment item.

  it('sumLate charges exactly one $25 fee per overdue installment — two overdue items → $50', () => {
    // Each item in l.od is one installment; one fee each, not more.
    const loan = { od: [{ no: 5, dpd: 11 }, { no: 6, dpd: 20 }] }
    expect(F.sumLate(loan)).toBe('50.00')
  })

  it('sumLate charges nothing when no installments are overdue', () => {
    expect(F.sumLate({ od: [] })).toBe('0.00')
  })
})

// ---------------------------------------------------------------------------
// Returned payment fee — POL-060 · Fee schedule
// ---------------------------------------------------------------------------

describe('Returned payment fee (POL-060 · Fee schedule)', () => {
  it('is a flat $15', () => {
    expect(F.fee('ret')).toBe('15.00')
  })
})

// ---------------------------------------------------------------------------
// Early settlement fee and waiver — POL-060 · Fee schedule (part 2)
// ---------------------------------------------------------------------------

describe('Early settlement fee (POL-060 · Fee schedule, part 2)', () => {
  it('remaining principal = amount × (term − paid) / term — paid=6: 25,000 × 18/24 = $18,750', () => {
    const q = S.quote({ ...LOAN_24 }, 6, AS_OF)
    expect(q.st).toBe('OK')
    expect(q.rp).toBe(18750)
  })

  it('settlement fee = 1% of remaining principal when fewer than half paid — worked example: $187.50', () => {
    // "the early settlement fee is 187.50 USD"
    const q = S.quote({ ...LOAN_24 }, 6, AS_OF)
    expect(q.fee).toBe('187.50')
    expect(q.waived).toBe(false)
  })

  it('settlement total = remaining principal + fee — worked example: $18,937.50', () => {
    // "the settlement figure is 18,937.50 USD"
    const q = S.quote({ ...LOAN_24 }, 6, AS_OF)
    expect(q.total).toBe(18937.50)
  })

  // Bug: settlement.quote uses `paid * 2 > term` (strictly greater than half).
  // POL-060 says "Waived once at least half of the installments have been paid" (>= half).
  // At paid=12, term=24: 12*2=24 is NOT > 24, so the code does NOT waive the fee.
  // The explicit worked example states the fee must be waived at exactly 12 of 24.
  it.fails('waives the fee when exactly half of installments have been paid — paid=12 of 24 (bug: quote uses paid×2>term, should be ≥)', () => {
    // "After 12 installments, half the term has been paid, the fee is waived,
    //  and the settlement figure is the remaining principal of 12,500.00 USD."
    const q = S.quote({ ...LOAN_24, id: 'pol060-12' }, 12, AS_OF)
    expect(q.waived).toBe(true)
    expect(q.fee).toBe('0.00')
    expect(q.total).toBe(12500)
  })

  it('waives the fee when more than half of installments have been paid — paid=13 of 24', () => {
    // paid=13: 13*2=26 > 24 → waived (correct with the current strict > check too)
    const q = S.quote({ ...LOAN_24, id: 'pol060-13' }, 13, AS_OF)
    expect(q.waived).toBe(true)
    expect(q.fee).toBe('0.00')
  })

  it('settlement figure equals remaining principal when the fee is waived', () => {
    const q = S.quote({ ...LOAN_24, id: 'pol060-13b' }, 13, AS_OF)
    expect(q.total).toBe(q.rp)
  })
})

// ---------------------------------------------------------------------------
// Payment allocation order — POL-060 · Collections process (Recovery)
// ---------------------------------------------------------------------------

describe('Payment allocation order (POL-060 · Collections process)', () => {
  // "Amounts recovered are applied first to fees, then to interest, then to principal"

  it('clears fees before touching interest or principal', () => {
    // payment=200; fees=25 → 0 (−25), interest=100 → 0 (−100), principal=900 → 825 (−75)
    const item = { fees: 25, int: 100, prin: 900 }
    S.alloc(item, 200)
    expect(item.fees).toBe(0)
    expect(item.int).toBe(0)
    expect(item.prin).toBe(825)
  })

  it('stops at fees when the payment is too small to reach interest', () => {
    const item = { fees: 25, int: 100, prin: 900 }
    S.alloc(item, 20)
    expect(item.fees).toBe(5)    // 20 partially covers the $25 fee
    expect(item.int).toBe(100)   // interest untouched
    expect(item.prin).toBe(900)  // principal untouched
  })

  it('stops at interest when the payment covers fees but not all interest', () => {
    const item = { fees: 25, int: 100, prin: 900 }
    S.alloc(item, 75)
    expect(item.fees).toBe(0)
    expect(item.int).toBe(50)   // 25 remaining after fees, 50 of 100 interest left
    expect(item.prin).toBe(900) // principal untouched
  })

  it('returns overpayment when payment exceeds all three components', () => {
    const item = { fees: 25, int: 100, prin: 875 }
    const overpay = S.alloc(item, 1100)
    expect(item.fees).toBe(0)
    expect(item.int).toBe(0)
    expect(item.prin).toBe(0)
    expect(S.isClear(item)).toBe(true)
    expect(overpay).toBe(100) // 1100 − 25 − 100 − 875 = 100
  })
})

// ---------------------------------------------------------------------------
// Hardship arrangement — late fee waiver — POL-060 · Hardship arrangements
// ---------------------------------------------------------------------------

describe('Hardship arrangement — late fee waiver (POL-060 · Hardship arrangements)', () => {
  // "Late payment fees accrued during the arrangement are waived"

  it('waives a numeric late fee (returns 0) when a hardship arrangement is active', () => {
    expect(A.adj({ hs: { a: true } }, 25)).toBe(0)
  })

  it('waives a string late fee (returns "0.00") when a hardship arrangement is active', () => {
    // sumLate returns a string; adj preserves the type of the input
    expect(A.adj({ hs: { a: true } }, '25.00')).toBe('0.00')
  })

  it('passes the fee through unchanged when no hardship arrangement is active', () => {
    expect(A.adj({ hs: null }, 25)).toBe(25)
  })

  it('passes the fee through when the hardship flag is explicitly false', () => {
    expect(A.adj({ hs: { a: false } }, 25)).toBe(25)
  })

  it('does not waive fees when the item has no hs field at all', () => {
    expect(A.adj({}, 25)).toBe(25)
  })
})

// ---------------------------------------------------------------------------
// Hardship worked example — POL-060 · Hardship arrangements (part 2)
// ---------------------------------------------------------------------------

describe('Hardship worked example — remaining principal (POL-060 · Hardship arrangements, part 2)', () => {
  it('remaining principal after 12 of 36 installments = 45,000 × 24/36 = $30,000', () => {
    // "The remaining principal is 45,000 × 24 / 36 = 30,000 USD"
    const q = S.quote({ ...LOAN_36 }, 12, AS_OF)
    expect(q.st).toBe('OK')
    expect(q.rp).toBe(30000)
  })
})
