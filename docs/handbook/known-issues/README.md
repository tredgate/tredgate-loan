---
id: KI-README
title: Known Issues Index and Template
section: Known Issues
tags: [known-issues, index, template, incidents, regression]
updated: 2026-09-27
---

# KI-README Known Issues Index and Template

## What a Known Issue entry is

A Known Issue (KI) entry is the permanent record of one defect or incident in Tredgate Loan, written so that the next person who meets the same symptom recognizes it in under a minute. Each entry follows an investigation's path: symptom, log signature, root cause, fix, workaround, prevention. Entries are never deleted. When an issue is fixed, its `status` becomes `resolved` and `fixed_in` names the release, but the entry stays, because a workstation on an older release can still show the symptom.

A KI entry is not a ticket and not a postmortem (OPS-040); it is the technical fact sheet both of them point to, and the document runbooks RB-003 to RB-008 link when a symptom has a known cause.

## When an entry must be written

An entry is mandatory in two cases:

1. **Every S1 or S2 incident** as classified in OPS-040. The on-call Platform Engineer drafts it within one business day of closing the incident; the postmortem references it by ID.
2. **Every bug fix that reached a branch workstation**, that is, any defect present in an installed release. The entry is part of the pull request that fixes the defect, together with the regression test required by REF-050, and is reviewed with the code.

An entry is optional, but encouraged, for defects found before release and for S3 issues with a documented workaround. Cosmetic S4 issues are tracked in tickets only.

## Numbering and file naming

IDs are `KI-` followed by a three-digit number. Take the next free number after the highest one in the index below; numbers are never reused. The file name is the ID, a hyphen and a short lowercase slug: `KI-005-some-short-description.md`. Add the new entry to the index table here and to the handbook README in the same pull request, and cross-reference it from the relevant runbook.

## Index

| ID | Title | Severity when open | Status | Fixed in | Runbook |
|---|---|---|---|---|---|
| KI-001 | Data File Truncated on Shutdown | S1 | Resolved | 1.1.0 | RB-003 |
| KI-002 | Interest Rate Entered as Percentage | S3 | Resolved | 1.1.0 | RB-008 |
| KI-003 | Amount as String Bypassed Validation | S2 | Resolved | 1.1.0 | RB-008 |
| KI-004 | Request Without JSON Content Type Returned 500 | S3 | Resolved | 1.1.0 | RB-007 |

Release 1.1.0 (2026-09-15) closed all four. The next free number is KI-005.

## Template

Copy the block below into a new file. Keep every section, even if it only says "None". Log lines must be real or realistic JSON lines in the format of OPS-060, never containing an applicant's name (POL-070). Write the root cause in terms of the code before the fix and the fix in terms of the code as it is now, naming files and functions.

```markdown
---
id: KI-00N
title: Short Title in Title Case
section: Known Issues
tags: [component, symptom, status-code]
updated: YYYY-MM-DD
status: open | resolved
fixed_in: x.y.z | none
---

# KI-00N Short Title in Title Case

## Summary
Two to four sentences: what went wrong, which release, who noticed, the impact.

## Symptoms
What officers or engineers observed: UI text, HTTP status codes, curl output.

## Log signature
The exact log lines (level, msg, err fields) that identify this issue, and a grep to find them.

## Root cause
The code path, named by file and function, and why it produced the symptom.

## Fix
What changed, in which file and function, in which release, and which tests were added.

## Workaround
What to do on a workstation that still runs the affected release.

## Prevention
Tests, checks, procedures or policy wording that stop a repeat.

## Related documents
Runbooks, references, policies and changelog entries by ID.

## Timeline
Dated list: first report, diagnosis, workaround, fix merged, release, closure.
```
