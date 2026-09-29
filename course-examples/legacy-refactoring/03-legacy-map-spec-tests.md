 Legacy Servicing Module Map

**Module:** `legacy/servicing/` (four CommonJS files: `util.js`, `arrears.js`, `fees.js`, `settlement.js`)  
**Module package name:** `cb-servicing` v2.3.1 (`legacy/package.json`)

---

## 1. Entry Points

Every place in the repository that uses this module (files outside `legacy/` only, because `legacy/` is self-contained).

| File | Line(s) | What is imported |
|------|---------|-----------------|
| `scripts/nightly-fees.js` | 6 | `require('../legacy/servicing/util.js')` as `U` |
| `scripts/nightly-fees.js` | 7 | `require('../legacy/servicing/arrears.js')` as `A` |
| `scripts/nightly-fees.js` | 8 | `require('../legacy/servicing/fees.js')` as `F` |
| `scripts/nightly-fees.js` | 9 | `require('../legacy/servicing/settlement.js')` as `S` |
| `server/app.ts` | 12–13 | `createRequire(…)('../legacy/servicing/settlement.js')` — typed as `{ quote }` only |

`nightly-fees.js` is invoked via the npm script `legacy:nightly` (`package.json` line 21) and is excluded from ESLint (`eslint.config.js` line 22).  
`server/app.ts` uses `settlement.quote` in the HTTP handler `GET /api/loans/:id/settlement-quote` (line 70).

No other file in the repository (`src/`, `server/`, `shared/`, `tests/`, `rag/`) imports or references the legacy servicing module.

---

## 2. Business Rules

### util.js

| Function | File:line | Rule / Calculation | Constants used | Inputs | Output |
|----------|-----------|-------------------|----------------|--------|--------|
| `r2(x)` | `util.js:14` | Round to 2 decimal places: `Math.round(x * 100) / 100` | — | `x`: number | number |
| `money(v)` | `util.js:18` | Coerce to currency number: strip commas/spaces, `parseFloat`; undefined/null/empty → 0; NaN → 0 | — | `v`: string \| number \| null \| undefined | number |
| `pd(s)` | `util.js:29` | Parse date string `YYYY-MM-DD` or `Date` object → midnight `Date`; invalid → `-1` | — | `s`: string \| Date | Date \| -1 |
| `dd(a, b)` | `util.js:68` | Days between two dates: `(b - a) / 86400000` (rounded to 2dp) | 86400000 | `a`, `b`: Date | number \| -1 if not Date |
| `addM(dt, k)` | `util.js:73` | Add `k` calendar months to `dt`; clamp to last day of month | — | `dt`: Date, `k`: number | Date |
| `today()` | `util.js:62` | Current date at midnight: reads system clock | — | — | Date |
| `cfg(k, def)` | `util.js:80` | Read env var `k`; cache in `C['cfg_'+k]`; return `def` if unset | — | `k`: string, `def`: any | string \| def |
| `chkLoan(l)` | `util.js:87` | Validate loan has `amount > 0`, `termMonths > 0`, `interestRate` is a number | — | `l`: any | `'OK'` \| `'ERR_0'` (string) |

### arrears.js

