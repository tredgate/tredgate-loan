// @vitest-environment node

// Pin the timezone so all Date arithmetic in the legacy module is reproducible.
process.env.TZ = 'Europe/Prague'

import { describe, it, expect } from 'vitest'
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SCRIPT = path.resolve('scripts/nightly-fees.js')

function runNightly(bizDate: string, instFile: string, instOut: string) {
  return spawnSync(process.execPath, [SCRIPT, bizDate], {
    env: { ...process.env, TZ: 'Europe/Prague', INST_FILE: instFile, INST_OUT: instOut },
    encoding: 'utf8'
  })
}

/** Build a minimal installment item; all required fields default to "nothing owed, not overdue". */
function mkItem(overrides: Record<string, unknown>) {
  return {
    id: 'T-001',
    loan: 'ln-test',
    no: 1,
    due_date: '2026-10-15',
    amt: 1000,
    prin: 900,
    int: 100,
    fees: 0,
    paid: false,
    ret: false,
    rfc: false,
    lfc: false,
    hs: null,
    rcv: 0,
    ...overrides
  }
}

function writeFixture(filePath: string, items: object[], bizDate = '2026-10-15') {
  const data = { exported: '2026-01-01T00:00:00Z', bizDate, items }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + '\n')
}

/** Create a temp dir, run fn, then remove the dir even on failure. */
function withDir(fn: (instFile: string, instOut: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), 'tredgate-nightly-'))
  try {
    fn(path.join(dir, 'inst.json'), path.join(dir, 'inst.out.json'))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('nightly-fees.js', () => {

  // ── Not due ───────────────────────────────────────────────────────────────

  it('skips an installment whose due date equals the business date (dd=0)', () => {
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-15' })])  // dd=0, skipped
      expect(runNightly('2026-10-15', instFile, instOut).status).toBe(0)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
      expect(out.items[0].lfc).toBe(false)
    })
  })

  it('skips an installment that is not yet due', () => {
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-20' })])  // 5 days in future
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
    })
  })

  // ── DPD 10 / 11 boundary ─────────────────────────────────────────────────

  it('does NOT charge a late fee at exactly DPD=10 (dd > 10 check; nightly differs from fees.calc_late)', () => {
    // due 2026-10-05, biz 2026-10-15: dd = 10 exactly (both CEST +2, no DST crossing)
    // nightly uses dd > 10 (strictly greater), so no fee at exactly 10
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-05' })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
      expect(out.items[0].lfc).toBe(false)
    })
  })

  it('charges a late fee of $25 at exactly DPD=11', () => {
    // due 2026-10-04, biz 2026-10-15: dd = 11; 11 > 10 → fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', fees: 0, lfc: false })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(25)
    })
  })

  it('does not charge a second late fee when lfc is already true', () => {
    // lfc=true → late = dd > 10 && !lfc = false → fee skipped
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', fees: 25, lfc: true })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(25)  // unchanged
    })
  })

  // ── Returned-payment fee ──────────────────────────────────────────────────

  it('does NOT charge the returned-payment fee when the item is not yet overdue (dd=0) (current behavior)', () => {
    // The script skips all fee logic with `if (dd <= 0) continue`, so ret=true
    // has no effect until the item is at least 1 day past due.
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-15', ret: true, rfc: false })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
      expect(out.items[0].rfc).toBe(false)  // unchanged: skipped before ret branch
    })
  })

  it('charges a returned-payment fee of $15 when ret=true and dd=1 (1 day overdue)', () => {
    // dd=1 → passes the `if (dd <= 0) continue` guard; late=false (1 ≤ 10)
    // ret=true, rfc=false → tmp += F.fee("ret") = 15; rfc set to true
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-14', ret: true, rfc: false })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(15)
      expect(out.items[0].rfc).toBe(true)
    })
  })

  it('charges both returned-payment fee ($15) and late fee ($25) when dd=11 and ret=true', () => {
    // dd=11 → late=true; ret=true, rfc=false → tmp = 15 + 25 = 40; lfc set to true
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', ret: true, rfc: false, lfc: false, fees: 0 })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(40)
      expect(out.items[0].rfc).toBe(true)
      expect(out.items[0].lfc).toBe(true)
    })
  })

  it('does not repeat the returned-payment fee when rfc is already true — late fee is still added', () => {
    // rfc=true → ret branch skipped (no $15 again);  lfc=false, dd=11 → else-if-late adds $25
    // existing fees=15; after: fees = r2(15 + 25) = 40
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', ret: true, rfc: true, lfc: false, fees: 15 })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(40)
      expect(out.items[0].rfc).toBe(true)  // unchanged
    })
  })

  // ── Payment received (alloc) ──────────────────────────────────────────────

  it('applies a received partial payment and leaves the item unpaid', () => {
    // rcv=200, fees=25, int=100, prin=900 (not overdue: due_date=2026-10-20)
    // alloc: fees 25→0 (x=175), int 100→0 (x=75), prin 900 − 75 = 825
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-20', fees: 25, int: 100, prin: 900, rcv: 200 })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      const it = out.items[0]
      expect(it.fees).toBe(0)
      expect(it.int).toBe(0)
      expect(it.prin).toBe(825)
      expect(it.rcv).toBe(0)
      expect(it.paid).toBe(false)
    })
  })

  it('marks an item paid when the received payment fully clears fees, interest and principal', () => {
    // rcv=1025 = 25+100+900; alloc drains all three → isClear → paid=true
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-20', fees: 25, int: 100, prin: 900, rcv: 1025 })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      const it = out.items[0]
      expect(it.fees).toBe(0)
      expect(it.int).toBe(0)
      expect(it.prin).toBe(0)
      expect(it.rcv).toBe(0)
      expect(it.paid).toBe(true)
    })
  })

  it('skips an already paid item and leaves it unchanged', () => {
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', paid: true, fees: 25 })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].paid).toBe(true)
      expect(out.items[0].fees).toBe(25)  // unchanged
    })
  })

  // ── Idempotency ───────────────────────────────────────────────────────────

  it('pure late fee accumulates on the second run because lfc is never set in the else-if-late path (current behavior)', () => {
    // The `else if (late)` branch adds the fee but does NOT set lfc=true.
    // On every subsequent run with dd > 10, the fee fires again.
    // Run 1: fees 0→25, lfc stays false.   Run 2: fees 25→50.
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', fees: 0, lfc: false })])

      runNightly('2026-10-15', instFile, instOut)
      const after1 = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(after1.items[0].fees).toBe(25)
      expect(after1.items[0].lfc).toBe(false)  // lfc never set (current behavior)

      // second run reads INST_OUT (now exists) and charges the fee again
      runNightly('2026-10-15', instFile, instOut)
      const after2 = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(after2.items[0].fees).toBe(50)  // fee doubled (current behavior)
      expect(after2.items[0].lfc).toBe(false)
    })
  })

  it('returned-payment + late fee is idempotent after the first run', () => {
    // After run 1: rfc=true, lfc=true → both guards prevent re-charging on run 2.
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-04', ret: true, rfc: false, lfc: false, fees: 0 })])

      runNightly('2026-10-15', instFile, instOut)
      const after1 = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(after1.items[0].fees).toBe(40)
      expect(after1.items[0].rfc).toBe(true)
      expect(after1.items[0].lfc).toBe(true)

      runNightly('2026-10-15', instFile, instOut)
      const after2 = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(after2.items[0].fees).toBe(40)  // unchanged
      expect(after2.items[0].rfc).toBe(true)
      expect(after2.items[0].lfc).toBe(true)
    })
  })

  // ── Hardship arrangement ─────────────────────────────────────────────────

  it('does not charge a late fee on an item with active hardship (hs.a truthy), even at DPD > 10', () => {
    // dd=11 → late=true; A.adj(it, 25) checks hs.a=1 → returns 0; tmp=0 → no fee change
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({
        due_date: '2026-10-04',
        hs: { a: 1, from: '2026-10-01', opt: 'HOL' }
      })])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
    })
  })

  // ── DST boundaries ────────────────────────────────────────────────────────

  it('fall-back DST: 10 calendar days spanning 2026-10-25 yields dd=10.04 — late fee charged', () => {
    // due 2026-10-16 (CEST +2) = UTC 2026-10-15T22:00Z
    // biz 2026-10-26 (CET  +1) = UTC 2026-10-25T23:00Z  (after fall-back 03:00→02:00)
    // dd = (10d + 1h) / 86400 = 10.0417 → r2 = 10.04;  10.04 > 10 → fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-10-16' })], '2026-10-26')
      runNightly('2026-10-26', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(25)
    })
  })

  it('spring-forward DST: 11 calendar days spanning 2026-03-29 yields dd=10.96 — late fee charged', () => {
    // due 2026-03-19 (CET +1) = UTC 2026-03-18T23:00Z
    // biz 2026-03-30 (CEST+2) = UTC 2026-03-29T22:00Z  (after spring-forward 02:00→03:00)
    // dd = (10d 23h) / 86400 = 10.9583 → r2 = 10.96;  10.96 > 10 → fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-03-19' })], '2026-03-30')
      runNightly('2026-03-30', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(25)
    })
  })

  it('spring-forward DST: 10 calendar days spanning 2026-03-29 yields dd=9.96 — no late fee', () => {
    // due 2026-03-20 (CET +1) = UTC 2026-03-19T23:00Z
    // biz 2026-03-30 (CEST+2) = UTC 2026-03-29T22:00Z
    // dd = (9d 23h) / 86400 = 9.9583 → r2 = 9.96;  9.96 > 10 → false → no fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({ due_date: '2026-03-20' })], '2026-03-30')
      runNightly('2026-03-30', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.items[0].fees).toBe(0)
    })
  })

  // ── Output metadata ───────────────────────────────────────────────────────

  it('writes lastRun equal to the business date in the output file', () => {
    withDir((instFile, instOut) => {
      writeFixture(instFile, [mkItem({})])
      runNightly('2026-10-15', instFile, instOut)
      const out = JSON.parse(readFileSync(instOut, 'utf8'))
      expect(out.lastRun).toBe('2026-10-15')
    })
  })
})
