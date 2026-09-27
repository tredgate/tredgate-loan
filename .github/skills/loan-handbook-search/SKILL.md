---
name: loan-handbook-search
description: Answers questions about Tredgate Loan from its handbook (lending policy, approval limits, interest rates and installments, operations procedures, runbooks for errors and logs, API reference, known issues) by calling the local documentation search API instead of reading docs/handbook. Use whenever a question concerns how Tredgate Loan is supposed to behave or operate, or when investigating an error, a log line or a 500.
---

# Loan handbook search

The handbook in `docs/handbook` is about 80,000 tokens. Never read it wholesale. Ask the local search API for the few sections that matter and answer from those.

## Endpoint

The search API runs on `http://localhost:3001` (started by `npm run dev`, or alone with `npm run rag:serve`). If it is not running, start it, or use the CLI fallback below.

```bash
curl -s "http://localhost:3001/search?q=<url-encoded question>&k=5"
```

Parameters: `q` is the question or keywords (required), `k` is how many sections to return (1 to 20, default 5). Start with `k=5`; use `k=8` for broad questions, `k=3` for precise ones.

Response:

```json
{
  "query": "maximum amount for automatic approval",
  "results": [
    {
      "chunk": {
        "id": "POL-040#2",
        "file": "policy/POL-040-automated-decisioning.md",
        "docId": "POL-040",
        "docTitle": "Automated Decisioning",
        "section": "Policy",
        "heading": "The standard risk envelope",
        "text": "The standard risk envelope is ...",
        "tokens": 326
      },
      "score": 11.593
    }
  ],
  "report": {
    "documentationTokens": 80656,
    "retrievedTokens": 912,
    "savedPercent": 98.9,
    "fileCount": 34,
    "chunkCount": 344,
    "retrievedCount": 3
  }
}
```

Other routes: `GET /health` reports whether the index is loaded and how big the documentation is; `POST /reindex` rebuilds the index after handbook files changed (the API also rebuilds automatically when it notices a newer file).

## How to answer

1. Call `/search` with the user's question. Rephrase with handbook vocabulary if the first results look off (for example "auto-decide", "standard risk envelope", "installment", "reqId", "data file").
2. Read only the returned `text` fields. Answer from them; do not guess beyond them.
3. Cite the source as document id and heading, for example "POL-040, The standard risk envelope". Mention the file when the user may want to open it.
4. If the results do not answer the question, say so and suggest which handbook section might, rather than inventing policy.
5. When useful to the user, mention the token report: how many tokens were retrieved out of how many.

## Investigating errors and logs

Search for the error message or the log `msg` text verbatim, for example `request failed with an unexpected error`, `SyntaxError: Unexpected end of JSON input`, `EADDRINUSE`, or the 400 message. Runbooks (RB-001 to RB-008) and known issues (KI-001 onward) are written around those signatures.

## After fixing a bug

Every fix is recorded in the handbook (OPS-050): add a known-issue entry from the template in `docs/handbook/known-issues/README.md`, link it from the relevant runbook and the handbook README, then call `POST /reindex` (or run `npm run rag:index`) so the new entry becomes searchable.

## CLI fallback

The same search without the API:

```bash
npm run rag -- "<question>" --k 5 --json
```