| Function | File:line | Rule / Calculation | Constants used | Inputs | Output |
|----------|-----------|-------------------|----------------|--------|--------|
| `getStage(d)` | `arrears.js:28` | DPD → arrears stage: ≤0→0, 1–30→1, 31–60→2, 61–90→3, ≥91→4 | thresholds 30, 60, 90 | `d`: number (days past due) | 0–4 (number) |
| `dueDate(l, k)` | `arrears.js:22` | Due date for installment `k`: start date + `k` months via `addM` | — | `l`: loan object, `k`: number | Date \| -1 |
| `start(l)` | `arrears.js:16` | Extract start date: `l.disbursedAt \|\| l.createdAt` | — | `l`: loan object | Date \| -1 |
| `chk(l, dt, n)` | `arrears.js:44` | Compute DPD for installment `n+1` at date `dt`; collect all overdue installments; set `l.dpd`, `l.stg`, `l.od` (mutates `l`); also write global `U.C.last`; if `n+1 > termMonths`, loan is current (dpd=0, od=[]) | — | `l`: loan object, `dt`: string \| undefined, `n`: number \| undefined | stage 0–4, or -1 on error |
| `adj(x, f)` | `arrears.js:74` | Return `0` (or `'0.00'` for string `f`) if item has hardship active (`x.hs.a`), else return `f` unchanged | — | `x`: installment object, `f`: number \| string | same type as `f`, or zero-equivalent |
| `hsOk(l)` | `arrears.js:80` | Hardship eligibility: stage must be 1, 2, or 3; falls back to `U.C.last.stg` if `l.stg` is undefined and IDs match | — | `l`: loan object | boolean |
| `label(s)` | `arrears.js:33` | Map stage number to string from `LBL` array | `LBL = ['CURRENT','STAGE_1','STAGE_2','STAGE_3','STAGE_4']` | `s`: number | string |
| `action(s)` | `arrears.js:37` | Map stage to action string from `ACT` map | `ACT = {0:'none',1:'reminder',2:'call_letter',3:'demand_restrict',4:'default_referral'}` | `s`: number | string |
| `summary(l)` | `arrears.js:86` | Return `{stage, action, dpd, overdue, hardshipAllowed}` from already-computed loan fields | — | `l`: loan object | object |

### fees.js

| Function | File:line | Rule / Calculation | Constants used | Inputs | Output |
|----------|-----------|-------------------|----------------|--------|--------|
| `calc_orig` | `fees.js:6` | Origination fee: `amount × 0.015`, min $50, max $1500 | 0.015, 50, 1500 | `l`: loan object or amount number | string (e.g. `"375.00"`) |
| `calc_late` | `fees.js:11` | Late fee: $25 if `dpd >= 10`, else $0; falls back to `U.C.last.dpd` if `x.dpd` is absent | 10, 25 | `x`: `{dpd}` object or undefined | string (`"25.00"` or `"0.00"`) |
| `calc_ret` | `fees.js:19` | Returned payment fee: flat $15 | 15 | — | string (`"15.00"`) |
| `calc_settle` | `fees.js:22` | Settlement fee: `remainingPrincipal × pct` (default 1%) | default 0.01 | `rp`: number (remaining principal), `pct`: number \| undefined | string (e.g. `"187.50"`) |
| `fee(type, a, b)` | `fees.js:27` | Dispatcher: calls `handlers['calc_'+type](a, b)`; returns -1 with `console.warn` for unknown type | — | `type`: string, `a`/`b`: any | string \| -1 (number) |
| `sumLate(l)` | `fees.js:36` | Sum late fees across all `l.od` overdue items; skips items where `fee` returns -1 | — | `l`: loan with `l.od` array from `chk()` | string (e.g. `"50.00"`) |
| `netProceeds(l)` | `fees.js:44` | `l.amount − originationFee`; returns -1 if fee call fails | — | `l`: loan object | number \| -1 |

### settlement.js

| Function | File:line | Rule / Calculation | Constants used | Inputs | Output |
|----------|-----------|-------------------|----------------|--------|--------|
| `split(l)` | `settlement.js:7` | Per-installment breakdown (flat rate, non-amortising): `prin = amount/term`, `int = amount×rate/term`, `inst = prin+int`; each rounded to 2dp | — | `l`: loan object | `{prin, int, inst}` numbers |
| `sched(l)` | `settlement.js:13` | Full installment schedule: one entry per month with due date, prin, int, amt | — | `l`: loan object | array of `{no, due, prin, int, amt}` \| -1 |
| `quote(l, paid, dt)` | `settlement.js:22` | Settlement quote: (1) validate loan, paid, date; (2) run `A.chk` (mutates `l`); (3) remaining principal = `amount × (term − paid) / term`; (4) settlement fee = `rp × SETTLE_FEE_PCT` (env, default 1%); (5) waive fee if `paid × 2 > term`; (6) total = `rp + fee` or `rp` if waived | env `SETTLE_FEE_PCT` default 0.01 | `l`: loan object, `paid`: string \| number (installments paid), `dt`: string (YYYY-MM-DD) \| undefined | object with `{st, id, asOf, paid, left, rp, fee, waived, total, dpd, stage, lateFees}` \| `{st: 'ERR_1'|'ERR_2'|'ERR_3'}` \| -1 (`ERR_0`) |
| `alloc(it, amt)` | `settlement.js:63` | Allocate payment waterfall: fees first, then interest, then principal; each field mutated on `it`; returns overpayment remainder | — | `it`: installment object with `{fees, int, prin}`, `amt`: number \| string | number (overpayment, ≥ 0) |
| `isClear(it)` | `settlement.js:87` | Returns true iff `fees`, `int`, and `prin` all equal 0 (via `money()`) | — | `it`: installment object | boolean |

