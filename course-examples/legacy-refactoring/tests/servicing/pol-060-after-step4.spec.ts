// @vitest-environment node

/**
 * Spec tests for POL-060 – Fees, Arrears and Collections.
 *
 * Every test in this file asserts the POLICY rule (what the code should do).
 * Tests marked `it.fails` identify a known divergence between the code and the
 * policy; the comment in each case names the difference.  Remove `it.fails`
 * when the bug is fixed and the assertion starts to pass.
 *
 * Callers tested:
 *   - scripts/nightly-fees.js (batch job)         – late fee, allocation, hardship
 *   - GET /api/loans/:id/settlement-quote (HTTP)  – settlement fee, waiver, late fee in quote
 *
 * Policy rules covered (source document, heading):
 *   POL-060#2  Fee schedule       – origination fee limits, late fee $25 > 10 DPD,
 *                                   at-most-one-per-installment, returned-payment $15,
 *                                   settlement fee 1 %, waiver at >= half installments paid
 *   POL-060#3  Fee schedule (2)   – worked examples (25,000/24/0.08; edge amounts)
 *   POL-060#5  Collections        – payment allocation order (fees → interest → principal)
 *   POL-060#6  Hardship           – late fees waived during active hardship arrangement
 *   POL-060#7  Hardship (2)       – worked example (45,000/36/0.075, 12 installments paid)
 *
 * Open questions → reports/legacy-map.md
 */
process.env.TZ = "Europe/Prague";

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFileSync, readFileSync, mkdtempSync, rmSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { pino } from "pino";
import { createApp } from "../../server/app";
import { createLoanStore } from "../../server/loanStore";

// ─────────────────────────────────────────────────────────────────────────────
// Nightly-job helpers
// ─────────────────────────────────────────────────────────────────────────────

const SCRIPT = path.resolve("scripts/nightly-fees.js");

function runNightly(bizDate: string, instFile: string, instOut: string) {
  return spawnSync(process.execPath, [SCRIPT, bizDate], {
    env: {
      ...process.env,
      TZ: "Europe/Prague",
      INST_FILE: instFile,
      INST_OUT: instOut,
    },
    encoding: "utf8",
  });
}

function mkItem(overrides: Record<string, unknown>) {
  return {
    id: "T-001",
    loan: "ln-test",
    no: 1,
    due_date: "2026-10-15",
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
    ...overrides,
  };
}

function writeFixture(
  filePath: string,
  items: object[],
  bizDate = "2026-10-15",
) {
  writeFileSync(
    filePath,
    JSON.stringify(
      { exported: "2026-01-01T00:00:00Z", bizDate, items },
      null,
      2,
    ) + "\n",
  );
}

