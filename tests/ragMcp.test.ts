// @vitest-environment node
import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

describe('rag MCP server', () => {
  it('exposes search_docs over stdio and answers from the handbook', async () => {
    // Start rag/mcp.ts exactly as an editor would, with a temporary index cache
    const transport = new StdioClientTransport({
      command: 'npx',
      args: ['tsx', 'rag/mcp.ts'],
      cwd: path.resolve('.'),
      env: { ...process.env, RAG_INDEX: path.join(path.resolve('.'), 'node_modules', '.tmp', 'rag-test-index.json') }
    })
    const client = new Client({ name: 'test', version: '0.0.0' })
    await client.connect(transport)
    try {
      const { tools } = await client.listTools()
      expect(tools.map(t => t.name)).toEqual(['search_docs'])

      const result = await client.callTool({ name: 'search_docs', arguments: { query: 'maximum amount for automatic approval', k: 2 } })
      const text = (result.content as { type: string; text: string }[])[0]?.text ?? ''
      expect(text).toContain('POL-040')
      expect(text).toContain('Token report')
    } finally {
      await client.close()
    }
  }, 30000)
})