### nightly-fees.js (entry point script, not a module)

| Rule | File:line | Description |
|------|-----------|-------------|
| Read source file | `nightly-fees.js:12–18` | Reads `INST_OUT` if it exists, else `INST_FILE`; parses JSON |
| Business date | `nightly-fees.js:20–24` | `argv[2]` → `data.bizDate` → `new Date()` (system clock) |
| Skip paid | `nightly-fees.js:36–39` | Items with `paid: true` are counted as `skipped` and not processed |
| Apply received payment | `nightly-fees.js:41–52` | If `it.rcv > 0`, call `S.alloc(it, it.rcv)` (mutates item); set `it.rcv = 0`; if `S.isClear`, mark `it.paid = true` |
| Late fee threshold | `nightly-fees.js:58–59` | `dd > 10` (DPD strictly greater than 10); fee amount = `A.adj(it, 25)` (i.e. $25 or $0 for hardship) |
| Returned payment fee | `nightly-fees.js:63–69` | If `it.ret && !it.rfc`, add `F.fee('ret')` ($15) and set `it.rfc = true`; combine with late fee in same pass |
| Accumulate fees | `nightly-fees.js:79–82` | `it.fees = U.r2(U.money(it.fees) + tmp)` |
| Write output | `nightly-fees.js:86` | Write JSON to `INST_OUT` (default `legacy/data/installments.out.json`) |

---

## 3. Side Effects

### Environment variables read

| Variable | File:line | Default | Purpose |
|----------|-----------|---------|---------|
| `SVC_DEBUG` | `util.js:8` | (unset = off) | Enables debug logging to `console.log` |
| `SETTLE_FEE_PCT` | `settlement.js:33` via `cfg()` | `'0.01'` | Settlement fee percentage as string |
| `INST_FILE` | `nightly-fees.js:10` | `'legacy/data/installments.json'` | Input installment file path |
| `INST_OUT` | `nightly-fees.js:11` | `'legacy/data/installments.out.json'` | Output installment file path |

### System clock reads

| Call | File:line | When |
|------|-----------|------|
| `util.js:today()` | `util.js:62–65` | Called by `arrears.chk()` (line 45) and `settlement.quote()` (line 30) when `dt` is omitted; called directly in `nightly-fees.js` line 20 |
| `new Date().toISOString()` | `util.js:9`, `nightly-fees.js:29` | Every `log()` call; nightly start banner |
| `Date.now()` | `arrears.js:70` | Written to `U.C.last.at` on every `chk()` call |

### Console / logging

| Call | File:line | Trigger |
|------|-----------|---------|
| `console.log` (via `util.log`) | `util.js:9` | When `SVC_DEBUG` is set; logs `cfg`, `fee`, `chk`, `adj`, `alloc` events |
| `console.warn` | `arrears.js:19` | No start date on loan in `start()` |
| `console.warn` | `fees.js:31` | Unknown fee type in `fee()` |
| `console.log` | `settlement.js:58` | Every `quote()` call: `'settlement quote ' + l.id + ' paid ' + x2 + ' total ' + tot` — **unconditional**, not gated on `SVC_DEBUG` |
| `console.log` / `console.warn` | `nightly-fees.js` (many) | Progress and fee application events |
| `console.error` | `nightly-fees.js:17, 22` | File read failure; bad business date (exits) |

### Global / shared state mutations

