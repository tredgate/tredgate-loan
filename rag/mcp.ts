import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { ensureIndex } from './core/index'
import { search } from './core/search'
import { ragConfig } from './config'

/**
 * Optional MCP wrapper around the same search, for editors that allow MCP servers.
 * Configured in .vscode/mcp.json; speaks JSON-RPC over stdio, so nothing may be printed to stdout.
 */
const server = new McpServer({ name: 'tredgate-docs', version: '1.0.0' })

server.registerTool(
  'search_docs',
  {
    title: 'Search the Tredgate Loan handbook',
    description:
      'Find the handbook sections relevant to a question about Tredgate Loan: lending policy, operations, runbooks, API reference, known issues. Returns the best matching sections with their document id and heading, plus a token report. Use it instead of reading docs/handbook directly.',
    inputSchema: {
      query: z.string().min(1).describe('The question or keywords'),
      k: z.number().int().min(1).max(20).optional().describe('How many sections to return (default 5)')
    }
  },
  async ({ query, k }) => {
    const { index } = ensureIndex(ragConfig.docsRoot, ragConfig.indexPath)
    const response = search(index, query, k ?? ragConfig.defaultK)
    const sections = response.results.map(
      ({ chunk, score }) =>
        `## ${chunk.docId} · ${chunk.heading}\n(file: ${chunk.file}, score ${score}, ~${chunk.tokens} tokens)\n\n${chunk.text}`
    )
    const r = response.report
    const report = `Token report: retrieved ~${r.retrievedTokens} of ~${r.documentationTokens} tokens (${r.savedPercent}% saved, ${r.retrievedCount} of ${r.chunkCount} chunks).`
    return { content: [{ type: 'text', text: [...sections, report].join('\n\n') }] }
  }
)

await server.connect(new StdioServerTransport())