function withDir(fn: (instFile: string, instOut: string) => void) {
  const dir = mkdtempSync(path.join(tmpdir(), "tredgate-pol060-"));
  try {
    fn(path.join(dir, "inst.json"), path.join(dir, "inst.out.json"));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API helpers and seed data
// ─────────────────────────────────────────────────────────────────────────────

// POL-060 worked-example seed loans:
//   sq-001: 25,000 USD / 24 months / 0.08  (fee-schedule worked example, POL-060#3)
//           start 2026-08-03 → installment 1 due 2026-09-03
//   sq-hs : 45,000 USD / 36 months / 0.075 (hardship worked example, POL-060#7)
//           start 2026-08-03 → installment 1 due 2026-09-03
const SEED = [
  {
    id: "sq-001",
    applicantName: "Policy Example",
    amount: 25000,
    termMonths: 24,
    interestRate: 0.08,
    status: "approved",
    createdAt: "2026-08-03T00:00:00.000Z",
  },
  {
    id: "sq-hs",
    applicantName: "Hardship Example",
    amount: 45000,
    termMonths: 36,
    interestRate: 0.075,
    status: "approved",
    createdAt: "2026-08-03T00:00:00.000Z",
  },
];

let server: Server;
let baseUrl: string;
let dataDir: string;

async function api<T>(route: string): Promise<{ status: number; body: T }> {
  const response = await fetch(`${baseUrl}/api${route}`);
  return { status: response.status, body: (await response.json()) as T };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1.  Late payment fee
//     POL-060#2: "$25 per installment, when an installment is more than 10 days
//                past due"
//     POL-060#5: "The late payment fee of 25 USD is applied on day 11."
//     Caller: nightly-fees.js (uses dd > 10, which matches the policy).
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 late payment fee — nightly-fees.js", () => {
  it("charges $25 on day 11 (first day that is more than 10 days past due)", () => {
    // due 2026-10-04, biz 2026-10-15: dd = 11; 11 > 10 → $25 fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({ due_date: "2026-10-04", fees: 0, lfc: false }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(25);
    });
  });

  it("does NOT charge at exactly DPD = 10 (not yet more than 10 days past due)", () => {
    // due 2026-10-05, biz 2026-10-15: dd = 10; 10 > 10 is false → no fee
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({ due_date: "2026-10-05", fees: 0, lfc: false }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2.  At most one late fee per installment
//     POL-060#2: "At most one fee per installment"
//     Caller: nightly-fees.js (idempotency across runs).
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 at most one late fee per installment — nightly-fees.js", () => {
  // Bug: the else-if-late path in nightly-fees.js never sets lfc = true when
  // the returned-payment branch is not taken, so the $25 fee fires again on
  // every subsequent run while dd > 10.
  it.fails(
    "does not charge a second late fee when the nightly job runs again on the same installment",
    () => {
      // Policy: one $25 late fee per installment, ever.
      // Bug: `else if (late)` adds the fee but skips `it.lfc = true`, so run 2 adds another $25.
      withDir((instFile, instOut) => {
        writeFixture(instFile, [
          mkItem({ due_date: "2026-10-04", fees: 0, lfc: false }),
        ]);
        runNightly("2026-10-15", instFile, instOut);
        runNightly("2026-10-15", instFile, instOut); // second run on the same date
        const out = JSON.parse(readFileSync(instOut, "utf8"));
        expect(out.items[0].fees).toBe(25); // still $25, not $50
      });
    },
  );

  it("does not charge a second late fee when lfc is already set (ret+late path is idempotent)", () => {
    // When the returned-payment branch fires on the first run it sets both rfc=true and
    // lfc=true, so subsequent runs skip both fees.
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-04",
          ret: true,
          rfc: false,
          lfc: false,
          fees: 0,
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(40); // $15 + $25, not $40 + $25
      expect(out.items[0].lfc).toBe(true);
      expect(out.items[0].rfc).toBe(true);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3.  Returned payment fee
//     POL-060#2: "15 USD when a payment is reversed by the applicant's bank;
//                in addition to any late payment fee"
//     Caller: nightly-fees.js.
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 returned payment fee — nightly-fees.js", () => {
  it("charges $15 when a payment has been reversed (ret=true)", () => {
    // dd=1 (overdue, no late fee yet); ret=true, rfc=false → +$15
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({ due_date: "2026-10-14", ret: true, rfc: false }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(15);
      expect(out.items[0].rfc).toBe(true);
    });
  });

  it("charges $15 returned-payment fee AND $25 late fee when dd > 10 (both fees apply)", () => {
    // dd=11; ret=true → both branches fire in one pass: 15 + 25 = 40
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-04",
          ret: true,
          rfc: false,
          lfc: false,
          fees: 0,
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(40);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4.  Payment allocation order
//     POL-060#5: "Amounts recovered are applied first to fees, then to interest,
//                then to principal"
//     Caller: nightly-fees.js (via settlement.alloc).
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 payment allocation order: fees → interest → principal — nightly-fees.js", () => {
  it("applies a partial payment to fees first, then interest, then principal", () => {
    // rcv=200; fees=25 → cleared (x=175), int=100 → cleared (x=75), prin=900−75=825
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-20",
          fees: 25,
          int: 100,
          prin: 900,
          rcv: 200,
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      const it = out.items[0];
      expect(it.fees).toBe(0);
      expect(it.int).toBe(0);
      expect(it.prin).toBe(825);
      expect(it.rcv).toBe(0);
      expect(it.paid).toBe(false);
    });
  });

  it("a payment that exactly covers fees + interest does not touch principal", () => {
    // rcv=125 = 25+100; fees=0, int=0, prin unchanged at 900 → not yet paid
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-20",
          fees: 25,
          int: 100,
          prin: 900,
          rcv: 125,
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      const it = out.items[0];
      expect(it.fees).toBe(0);
      expect(it.int).toBe(0);
      expect(it.prin).toBe(900);
      expect(it.paid).toBe(false);
    });
  });

  it("marks the installment paid when fees + interest + principal are fully cleared", () => {
    // rcv=1025 = 25+100+900; all buckets → 0 → paid=true
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-20",
          fees: 25,
          int: 100,
          prin: 900,
          rcv: 1025,
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].paid).toBe(true);
      expect(out.items[0].fees).toBe(0);
      expect(out.items[0].int).toBe(0);
      expect(out.items[0].prin).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5.  Hardship: no late fees during the arrangement
//     POL-060#6: "Late payment fees accrued since the start of the hardship period
//                are waived"
//     POL-060#2: "Hardship arrangement … Late fees accrued during the arrangement
//                are waived"
//     Caller: nightly-fees.js (via arrears.adj).
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 hardship waiver — nightly-fees.js", () => {
  it("does not charge a late fee when a hardship arrangement is active (hs.a truthy)", () => {
    // dd=11 (would normally trigger $25); hs.a=1 → adj() returns 0 → fee suppressed
    withDir((instFile, instOut) => {
      writeFixture(instFile, [
        mkItem({
          due_date: "2026-10-04",
          hs: { a: 1, from: "2026-10-01", opt: "HOL" },
        }),
      ]);
      runNightly("2026-10-15", instFile, instOut);
      const out = JSON.parse(readFileSync(instOut, "utf8"));
      expect(out.items[0].fees).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6.  Early settlement fee and waiver
//     POL-060#2: "1% of the remaining principal … on full early repayment;
//                Waived once at least half of the installments have been paid"
//     POL-060#3: worked example (25,000 / 24 months / 0.08)
//     POL-060#7: worked example (45,000 / 36 months / 0.075)
//     Caller: GET /api/loans/:id/settlement-quote.
// ─────────────────────────────────────────────────────────────────────────────
describe("POL-060 settlement fee and waiver — GET /api/loans/:id/settlement-quote", () => {
  beforeEach(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), "tredgate-pol060-api-"));
    const seedPath = path.join(dataDir, "seed.json");
    await writeFile(seedPath, JSON.stringify(SEED));
    const store = createLoanStore({
      filePath: path.join(dataDir, "loans.json"),
      seedPath,
    });
    const app = createApp({ store, logger: pino({ level: "silent" }) });
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => resolve());
    });
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
    await rm(dataDir, { recursive: true, force: true });
  });

  // ── POL-060#3 worked example ───────────────────────────────────────────────

  it("POL-060#3: settlement after 6 installments = 18,937.50 USD (25,000 / 24 months / 0.08)", async () => {
    // Remaining principal: 25,000 × (24−6)/24 = 25,000 × 18/24 = 18,750.00 USD
    // Settlement fee:      18,750 × 0.01 = 187.50 USD
    // Settlement figure:   18,750 + 187.50 = 18,937.50 USD
    // (6 installments paid; 6*2 = 12 which is not > 24 → fee not waived)
    const { status, body } = await api<Record<string, unknown>>(
      "/loans/sq-001/settlement-quote?paid=6&date=2026-09-10",
    );
    expect(status).toBe(200);
    expect(body.rp).toBe(18750);
    expect(body.fee).toBe("187.50");
    expect(body.waived).toBe(false);
    expect(body.total).toBe(18937.5);
  });

  // POL-060#3: "After 12 installments, half the term has been paid, the fee is
  // waived, and the settlement figure is the remaining principal of 12,500.00 USD."
  // Bug: settlement.js checks paid*2 > term (strict >), so 12*2 = 24 is not > 24
  // and the fee is charged; policy says "at least half" (paid*2 >= term).
  it.fails(
    "POL-060#3: fee waived and settlement = 12,500.00 USD at exactly half installments paid (12/24)",
    async () => {
      // Remaining principal: 25,000 × 12/24 = 12,500.00 USD
      // Policy: fee waived (12 of 24 = "at least half") → total = 12,500.00 USD
      // Bug: code uses strict >, so 12*2 = 24 is not > 24 → fee charged → total = 12,625.00 USD
      const { body } = await api<Record<string, unknown>>(
        "/loans/sq-001/settlement-quote?paid=12&date=2026-09-10",
      );
      expect(body.rp).toBe(12500);
      expect(body.fee).toBe("0.00");
      expect(body.waived).toBe(true);
      expect(body.total).toBe(12500);
    },
  );

  it("fee is waived when strictly more than half of installments have been paid (13/24)", async () => {
    // 13*2 = 26 > 24 → waived in both policy and code; rp = 25,000 × 11/24 = 11,458.33
    const { body } = await api<Record<string, unknown>>(
      "/loans/sq-001/settlement-quote?paid=13&date=2026-09-10",
    );
    expect(body.waived).toBe(true);
    expect(body.fee).toBe("0.00");
  });

  // ── Late fee in the settlement quote ──────────────────────────────────────
  //    POL-060#2,#5: late fee is "more than 10 days past due" = day 11+.

  // Bug: fees.calc_late uses d >= 10 (fires on day 10), while the policy says
  // "> 10 days" and the collections procedure explicitly says "applied on day 11".
  it.fails(
    "late fee is NOT included at exactly DPD = 10 (policy: more than 10 days past due)",
    async () => {
      // sq-001 inst 1 due 2026-09-03; asOf 2026-09-13 → dd = 10 exactly
      // Policy: DPD = 10 is not "more than 10 days past due" → lateFees = "0.00"
      // Bug: fees.calc_late uses d >= 10, so lateFees = "25.00"
      const { body } = await api<Record<string, unknown>>(
        "/loans/sq-001/settlement-quote?paid=0&date=2026-09-13",
      );
      expect(body.lateFees).toBe("0.00");
    },
  );

  it("late fee $25 is included in the settlement quote at DPD = 11", async () => {
    // asOf 2026-09-14; dd = 11 > 10 → late fee per policy
    const { body } = await api<Record<string, unknown>>(
      "/loans/sq-001/settlement-quote?paid=0&date=2026-09-14",
    );
    expect(body.lateFees).toBe("25.00");
  });

  // ── POL-060#7 worked example ───────────────────────────────────────────────

  it("POL-060#7: remaining principal after 12 installments on 45,000/36/0.075 = 30,000 USD", async () => {
    // Remaining principal: 45,000 × (36−12)/36 = 45,000 × 24/36 = 30,000 USD
    // Settlement fee:      30,000 × 0.01 = 300.00 USD  (12*2 = 24 is not > 36 → not waived)
    // Settlement figure:   30,000 + 300 = 30,300 USD
    // (The worked example notes the Tredgate Loan record does not change — the quote
    //  reflects the original approved terms, not a hypothetical Core Banking schedule.)
    const { status, body } = await api<Record<string, unknown>>(
      "/loans/sq-hs/settlement-quote?paid=12&date=2026-09-10",
    );
    expect(status).toBe(200);
    expect(body.rp).toBe(30000);
    expect(body.fee).toBe("300.00");
    expect(body.waived).toBe(false);
    expect(body.total).toBe(30300);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7.  Origination fee limits (POL-060#2, #3)
//
//     Policy: 1.5 % of approved amount, minimum 50 USD, maximum 1,500 USD.
//     Worked examples: 1,000 USD → 50 USD (minimum); 100,000+ USD → 1,500 USD (maximum).
//
//     NOTE: the origination fee is computed in fees.js (calc_orig / netProceeds)
//     but is NOT applied by any API endpoint or nightly job in this repository.
//     There is therefore no higher-level caller through which to test this rule.
//     See "Open questions" in reports/legacy-map.md for details.
// ─────────────────────────────────────────────────────────────────────────────