| State | Written by | File:line | Read by | File:line |
|-------|-----------|-----------|---------|-----------|
| `U.C` object (module-level, shared across all callers in the same process) | `cfg()` | `util.js:81–85` | `cfg()` | `util.js:80` |
| `U.C.last` (`{id, dpd, stg, at}`) | `arrears.chk()` | `arrears.js:70` | `fees.calc_late()` (fallback) | `fees.js:13`; `arrears.hsOk()` | `arrears.js:81` |

`U.C` is the module's singleton cache. Because Node.js caches `require()` results, all callers in the same process share this object. `U.C.last` is updated by every `chk()` call and used as a fallback for `calc_late()` and `hsOk()` — the two functions assume `chk()` was called first on the same loan.

### Object mutations (passed-in objects modified in place)

| Function | File:line | Fields mutated |
|----------|-----------|---------------|
| `arrears.chk(l, …)` | `arrears.js:56–71` | `l.dpd`, `l.stg`, `l.od` |
| `settlement.quote(l, …)` | `settlement.js:34` (via `A.chk`) | `l.dpd`, `l.stg`, `l.od` (same mutation) |
| `settlement.alloc(it, …)` | `settlement.js:63–86` | `it.fees`, `it.int`, `it.prin` |
| `nightly-fees.js` main loop | lines 44–83 | `it.fees`, `it.rfc`, `it.lfc`, `it.prin`, `it.int`, `it.rcv`, `it.paid` |

**Consequence for `server/app.ts`:** `servicing.quote(loan, …)` (line 73) mutates the `LoanApplication` object returned from `loans.get()`. If that object is also held in the store's in-memory cache, the `dpd`/`stg`/`od` fields are silently added to it. These fields are not part of the `LoanApplication` type in `shared/loan.ts`.

### File I/O (nightly-fees.js only)

| Operation | File:line | Path |
|-----------|-----------|------|
| `fs.readFileSync` | `nightly-fees.js:14` | `INST_OUT` or `INST_FILE` |
| `fs.writeFileSync` | `nightly-fees.js:86` | `INST_OUT` |

---

## 4. Duplication

### Monthly installment calculation

`settlement.js:split()` (lines 7–11) and `shared/loanRules.ts:calculateMonthlyPayment()` (lines 63–66) both implement the same flat-rate formula: total = amount × (1 + rate), monthly = total / term.

They are **mathematically equivalent** (`split.inst === calculateMonthlyPayment`), but not identical in implementation: `split()` rounds `prin` and `int` independently to 2dp and then sums, while `calculateMonthlyPayment()` rounds nothing. For almost all inputs the results are the same, but if `r2(prin) + r2(int) ≠ r2(prin + int)` due to half-up rounding, `split.inst` could differ from `calculateMonthlyPayment` by $0.01.

The UI (`LoanSummary.vue` and `LoanList.vue`) uses `calculateMonthlyPayment()` via `shared/loanRules.ts`. The settlement endpoint uses `split()` indirectly through the remaining-principal formula in `quote()`. This means the installment shown in the UI and the principal breakdown in a settlement quote can disagree by a cent.

### Loan validation

`util.js:chkLoan()` (lines 87–94) and `shared/loanRules.ts:validateLoanInput()` (lines 31–47) both validate a loan object, but they are **not equivalent**:

| Check | `chkLoan` | `validateLoanInput` |
|-------|-----------|---------------------|
| `amount > 0` | yes | yes (type-checked too) |
| `termMonths > 0` | yes | yes, integer only |
| `interestRate` is number | yes | yes, and range 0–1 enforced |
| `applicantName` present | **no** | yes |
| Returns | error code string | throws `LoanValidationError` |

`chkLoan` is less strict (accepts fractional termMonths, accepts any interestRate number). The two copies serve different purposes (legacy servicing vs. new API), but a loan that passes `validateLoanInput` will always pass `chkLoan`.

---

## 5. Suspicious Code

### 5a. `fees.js:calc_late` fallback to `U.C.last.dpd` (lines 12–14)

```js
if (x && typeof x.dpd == 'number') d = x.dpd;
else if (U.C.last) d = U.C.last.dpd;
else d = 0;
```

