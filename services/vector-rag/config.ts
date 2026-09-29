import path from "node:path";
import { ragConfig } from "../../rag/config";

/**
 * Where everything is: the handbook (shared with the BM25 tool), the local
 * record of what was indexed, and the two services the demo talks to.
 */
const serviceDir = import.meta.dirname;

/**
 * Some embedding models were trained with a prefix that tells them whether a
 * text is a document to be stored or a query to be searched. Using the right
 * prefix noticeably improves results; models not listed here need none.
 */
const MODEL_PREFIXES: Record<string, { document: string; query: string }> = {
  "nomic-embed-text": { document: "search_document: ", query: "search_query: " },
  "mxbai-embed-large": {
    document: "",
    query: "Represent this sentence for searching relevant passages: ",
  },
};

const model = process.env.EMBED_MODEL ?? "nomic-embed-text";

export const vectorConfig = {
  docsRoot: ragConfig.docsRoot,
  bm25IndexPath: ragConfig.indexPath, // used by the compare endpoint
  statePath: path.join(serviceDir, ".cache", "state.json"),
  port: Number(process.env.VECTOR_PORT ?? 3002),
  defaultK: 5,

  ollamaUrl: process.env.OLLAMA_URL ?? "http://localhost:11434",
  model,
  prefixes: MODEL_PREFIXES[model.split(":")[0]!] ?? { document: "", query: "" },
  batchSize: 32, // texts per embedding request

  qdrantUrl: process.env.QDRANT_URL ?? "http://localhost:6333",
  collection: process.env.QDRANT_COLLECTION ?? "tredgate-handbook",
};
