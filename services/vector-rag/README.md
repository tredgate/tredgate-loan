# Vector RAG demo (Ollama + Qdrant)

A second retriever over the same handbook as `rag/`, for the trainer's demo. Where `rag/` ranks sections by keywords (BM25), this service turns every section into a vector with an embedding model and asks a vector database for the nearest ones. The participants' setup does not touch this folder: it needs Docker and a model download, which their machines do not allow.

```
docs/handbook ──▶ rag/core/chunk.ts (same chunks as BM25)
                        │
                        ▼
                Ollama  /api/embed   (nomic-embed-text: text ──▶ 768 numbers)
                        │
                        ▼
                Qdrant  collection "tredgate-handbook"  (vectors + the section as payload)
                        │
   question ──▶ embed ──▶ nearest k ──▶ same JSON as http://localhost:3001/search
```

## Run it

```bash
cd services/vector-rag
npm install

# Start Qdrant and pull the embedding model from Ollama natively
docker compose up -d qdrant   # only Qdrant in Docker (:6333)
ollama pull nomic-embed-text  # the embedding model, in the native Ollama app (~300 MB)

# Alternatively: full docker without Ollama
# npm run up            # Qdrant on :6333 (dashboard at /dashboard), Ollama on :11434, both in Docker
# npm run model:pull    # downloads nomic-embed-text into Ollama once (~300 MB)

npm run index         # embeds the handbook: 34 files, 344 vectors, about a minute on the CPU
npm run dev           # the API on http://localhost:3002
npm run down          # stops the containers; add `-v` to also delete the stored vectors and model
```

If Ollama is installed natively (faster on Apple Silicon), start only Qdrant: `docker compose up -d qdrant`. The service talks to whatever answers on `OLLAMA_URL`.

## Use it

```bash
npm run search -- "how big a loan can the system green-light on its own"
npm run search -- "customer pays late" --compare          # BM25 and vectors side by side
npm run search -- "KI-003" --compare                      # where keywords win
curl "http://localhost:3002/compare?q=port+already+in+use&k=3"
```

| Route                | Purpose                                                     |
| -------------------- | ----------------------------------------------------------- |
| `GET /health`        | Ollama and Qdrant reachable? model present? what is indexed |
| `GET /search?q=&k=`  | Vector search, same response shape as the BM25 API          |
| `GET /compare?q=&k=` | The same question through both retrievers                   |
| `POST /reindex`      | Re-embed the handbook and rebuild the collection            |

Scores are cosine similarities (1 = same meaning). BM25 scores are keyword weights. Compare the ranking, not the numbers.

## Configuration

| Variable                | Default                  | Purpose                                                 |
| ----------------------- | ------------------------ | ------------------------------------------------------- |
| `VECTOR_PORT`           | `3002`                   | API port                                                |
| `OLLAMA_URL`            | `http://localhost:11434` | Where Ollama runs                                       |
| `EMBED_MODEL`           | `nomic-embed-text`       | Any Ollama embedding model; a change triggers a reindex |
| `QDRANT_URL`            | `http://localhost:6333`  | Where Qdrant runs                                       |
| `QDRANT_COLLECTION`     | `tredgate-handbook`      | Collection name                                         |
| `RAG_DOCS`, `RAG_INDEX` | as in `rag/`             | Handbook folder and the BM25 index used by `/compare`   |

## Files

```
config.ts        paths, ports, model and its query/document prefixes
embed.ts         Ollama client: embed documents in batches, embed a query, pull the model
store.ts         VectorStore interface, Qdrant implementation, in-memory implementation (tests, and "what a vector DB does")
indexer.ts       chunk → embed → store, plus the state file that detects a changed handbook or model
search.ts        vector search with the BM25-compatible token report, and compare()
app.ts           the HTTP API (Express)
server.ts        npm run dev / npm start
cli.ts           npm run search / npm run index
pull-model.ts    npm run model:pull
docker-compose.yml  Qdrant and Ollama
tests/           run without Docker; the live test runs only when both services are up
```

`npm run down` stops the containers; add `-v` to also delete the stored vectors and model.