When `calc_late` is called via `sumLate()`, each item in `l.od` does have a `.dpd` property (set by `chk()`), so the fallback is not reached in the normal path. However, `fee('late', someOtherArg)` — e.g. from external code — silently reads the global last-known DPD of whatever loan `chk()` was called on most recently. **How it could still be needed:** if legacy consumers called `fee('late')` without an overdue-item argument, relying on the cached DPD. The fallback prevents a crash, but makes the fee depend on call order rather than the argument.

### 5b. `settlement.js`: commented-out large-settlement notification (lines 43–45)

```js
// if (tot > 50000) {
//   notify('collections@tredgate.example', 'large settlement ' + l.id + ' ' + tot);
// }
```

`notify` is not defined anywhere in the module or imported. The block could not have run as written; if uncommented it would throw a `ReferenceError`. **How it could still be needed:** the business requirement (flag settlements > $50,000 to collections) may still be active — it was commented out, not deleted, possibly because the `notify` integration was removed when the module was extracted from Core Banking.

### 5c. `fees.js`: commented-out `toUsd()` function (lines 51–58)

```js
/*
function toUsd(x, ccy) {
  if (ccy == 'EUR') return x * 1.08;
  if (ccy == 'CZK') return x / 23.1;
  if (ccy == 'ZAR') return x / 18.4;
  return x;
}
*/
```

The rates are hardcoded and undated. `toUsd` is never called anywhere in the repository. **How it could still be needed:** the data contains loan IDs with a `cb-` prefix suggesting Core Banking origin; those loans may have been denominated in other currencies. If the function was used before extraction, it may still be needed if non-USD installments are ever processed.

### 5d. `settlement.js:sched()` — never called by any active consumer (lines 13–20)

`sched()` is exported and fully implemented, but neither `server/app.ts` nor `nightly-fees.js` calls it. The settlement-quote endpoint uses `quote()`, which computes remaining principal directly without calling `sched()`. **How it could still be needed:** a schedule endpoint or a statement generator could be planned; or it was used by a former caller (Core Banking integration) that no longer exists.

### 5e. `fees.js:netProceeds()` — never called by any active consumer (lines 44–48)

Exported but unused outside `fees.js`. **How it could still be needed:** disbursement processing in Core Banking may have used it to compute the amount actually wired to the applicant after deducting the origination fee.

### 5f. Late-fee DPD threshold inconsistency: `fees.js` vs `nightly-fees.js`

`fees.calc_late` triggers at `d >= 10` (`fees.js:15`), but `nightly-fees.js` triggers at `dd > 10` (line 59) and never calls `calc_late` — it calls `A.adj(it, 25)` directly. An installment exactly 10 days past due:
- would receive a $25 fee if `calc_late` were used (`>= 10` is true)
- would receive **no** fee from the nightly script (`> 10` is false)

**How it could still matter:** if the original design intended `calc_late` to be the authoritative rule, the nightly script has drifted. Alternatively the nightly script's `> 10` threshold is intentional (first fee applies at day 11) and `calc_late`'s `>= 10` is an off-by-one error.

### 5g. `fee()` return type inconsistency: string on success, number (-1) on unknown type (`fees.js:27–34`)

All `calc_*` handlers return `string` (via `.toFixed(2)`), but `fee()` returns `-1` (number) for unknown types. Callers like `nightly-fees.js:63` use `parseFloat(F.fee('ret'))` — this would return `NaN` if the type were unknown, silently adding `NaN` to `tmp`. **How it could still be needed:** the `-1` sentinel allows `sumLate()` (line 41) to skip broken items rather than crash, which is defensive for unknown future fee types.

---

## 6. Open Questions

1. **`l.disbursedAt` vs `l.createdAt`** (`arrears.js:17`): `start()` prefers `disbursedAt`, but `LoanApplication` in `shared/loan.ts` only has `createdAt`. Is `disbursedAt` populated anywhere, or is the start date always the creation date? If it is always `createdAt`, the `|| l.createdAt` fallback is doing all the work and `disbursedAt` is dead code from Core Banking.

2. **`hs.opt` field in installment data** (`legacy/data/installments.json:109`): item I-5007 has `"hs": {"a": 1, "from": "2026-08-20", "opt": "HOL"}`. `adj()` only checks `hs.a`; the `opt` and `from` fields are never read by the code. What options exist beyond `HOL`, and do they affect the fee waiver or duration?

