import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { chunkDirectory, listMarkdownFiles, type Chunk } from "./chunk";

/**
 * A chunk plus the term statistics BM25 needs
 */
export interface IndexedChunk extends Chunk {
  terms: Record<string, number>; // term -> occurrences in this chunk (heading and title included)
  length: number; // total term count
}

export interface SearchIndex {
  version: 1;
  builtAt: string; // ISO timestamp, compared with file modification times to detect staleness
  root: string; // documentation root the index was built from
  fileCount: number;
  totalTokens: number; // estimated tokens of the whole documentation
  avgLength: number; // average chunk length in terms
  df: Record<string, number>; // term -> number of chunks containing it
  chunks: IndexedChunk[];
}

// Stop words that are ignored during tokenization, common words that do not carry significant meaning for search, expand this list as needed, it can help reduce noise and improve search relevance
const STOP_WORDS = new Set(
  "a an and are as at be by for from has have in is it its of on or that the this to was were will with".split(
    " ",
  ),
);

// Suffixes stripped by the light stemmer, tried in this order
const SUFFIXES: [string, string][] = [
  ["ies", "y"],
  ["ational", "ate"],
  ["ization", "ize"],
  ["ation", "ate"],
  ["ness", ""],
  ["ment", ""],
  ["ally", ""],
  ["ical", "ic"],
  ["ing", ""],
  ["ed", ""],
  ["es", ""],
  ["ly", ""],
  ["al", ""],
  ["ion", ""],
  ["ic", ""],
  ["s", ""],
];

/**
 * A light stemmer: "approval", "approved" and "approve" all become "approv",
 * "automatic", "automatically" and "automated" become "automat".
 * Not linguistically perfect, but good enough for keyword search over a handbook.
 */
export function stem(term: string): string {
  if (/^\d+$/.test(term)) return term;
  let current = term;
  for (let round = 0; round < 3; round++) {
    const rule = SUFFIXES.find(
      ([suffix]) =>
        current.endsWith(suffix) && current.length - suffix.length >= 3,
    );
    if (!rule) break;
    if (rule[0] === "s" && current.endsWith("ss")) break;
    current = current.slice(0, -rule[0].length) + rule[1];
  }
  if (current.length > 4 && current.endsWith("e"))
    current = current.slice(0, -1);
  return current;
}

/**
 * Lowercase words and numbers, drop stop words, stem
 *
 * @param text The input text to tokenize
 */
export function tokenize(text: string): string[] {
  // Convert the text to lowercase, extract words and numbers, remove stop words, and apply stemming
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? [])
    .filter((term) => !STOP_WORDS.has(term))
    .map(stem);
}

/**
 * Build the index for every markdown file under `root`
 *
 * @param root The root directory containing markdown files to index
 */
export function buildIndex(root: string): SearchIndex {
  // Chunk all markdown files under the root directory
  const chunks = chunkDirectory(root);
  // Document frequency: number of chunks each term appears in
  const df: Record<string, number> = {};
  let totalLength = 0;

  // Index each chunk: count term frequencies and update document frequency, map is used to store term frequencies for each chunk
  const indexed = chunks.map((chunk) => {
    // Title and heading terms count three times: a section about "automated decisioning"
    // should outrank a section that merely mentions approval in passing
    const terms: Record<string, number> = {};
    const titleTokens = tokenize(
      `${chunk.docId} ${chunk.docTitle} ${chunk.heading}`,
    );
    // Count title tokens three times to give them more weight, `...` is the spread operator used to include multiple times
    const tokens = [
      ...titleTokens,
      ...titleTokens,
      ...titleTokens,
      ...tokenize(chunk.text),
    ];
    // Count term frequencies for this chunk
    for (const term of tokens) {
      terms[term] = (terms[term] ?? 0) + 1;
    }
    // Update document frequency for each term in this chunk
    for (const term of Object.keys(terms)) {
      df[term] = (df[term] ?? 0) + 1;
    }
    totalLength += tokens.length;
    // Return the indexed chunk with term frequencies and length and save it in the const `indexed` array
    return { ...chunk, terms, length: tokens.length };
  });

  // Return the final search index containing metadata, document frequency, and all indexed chunks
  return {
    version: 1,
    builtAt: new Date().toISOString(),
    root,
    fileCount: listMarkdownFiles(root).length,
    totalTokens: chunks.reduce((sum, chunk) => sum + chunk.tokens, 0),
    avgLength: indexed.length ? totalLength / indexed.length : 0,
    df,
    chunks: indexed,
  };
}

/**
 * Save the search index to a JSON file at the specified path
 *
 * @param index The search index to save
 * @param indexPath The file path where the search index should be saved
 */
export function saveIndex(index: SearchIndex, indexPath: string): void {
  // Ensure the directory for the index file exists before writing it
  mkdirSync(path.dirname(indexPath), { recursive: true });
  // Write the search index to the specified file as a JSON string
  writeFileSync(indexPath, JSON.stringify(index));
}

export function loadIndex(indexPath: string): SearchIndex {
  return JSON.parse(readFileSync(indexPath, "utf8")) as SearchIndex;
}

/**
 * An index is stale when any documentation file changed after it was built
 */
export function isStale(index: SearchIndex): boolean {
  if (!existsSync(index.root)) return true;
  const builtAt = Date.parse(index.builtAt);
  return listMarkdownFiles(index.root).some(
    (file) => Math.floor(statSync(file).mtimeMs) > builtAt,
  );
}

/**
 * Load the index, rebuilding it when it is missing or stale
 *
 * @param root The root directory containing the documentation files
 * @param indexPath The file path where the search index is stored or should be saved if rebuilt
 */
export function ensureIndex(
  root: string,
  indexPath: string,
): { index: SearchIndex; rebuilt: boolean } {
  // Check if the index file exists and is valid before deciding to rebuild it
  if (existsSync(indexPath)) {
    const index = loadIndex(indexPath);
    // If the index is valid and not stale, return it without rebuilding
    if (index.version === 1 && index.root === root && !isStale(index)) {
      return { index, rebuilt: false };
    }
  }
  // If the index is missing or stale, rebuild it
  const index = buildIndex(root);
  saveIndex(index, indexPath);
  return { index, rebuilt: true };
}
