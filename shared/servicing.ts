// shared/servicing.ts
//
// Pure fee and settlement rules extracted from legacy/servicing/fees.js and
// legacy/servicing/settlement.js.  All functions are free of side-effects: no
// current date, no environment variables, no logging, no global state, and no
// mutation of the arguments passed in.
//
// Written with plain TypeScript syntax only (no enums, no namespaces, no
// parameter properties) so Node 22.18+ can execute this file directly via the
// built-in type-strip loader.

type MoneyInput = number | string | null | undefined

// ── Internal helpers ───────────────────────────────────────────────────────

function parseMoney(v: MoneyInput): number {
  if (v === undefined || v === null || v === '') return 0
  if (typeof v === 'string') {
    const n = parseFloat(v.replace(/[, ]/g, ''))
    return isNaN(n) ? 0 : n
  }
  return v as number
}

function round2(x: number): number {
  return Math.round(x * 100) / 100
}

function pad2(n: number): string {
  return n < 10 ? '0' + n : '' + n
}

// ── Date formatting (needed by calcSettlementResult) ─────────────────────

export function formatDate(d: Date): string {
  if (!(d instanceof Date)) return ''
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate())
}

// ── Fee rules ─────────────────────────────────────────────────────────────

/**
 * Origination fee: 1.5 % of the approved amount, min $50, max $1,500.
 * Accepts either a loan object (reads .amount) or a raw number/string,
 * matching the original fees.js calc_orig handler.
 */
export function calcOrigFee(loanOrAmount: unknown): string {
  const raw =
    loanOrAmount != null &&
    typeof loanOrAmount === 'object' &&
    (loanOrAmount as { amount?: unknown }).amount !== undefined
      ? (loanOrAmount as { amount: unknown }).amount
      : loanOrAmount
  const a = parseMoney(raw as MoneyInput)
  let f = a * 0.015
  if (f < 50) f = 50
  if (f > 1500) f = 1500
  return f.toFixed(2)
}

/**
 * Late payment fee used by the settlement-quote path (fees.js calc_late):
 * $25 when dpd >= 10.
 * KNOWN BUG: policy says "> 10 days past due" (day 11+) but this path fires
 * one day earlier, at dpd = 10.
 */
export function calcLateFee(dpd: number): string {
  if (dpd >= 10) return (25).toFixed(2)
  return '0.00'
}

/** Returned-payment fee: $15 flat. */
export function calcRetFee(): string {
  return (15).toFixed(2)
}

/**
 * Early-settlement fee: pct % of the remaining principal.
 * The caller is responsible for resolving the default pct (0.01) before calling.
 */
export function calcSettleFee(remainingPrincipal: number, pct: number): string {
  return (parseMoney(remainingPrincipal) * pct).toFixed(2)
}

/**
 * Net loan proceeds after deducting the origination fee.
 * The wrapper keeps the logging; this function only does the arithmetic.
 */
export function calcNetProceeds(amount: number): number {
  return round2(amount - parseFloat(calcOrigFee(amount)))
}

// ── Settlement calculation ─────────────────────────────────────────────────

/** Per-installment split into principal and interest components. */
export function splitInstallment(
  amount: number,
  termMonths: number,
  interestRate: number
): { prin: number; int: number; inst: number } {
  const p = amount / termMonths
  const i = (amount * interestRate) / termMonths
  return { prin: round2(p), int: round2(i), inst: round2(p + i) }
}

export type SettlementOkResult = {
  st: 'OK'
  id: string
  asOf: string
  paid: number
  left: number
  rp: number
  fee: string
  waived: boolean
  total: number
  dpd: number
  stage: string
  lateFees: string
}

/**
 * Core settlement-quote result assembly (pure: all inputs are explicit).
 *
 * The wrapper (settlement.js) is responsible for:
 *   - validating and parsing the paid count and date string
 *   - running the arrears check (A.chk, which mutates the loan in legacy code)
 *   - reading SETTLE_FEE_PCT from the environment (U.cfg)
 *   - computing lateFees via F.sumLate + A.adj and passing the result in
 *   - emitting the console.log line after the call
 */
export function calcSettlementResult(
  loanId: string,
  amount: number,
  termMonths: number,
  paid: number,
  asOf: Date,
  dpd: number,
  stage: string,
  lateFees: string,
  settleFeePercent: number
): SettlementOkResult {
  const tmp = (amount * (termMonths - paid)) / termMonths
  // KNOWN BUG: policy says "at least half" (paid * 2 >= termMonths) but the
  // original code uses strict >, so exactly half is not waived.
  const w = paid * 2 > termMonths
  const fee = w ? '0.00' : calcSettleFee(tmp, settleFeePercent)
  const tot = w ? round2(tmp) : Math.round((tmp + tmp * settleFeePercent) * 100) / 100
  return {
    st: 'OK',
    id: loanId,
    asOf: formatDate(asOf),
    paid,
    left: termMonths - paid,
    rp: round2(tmp),
    fee,
    waived: w,
    total: tot,
    dpd,
    stage,
    lateFees
  }
}

// ── Payment allocation ─────────────────────────────────────────────────────

export type AllocResult = {
  fees: number
  int: number
  prin: number
  overpayment: number
}

/**
 * Allocate a received payment across fees → interest → principal.
 * Returns the updated bucket values and any overpayment; the caller (the
 * legacy alloc wrapper) applies the results back to the installment item.
 */
export function allocPayment(
  fees: MoneyInput,
  int: MoneyInput,
  prin: MoneyInput,
  amount: MoneyInput
): AllocResult {
  let x = parseMoney(amount)
  if (x <= 0) {
    return { fees: parseMoney(fees), int: parseMoney(int), prin: parseMoney(prin), overpayment: 0 }
  }

  let f = parseMoney(fees)
  let i2 = parseMoney(int)
  let p = parseMoney(prin)

  if (x >= f) {
    x -= f
    f = 0
  } else {
    return { fees: round2(f - x), int: i2, prin: p, overpayment: 0 }
  }

  if (x >= i2) {
    x -= i2
    i2 = 0
  } else {
    return { fees: 0, int: round2(i2 - x), prin: p, overpayment: 0 }
  }

  if (x >= p) {
    x -= p
    p = 0
  } else {
    return { fees: 0, int: 0, prin: round2(p - x), overpayment: 0 }
  }

  return { fees: 0, int: 0, prin: 0, overpayment: round2(x) }
}

/** True when fees, interest, and principal have all been reduced to zero. */
export function isItemClear(fees: MoneyInput, int: MoneyInput, prin: MoneyInput): boolean {
  return parseMoney(fees) == 0 && parseMoney(int) == 0 && parseMoney(prin) == 0
}
