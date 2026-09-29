import { buildIndex, ensureIndex, saveIndex } from "./core/index";
import { search } from "./core/search";
import { ragConfig } from "./config";

/**
 * Usage:
 *   npm run rag -- "How much can be approved automatically?"   search, print the best chunks
 *   npm run rag -- "..." --k 3 --json                           fewer chunks, machine-readable output
 *   npm run rag:index                                           rebuild the index and print statistics
 */
// Parse command-line arguments and handle the RAG CLI commands - slice(2) means we skip the first two default arguments (node and script path)
const args = process.argv.slice(2);
// Is a switch present? `flag("json")` returns true for `--json`
const flag = (name: string) => args.includes(`--${name}`);
// Value after an option name: `option("k")` returns "3" for `--k 3`
const option = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
// Extract the main query from the command-line arguments, ignoring flags and the value for `--k`
const query = args
  .filter((arg, i) => !arg.startsWith("--") && args[i - 1] !== "--k")
  .join(" ")
  .trim();

// Handle the `--index` flag to rebuild the index and exit early
if (flag("index")) {
  const index = buildIndex(ragConfig.docsRoot);
  saveIndex(index, ragConfig.indexPath);
  console.log(
    `Indexed ${index.fileCount} files into ${index.chunks.length} chunks (~${index.totalTokens.toLocaleString()} tokens)`,
  );
  console.log(`Index written to ${ragConfig.indexPath}`);
  process.exit(0);
}

// Ensure that a query is provided, otherwise print usage and exit
if (!query) {
  console.error('Usage: npm run rag -- "<question>" [--k 5] [--json]');
  process.exit(1);
}

// Ensure the search index is available and up-to-date, rebuilding it if necessary
const { index, rebuilt } = ensureIndex(ragConfig.docsRoot, ragConfig.indexPath);
// Parse the number of top results to retrieve from the command-line options, defaulting to the configured value
const k = Number(option("k") ?? ragConfig.defaultK);
// Perform the search using the query and the specified number of top results
const response = search(index, query, k);

// Output the search results in either JSON format or human-readable format
if (flag("json")) {
  console.log(JSON.stringify(response, null, 2));
  process.exit(0);
}

// Print a message if the index was rebuilt, then display the query and the search results in a readable format
if (rebuilt) console.log("(index rebuilt because the documentation changed)\n");
console.log(`Query: ${response.query}\n`);
// Iterate over the search results and print each one with its metadata and content
for (const [i, { chunk, score }] of response.results.entries()) {
  console.log(
    `--- ${i + 1}. ${chunk.docId} · ${chunk.heading}  [${chunk.file}, score ${score}, ~${chunk.tokens} tokens]`,
  );
  console.log(chunk.text.trim());
  console.log();
}
// Print a token report summarizing the number of tokens in the documentation, retrieved context, and the percentage of tokens saved
const r = response.report;
console.log("=== Token report (approximate) ===");
console.log(
  `Whole documentation: ${r.documentationTokens.toLocaleString()} tokens in ${r.fileCount} files (${r.chunkCount} chunks)`,
);
console.log(
  `Retrieved context:   ${r.retrievedTokens.toLocaleString()} tokens in ${r.retrievedCount} chunks`,
);
console.log(`Saved:               ${r.savedPercent}%`);
