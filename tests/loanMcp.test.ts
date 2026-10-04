// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { Client } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'

describe('tredgate-loan MCP server', () => {
  const client = new Client({ name: 'test', version: '0.0.0' })

  beforeAll(async () => {
    // Start the server exactly as an editor would
    await client.connect(new StdioClientTransport({ command: 'npx', args: ['tsx', 'mcp/loan/server.ts'] }))
  }, 30000)

  afterAll(async () => {
    await client.close()
  })

  it('offers the loan tools', async () => {
    const { tools } = await client.listTools()
    expect(tools.map(t => t.name)).toContain('get_loan')
  })

  it('calculates the installment with the flat-rate formula', async () => {
    const result = await client.callTool({
      name: 'calculate_installment',
      arguments: { amount: 100000, termMonths: 60, interestRate: 0.085 }
    })
    const text = (result.content as { type: string; text: string }[])[0]?.text
    expect(text).toContain('1808.33')
  })
})
