/**
 * Turning text into vectors with Ollama.
 *
 * An embedding model maps a piece of text to a list of numbers (768 of them for
 * nomic-embed-text). Texts with similar meaning get vectors that point in
 * similar directions, which is what lets "how big a loan can be green-lit
 * automatically" find a section that never uses those words.
 */
export interface Embedder {
  model: string;
  /** Embed texts that will be stored (batched, with the document prefix) */
  embedDocuments(texts: string[]): Promise<number[][]>;
  /** Embed a question (with the query prefix) */
  embedQuery(text: string): Promise<number[]>;
}

export interface OllamaOptions {
  url: string;
  model: string;
  prefixes: { document: string; query: string };
  batchSize?: number;
  onProgress?: (done: number, total: number) => void;
}

export function createOllamaEmbedder({
  url,
  model,
  prefixes,
  batchSize = 32,
  onProgress = () => {},
}: OllamaOptions): Embedder {
  // One call to Ollama: POST /api/embed with an array of inputs returns one vector per input
  const embed = async (input: string[]): Promise<number[][]> => {
    const response = await ollamaFetch(url, "/api/embed", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model, input }),
    });
    const body = (await response.json()) as { embeddings: number[][] };
    return body.embeddings;
  };

  return {
    model,
    async embedDocuments(texts) {
      const vectors: number[][] = [];
      // Send the texts in batches so one request stays small and progress is visible
      for (let start = 0; start < texts.length; start += batchSize) {
        const batch = texts
          .slice(start, start + batchSize)
          .map((text) => prefixes.document + text);
        vectors.push(...(await embed(batch)));
        onProgress(vectors.length, texts.length);
      }
      return vectors;
    },
    async embedQuery(text) {
      const [vector] = await embed([prefixes.query + text]);
      return vector!;
    },
  };
}

/** Is Ollama reachable, and is the model downloaded? */
export async function ollamaStatus(
  url: string,
  model: string,
): Promise<{ reachable: boolean; modelPresent: boolean; error?: string }> {
  try {
    const response = await ollamaFetch(url, "/api/tags");
    const body = (await response.json()) as { models?: { name: string }[] };
    const names = (body.models ?? []).map((m) => m.name);
    // Ollama names models "nomic-embed-text:latest" when no tag was given
    const wanted = model.includes(":") ? model : `${model}:latest`;
    return { reachable: true, modelPresent: names.includes(wanted) };
  } catch (error) {
    return { reachable: false, modelPresent: false, error: (error as Error).message };
  }
}

/** Download the model through Ollama (the same as `ollama pull <model>`) */
export async function pullModel(url: string, model: string): Promise<void> {
  const response = await ollamaFetch(url, "/api/pull", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false }),
  });
  const body = (await response.json()) as { status?: string; error?: string };
  if (body.error) throw new Error(`Ollama could not pull ${model}: ${body.error}`);
}

/** fetch with error messages that say what to do when Ollama is not running */
async function ollamaFetch(url: string, route: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url + route, init);
  } catch (error) {
    throw new Error(
      `Cannot reach Ollama at ${url} (${(error as Error).message}). ` +
        `Start it with "npm run up" (or run Ollama natively), then "npm run model:pull".`,
    );
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Ollama ${route} failed with ${response.status}: ${text}`);
  }
  return response;
}
