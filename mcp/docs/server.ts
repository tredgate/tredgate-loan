import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'
import { ragConfig } from '../../rag/config'
import { ensureIndex } from '../../rag/core/index'
import { search } from '../../rag/core/search'

// Load the BM25 index of the handbook once. ensureIndex rebuilds it when the handbook changed
const { index } = ensureIndex(ragConfig.docsRoot, ragConfig.indexPath)

// The first words of a section, on one line, so a search result stays short
const snippet = (text: string) => {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 160 ? `${flat.slice(0, 160)}…` : flat
}

serveStdio(() => {
  const server = new McpServer(
    { name: 'tredgate-docs', version: '1.0.0' },
    {
      instructions:
        'Search the Tredgate operations handbook: policies (POL-xxx), runbooks, operations procedures and references. Use search_docs to find sections, then get_section to read the ones you need. Cite the section id, for example POL-050#2.'
    }
  )

  // Tool: search returns only ids, headings and a snippet. The full text comes from get_section
  server.registerTool(
    'search_docs',
    {
      title: 'Search the handbook',
      description:
        'Search the Tredgate operations handbook with keywords or a question. Returns the best matching sections with their id, document, heading, score and a short snippet. Use get_section to read a section in full.',
      inputSchema: z.object({
        query: z.string().min(2).describe('Keywords or a question, for example "approval authority ladder"'),
        k: z.number().int().min(1).max(10).default(5).describe('How many sections to return, at most 10')
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ query, k }) => {
      const { results } = search(index, query, k)
      if (results.length === 0) {
        return { content: [{ type: 'text', text: `No sections match "${query}". Try other keywords.` }] }
      }
      const lines = results.map(
        ({ chunk, score }) => `${chunk.id} | ${chunk.docTitle} > ${chunk.heading} | score ${score.toFixed(2)}\n  ${snippet(chunk.text)}`
      )
      return { content: [{ type: 'text', text: lines.join('\n') }] }
    }
  )

  // Tool: one section in full, by the id from search_docs
  server.registerTool(
    'get_section',
    {
      title: 'Read a handbook section',
      description: 'Read one section of the handbook in full, by its id from search_docs, for example POL-050#2.',
      inputSchema: z.object({
        id: z.string().describe('Section id from search_docs, for example POL-050#2')
      }),
      annotations: { readOnlyHint: true }
    },
    async ({ id }) => {
      const chunk = index.chunks.find((c) => c.id === id)
      if (!chunk) {
        return { content: [{ type: 'text', text: `No section with id "${id}". Use search_docs to find the id.` }], isError: true }
      }
      return { content: [{ type: 'text', text: `${chunk.docId} ${chunk.docTitle} > ${chunk.heading}\n\n${chunk.text}` }] }
    }
  )

  return server
})

console.error('[tredgate-docs] MCP server running on stdio')
