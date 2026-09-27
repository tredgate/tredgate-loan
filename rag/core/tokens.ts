/**
 * Token estimate used in the savings report.
 * Real tokenizers differ per model; ~4 characters per token is a good enough
 * approximation for English prose and keeps the tool dependency-free.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}