3. **`rfc` and `lfc` flags** (used throughout `nightly-fees.js`): almost certainly "returned-fee charged" and "late-fee charged", but not documented in any code comment or handbook section. Are these idempotency guards only, or do they carry meaning for reporting?

4. **`SETTLE_FEE_PCT` in production** (`settlement.js:33`): the env var allows the settlement fee rate to be changed at runtime without a code change. Has this ever been set to a non-default value? A value outside 0–1 would produce nonsensical totals; there is no range check.

5. **Collections memo 2019 vs current handbook** (`arrears.js:28` comment): the comment says stages are defined by thresholds 30/45/90, but the code implements 30/60/90. POL-060 documents 30/60/90. Was the threshold change intentional (policy update between 2019 and now), or is the code wrong?

6. **`notify()` in settlement.js** (lines 43–45, commented out): was this function provided by a Core Banking SDK that was removed? Is the large-settlement alert still required by operations?

7. **`rcv` field population**: the `rcv` (received payment) field in `installments.json` is non-zero only in test data (I-5002). What system writes this field before the nightly script runs? If nothing does, the payment allocation path (`nightly-fees.js:41–52`) is exercised only in test data.

8. **Mutation of `LoanApplication` in `server/app.ts`**: `servicing.quote()` mutates `l.dpd`, `l.stg`, and `l.od` on the object passed to it (`server/app.ts:73`). If `loanStore` returns a reference to its in-memory object, those fields will persist on the stored loan after a settlement quote. Is this harmless (the store re-reads from the file on every request), or does it corrupt in-memory state?

9. **No tests for the legacy module**: none of the test files in `tests/` cover `arrears.js`, `fees.js`, `settlement.js`, or `nightly-fees.js` directly. The `GET /api/loans/:id/settlement-quote` endpoint exercised in `tests/api.test.ts` would indirectly cover `settlement.quote()`, but no such test exists in the current test suite.

---

## 7. Code vs. policy

Every business rule from Section 2 is compared against the handbook below. Verdicts are **MATCHES**, **DIFFERS**, or **NOT COVERED BY POLICY**. Exact conditions and boundary operators are compared, not just topics.

Pure utility helpers with no policy counterpart (`r2`, `money`, `pd`, `dd`, `addM`, `today`, `cfg`) are bundled into the first row; they are implementation details that no policy document specifies.

