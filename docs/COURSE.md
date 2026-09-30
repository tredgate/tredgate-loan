# Tredgate Loan: course notes

Notes for trainers and participants of *Advanced Coding Workflows with GitHub*. They explain what this repository contains, how to set it up on a restricted machine, and how to run the two showcase demos: documentation search (RAG) for GitHub Copilot, and bug triage with realistic logs.

The operations handbook in [docs/handbook](handbook/README.md) is written as if Tredgate were a real lender. Everything there is fictional. These notes are the only place that talks about the course itself.

## What is in the repository

| Part | Where | Purpose in the course |
|---|---|---|
| Loan app frontend | `src/` | The Vue app participants know from earlier courses, unchanged in look and behaviour |
| Thin backend | `server/`, `shared/` | Express API, JSON-file data, structured logs. Gives triage exercises real errors and log lines |
| Handbook | `docs/handbook/` | 34 documents, about 80,000 tokens. Far too big to paste into a chat, which is the point |
| Documentation search | `rag/` | Splits the handbook into sections, ranks them with BM25, reports token savings. CLI, HTTP API and optional MCP server |
| Copilot integration | `.github/copilot-instructions.md`, `.github/skills/loan-handbook-search/`, `.vscode/mcp.json` | Repository instructions, a skill describing the search API, and an MCP configuration |
| Tests | `tests/` | Business rules, HTTP API, search, MCP server |
| Vector search demo | `services/vector-rag/` | Trainer-only: the same handbook embedded with Ollama and stored in Qdrant, with a side-by-side comparison against BM25. Own package, needs Docker |

Custom agents and prompt files are not part of the repository. Participants build them during the course. The baseline is tagged `v1.1.0-baseline`; prepared bugs for the triage exercises are added later on a separate branch so that the baseline stays clean.

## Setup on a restricted machine

Requirements: Node.js 20.19 or newer and npm, pointed at the company npm mirror. Nothing else. No Docker, no database, no downloads at runtime. Every dependency is a plain npm package without postinstall downloads.

```bash
git clone <repository url>
cd tredgate-loan
npm install
npm run dev
```

`npm run dev` starts three processes and keeps them in one terminal:

| Process | URL | What it is |
|---|---|---|
| Frontend (Vite) | http://localhost:5173 | The loan app |
| Backend (Express) | http://localhost:3000 | The loan API, writes `logs/app.log` and `server/data/loans.json` |
| Documentation search | http://localhost:3001 | The RAG API |

Quick check that everything is up:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3001/health
```

If a port is taken, the backend logs `Tredgate Loan API failed to start` and exits; see runbook RB-004 in the handbook. To start over with clean data run `npm run data:reset`.

## Demo 1: why RAG, in three commands

Goal: show that only a small part of a large documentation is relevant to any one question, and that sending only that part is what saves tokens.

1. Show the size of the problem:

   ```bash
   npm run rag:index
   ```

   Output: `Indexed 34 files into 344 chunks (~80,656 tokens)`. Ask the room what happens when someone pastes that into a chat.

2. Ask a question:

   ```bash
   npm run rag -- "How is the monthly installment calculated?"
   ```

   The tool prints the best sections with their document id and heading, then the token report:

   ```
   Whole documentation: 80,656 tokens in 34 files (344 chunks)
   Retrieved context:   748 tokens in 3 chunks
   Saved:               99.1%
   ```

3. Show the mechanism, not magic. Open `rag/core/chunk.ts` (split by heading), `rag/core/index.ts` (tokenize, stem, count), `rag/core/search.ts` (BM25 score, top k). Together they are a few hundred lines with no dependencies. Point out that production systems swap keyword search for embeddings but keep the same loop: chunk, retrieve, inject, count.

Good questions for the demo, all answered by the right document:

| Question | Expected top document |
|---|---|
| What is the maximum amount for automatic approval? | POL-040 |
| How is the monthly installment calculated? | POL-030 |
| What does the interest rate 0.08 mean? | POL-030, KI-002 |
| Port already in use | RB-004 |
| Every request returns 500 and the log shows SyntaxError | OPS-040 symptom table, RB-003 |

Vary `--k` to show the trade-off between context size and completeness, and try a question the handbook cannot answer to show that the tool returns weak matches rather than an answer.

## Demo 2: Copilot uses the search

Goal: show how an assistant is connected to the search without it reading the handbook.

1. Open Copilot Chat in agent mode and ask: *"What is the maximum amount for automatic approval in Tredgate Loan?"*
2. Copilot loads the `loan-handbook-search` skill because its description matches the question, and calls the search API with `curl` through its terminal tool. The first time, approve the command (or allow-list `curl` for the workspace).
3. The answer cites the document id and heading, for example "POL-040, The standard risk envelope". Show the terminal call and the JSON it returned. Ask Copilot for the token report.

Three ways to connect, and when each applies:

| Path | What it needs | Notes |
|---|---|---|
| Skill plus HTTP API | The RAG API running, terminal access in Copilot | Default. Works where MCP is disabled by policy |
| MCP server | MCP enabled in the editor | Copilot then sees a `search_docs` tool in the tools picker; `.vscode/mcp.json` starts `rag/mcp.ts` with the local `tsx` |
| CLI | Nothing running | `npm run rag -- "question" --json`, useful in scripts and as a fallback |

Show the equivalence: the MCP tool call and the curl call return the same sections because they call the same function. Then show `.github/copilot-instructions.md`, which tells Copilot never to read `docs/handbook` wholesale.

## Demo 3: the knowledge base grows

Goal: close the loop between a fix and the documentation.

1. Pick a resolved known issue, for example KI-004 in `docs/handbook/known-issues/`. Walk through its sections: symptoms, log signature, root cause, fix, prevention.
2. Copy the template from `docs/handbook/known-issues/README.md`, write a new entry for an invented problem, and save it.
3. Rebuild the index with `npm run rag:index` (or `curl -X POST http://localhost:3001/reindex`), then ask about the new problem. The new entry comes back first.