| Rule | Code (file : line) | Policy (doc · heading — exact condition) | Verdict |
|---|---|---|---|
| Utility helpers — rounding, currency coercion, date parsing / arithmetic, env config | `util.js:8–85` | No policy document specifies these implementation details. | NOT COVERED BY POLICY |
| **`chkLoan`** — loan shape validation | `util.js:87–94` — `amount > 0`; `termMonths > 0` (no integer enforcement); `typeof interestRate == 'number'` (no range enforcement) | POL-020 · System validation versus product fit — "Accepts any amount greater than 0"; "Accepts any **whole number** greater than 0" for `termMonths`; "Accepts any **fraction between 0 and 1**" for `interestRate` | **DIFFERS** — `chkLoan` accepts fractional `termMonths` and any numeric `interestRate`; it does not enforce the integer or 0–1 constraints that POL-020 prescribes |
| **`start(l)`** — loan start date | `arrears.js:16` — `disbursedAt \|\| createdAt` | No policy document specifies a fallback from disbursement date to creation date. `LoanApplication` in `shared/loan.ts` has no `disbursedAt` field; the fallback always fires in this system. | NOT COVERED BY POLICY |
| **`getStage(d)`** — DPD → arrears stage | `arrears.js:28–34` — ≤ 0 → 0; 1–30 → 1; 31–60 → 2; 61–90 → 3; ≥ 91 → 4 | POL-060 · Arrears stages — Stage 1: "1 to 30 days past due"; Stage 2: "31 to 60"; Stage 3: "61 to 90"; Stage 4: "91 or more" | **MATCHES** — (the code comment on line 30 cites stale thresholds "31-45, 46-90" from "collections memo 2019"; the code itself is correct and matches the handbook) |
| **`label(s)` / `action(s)`** — stage to string | `arrears.js:33` / `37` — `CURRENT`, `STAGE_1`…`STAGE_4`; `none`, `reminder`, `call_letter`, `demand_restrict`, `default_referral` | Policy uses prose descriptions for stages and actions; none of these exact tokens appear in any handbook document. | NOT COVERED BY POLICY |
| **`adj(x, f)`** — suppress fee during hardship | `arrears.js:74` — returns 0 (or `'0.00'`) if `x.hs.a` is truthy | POL-060 · Hardship arrangements — "Late fees accrued during the arrangement are waived" | **MATCHES** |
| **`hsOk(l)`** — hardship eligibility | `arrears.js:80` — `stg >= 1 && stg <= 3` | POL-060 · Hardship arrangements — "available to accounts in Stage 1 to Stage 3" | **MATCHES** |
| **`chk(l, dt, n)`** — DPD and overdue list | `arrears.js:44–71` — DPD = days from installment `n+1`'s due date to `asOf`; collects all overdue installments | POL-060 · Arrears stages — "An installment is due on the same calendar day each month, starting one month after disbursement"; stage assigned from the oldest unpaid installment | **MATCHES** |
| **`summary(l)`** — arrears summary object | `arrears.js:86` — `{stage, action, dpd, overdue, hardshipAllowed}` | No policy document specifies this summary object structure. | NOT COVERED BY POLICY |
| **`calc_orig`** — origination fee | `fees.js:6–10` — `amount × 0.015`, min $50, max $1,500 | POL-060 · Fee schedule — "1.5% of the approved amount, minimum 50 USD, maximum 1,500 USD" | **MATCHES** |
| **`calc_late`** — late fee (fees.js) | `fees.js:18` — `$25 if dpd >= 10` (fires on day 10 and later) | POL-060 · Fee schedule — "25 USD per installment … when an installment is **more than 10 days past due**" (`dpd > 10`, i.e. day 11+); Collections process confirms "applied on day 11" | **DIFFERS** — `>= 10` charges the fee on exactly day 10; policy says "more than 10 days past due" which is day 11+. `nightly-fees.js:58` correctly uses `dd > 10` for the same rule |
| **`calc_ret`** — returned payment fee | `fees.js:19–21` — $15 flat | POL-060 · Fee schedule — "15 USD … when a payment is reversed by the applicant's bank" | **MATCHES** |
| **`calc_settle`** — settlement fee rate | `fees.js:22–25` — `rp × pct`, default `pct = 0.01` (1%) | POL-060 · Fee schedule — "1% of the remaining principal … on full early repayment" | **MATCHES** |
| **`fee` dispatcher / `sumLate`** — fee dispatch and summation | `fees.js:27–42` | No policy document specifies the dispatcher pattern or per-overdue-item summation algorithm. | NOT COVERED BY POLICY |
| **`netProceeds(l)`** — disbursement proceeds | `fees.js:44` — `amount − originationFee` | POL-060 · Fee schedule — "deducted from the proceeds"; worked example: "the applicant receives [amount − origination fee]" | **MATCHES** |
| **`split(l)`** — per-installment principal / interest split | `settlement.js:7–10` — `prin = r2(amount/term)`, `int = r2(amount×rate/term)`, `inst = r2(prin+int)`; each component rounded independently to 2dp | POL-030 · The flat-rate installment formula — `total = amount × (1 + rate)`, `monthly = total / termMonths`; "The result is **not rounded or stored**" | **MATCHES** formula (`prin + int` = `amount × (1 + rate) / term`); however, rounding `prin` and `int` separately before summing can produce an `inst` that differs by $0.01 from the unrounded formula the policy specifies — the policy explicitly says not to round |
| **`sched(l)`** — full installment schedule | `settlement.js:13–20` | No policy document specifies an installment schedule object structure or format. | NOT COVERED BY POLICY |
| Remaining principal in **`quote`** | `settlement.js:34` — `rp = amount × (term − paid) / term` | POL-060 · Fee schedule (part 2) — worked example: "remaining principal is 25,000 × 18 / 24" (i.e. `amount × (term − paid) / term`) | **MATCHES** |
| Settlement fee waiver in **`quote`** | `settlement.js:37` — `var w = paid × 2 > term` (strictly greater than half) | POL-060 · Fee schedule — "Waived once **at least half** of the installments have been paid" (`paid × 2 >= term`); Fee schedule (part 2) worked example: "After 12 installments [of 24], half the term has been paid, the fee is **waived**" | **DIFFERS** — code uses strict `>`, so at exactly half (e.g. `paid = 12`, `term = 24`: `24 > 24` → false) the fee is charged; policy says "at least half" and the worked example confirms the fee must be waived from the halfway point inclusive |
| **`alloc(it, amt)`** — payment waterfall | `settlement.js:63–86` — fees first, then interest, then principal | POL-060 · Collections process — "Amounts recovered are applied first to fees, then to interest, then to principal" | **MATCHES** |
| **`isClear(it)`** — installment fully cleared | `settlement.js:87` — `fees == 0 && int == 0 && prin == 0` | No policy document defines a clearing condition for an installment. | NOT COVERED BY POLICY |
| Nightly: skip paid items | `nightly-fees.js:36–39` — skip if `paid: true` | No policy document specifies this nightly-batch idempotency guard. | NOT COVERED BY POLICY |
| Nightly: apply received payment | `nightly-fees.js:41–52` — allocate `rcv` via `alloc`; mark `paid = true` if `isClear` | POL-060 · Collections process — "Amounts recovered are applied first to fees, then to interest, then to principal" | **MATCHES** |
| Nightly: late fee threshold | `nightly-fees.js:58` — `dd > 10` (strictly greater than 10) | POL-060 · Fee schedule — "more than 10 days past due" | **MATCHES** |
| Nightly: returned payment fee | `nightly-fees.js:63–69` — $15 if `it.ret && !it.rfc`; sets `it.rfc = true` to prevent a second charge | POL-060 · Fee schedule — "15 USD … when a payment is reversed"; "At most one fee per installment" | **MATCHES** |

### Summary of DIFFERS

| # | Rule | File : line | What the code does | What the policy requires |
|---|---|---|---|---|
| 1 | `chkLoan` — `termMonths` check | `util.js:91` | Accepts any number `> 0`, including fractions | POL-020 requires a **whole number** greater than 0 |
| 2 | `chkLoan` — `interestRate` check | `util.js:92` | Accepts any number (no range) | POL-020 requires a **fraction between 0 and 1** |
| 3 | `calc_late` — late fee trigger | `fees.js:18` | `dpd >= 10` — charges on day 10 | POL-060 — "**more than** 10 days past due" — charges from day 11 |
| 4 | Settlement fee waiver | `settlement.js:37` | `paid × 2 > term` — waives only when strictly more than half is paid | POL-060 — "**at least half**" — waives from the halfway point inclusive |

---

## 8. Open Rounding Questions (POL-060 spec tests)

The following rounding details are not defined by POL-060 and are therefore not pinned in `tests/servicing/pol-060.test.ts`. They should be clarified with Credit Risk before a rewrite.

1. **Settlement total rounding** (`settlement.js:38`): the code computes `Math.round((rp + rp × pct) × 100) / 100` — it rounds the sum as a single operation. An alternative is to round each component separately (`r2(rp) + r2(rp × pct)`), which can differ by $0.01 when sub-cent values are involved. POL-060 gives only exact worked examples (18,937.50; 18,750; 12,500) where both approaches agree.

2. **Remaining principal rounding** (`settlement.js:34`): `rp = r2(amount × (term − paid) / term)`. For amounts and terms that do not divide evenly, this rounds to 2 dp before the fee is applied. POL-060's worked examples are all exact (18,750; 12,500; 30,000), so the policy does not define a rounding rule for the intermediate result.

3. **Origination fee sub-cent rounding** (`fees.js:8`): `(amount × 0.015).toFixed(2)` uses JavaScript's standard half-up rounding. For a loan amount where 1.5 % is not a whole cent (e.g. 33,333 USD → 499.995 → rounds to 500.00), the direction of rounding is implementation-defined. POL-060 states only the formula and the min/max caps; it does not specify a rounding mode.