This is the step the triage exercises end with: fix, test, document, reindex.

## Demo 4: the same question, with vectors (trainer's machine only)

Goal: show what production systems use instead of keyword search, and that the loop stays the same: chunk, retrieve, inject, count. Participants watch; their machines cannot run Docker or download a model.

Preparation, once, before the course (see [services/vector-rag/README.md](../services/vector-rag/README.md)):

```bash
cd services/vector-rag
npm install
npm run up            # Qdrant and Ollama in Docker
npm run model:pull    # nomic-embed-text, about 300 MB
npm run index         # 344 vectors in under a minute
```

1. Open the Qdrant dashboard at http://localhost:6333/dashboard, collection `tredgate-handbook`: 344 points, 768 numbers each, and the section text as payload. This is the whole "vector database" story in one screen.
2. Ask a question that shares no words with the answer, side by side:

   ```bash
   npm run search -- "who is allowed to approve a loan above the automatic limit" --compare
   ```

   BM25 lands on POL-010 (ownership) because of the word "approve"; vectors return POL-050, the approval authority ladder, first. Same with `"how do I wipe the data and start again"`: keywords find nothing useful, vectors return RB-006.
3. Now the other way round: `npm run search -- "KI-003" --compare`. Keywords find the document by its id in one hit; vectors return the known-issues index and the changelog, because an id has no meaning to embed. Exact identifiers and log lines are where keyword search stays strong, which is why real systems combine both (hybrid search).
4. Show the code path is the same as in `rag/`: `services/vector-rag/indexer.ts` uses the very same chunker, only `embed.ts` (Ollama) and `store.ts` (Qdrant) are new. `store.ts` also contains a ten-line in-memory version of the store, which is the honest explanation of what Qdrant does: cosine similarity over all vectors, best first.

Point out on the way: scores are cosine similarities (0.6 to 0.8 here) and not comparable with BM25 scores; the token report is identical because the chunks are; changing `EMBED_MODEL` triggers a reindex, so models are interchangeable.

## Triage exercises (prepared later)

The backend was built so that bugs leave realistic traces:

- Every request logs a line with a `reqId`, its method, URL, status and duration.
- Expected rejections (400, 404, 409) log at warn level with the reason.
- Unexpected failures log at error level with the stack trace, and the response hides it behind `Internal server error`.
- The handbook has runbooks for reading the log (RB-002), the 500 procedure (RB-007), the data file (RB-003), and validation errors (RB-008).

Prepared bugs will be patch files on a separate branch, each with a symptom-only note for participants. An exercise runs as: apply the patch, reproduce, read `logs/app.log`, search the handbook for the log signature, fix with a failing test first, add a known-issue entry, reindex, open a pull request. Runbook RB-007 is the checklist.

## Handy commands

| Command | What it does |
|---|---|
| `npm run dev` | Frontend, backend and search API together |
| `npm start` | Build the frontend and serve it with the API from port 3000 |
| `npm test`, `npm run lint`, `npm run build` | The checks CI runs |
| `npm run data:reset` | Restore the seed data |
| `npm run rag -- "question" [--k 5] [--json]` | Search the handbook from the terminal |
| `npm run rag:index` | Rebuild the search index |
| `npm run rag:serve` | Run the search API alone |
| `npm run rag:mcp` | Run the MCP server by hand (for debugging) |
| `cd services/vector-rag && npm run search -- "question" --compare` | Trainer demo: BM25 and vectors side by side (needs `npm run up` there) |
| `tail -f logs/app.log` | Watch the backend log |

## Troubleshooting during the course

| Symptom | Likely cause | Fix |
|---|---|---|
| `npm install` fails behind the mirror | Registry not configured | `npm config get registry` must show the company mirror |
| Red banner "Failed to load loan applications" in the app | Backend not running or on another port | Runbook RB-005; in development the API must be on 3000 |
| Copilot reads the handbook files instead of calling the API | Skill not loaded, or the API is down | Check http://localhost:3001/health; ask explicitly "use the loan-handbook-search skill" |
| Copilot shows no `search_docs` tool | MCP disabled by policy or server not started | Use the skill plus API path; MCP is optional |
| Search results look stale | Index cached before a handbook edit | `npm run rag:index`; the API also rebuilds when it sees a newer file |
| Two people share a machine | Ports and data file collide | Set `PORT`, `RAG_PORT` and `DATA_FILE` per person, see REF-030 |
