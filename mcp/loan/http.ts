import { readFileSync } from 'node:fs'
import { createMcpExpressApp, requireBearerAuth, type OAuthTokenVerifier } from '@modelcontextprotocol/express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'
import { buildServer } from './loanServer'

const PORT = Number(process.env.LOAN_MCP_PORT ?? 3002)

// TEST ONLY: four fake tokens, one per role. In production the tokens come from the company's identity provider
type TestToken = { token: string; role: string; subject: string }
const { tokens } = JSON.parse(readFileSync(new URL('../test-tokens.json', import.meta.url), 'utf8')) as {
  tokens: TestToken[]
}

// The only part you replace in production: check the token and say who it belongs to.
// With Entra ID you would verify the JWT signature, the issuer, the audience and the expiry here
const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    const entry = tokens.find((t) => t.token === token)
    if (!entry) {
      // OAuthError makes requireBearerAuth answer 401. A plain Error would become a 500
      throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token')
    }
    return {
      token,
      clientId: entry.subject,
      scopes: [],
      // Required: without expiresAt every request is rejected with "Token has no expiration time"
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      extra: { role: entry.role }
    }
  }
}

// createMcpExpressApp adds express.json() and the Host and Origin checks against DNS rebinding
const app = createMcpExpressApp()
// createMcpHandler calls buildServer for every request, so every request gets a fresh server
const mcpHandler = toNodeHandler(createMcpHandler(buildServer))

// Every request to /mcp needs a valid token. requireBearerAuth answers 401 for a missing or unknown one
app.all('/mcp', requireBearerAuth({ verifier }), (req, res) => {
  // Audit log: who called what. The subject, the method and the tool name only, never loan data (POL-070)
  const method: string | undefined = req.body?.method
  if (method) {
    const tool = method === 'tools/call' ? ` ${req.body.params?.name}` : ''
    console.error(`[tredgate-loan] ${req.auth?.clientId} ${method}${tool}`)
  }
  void mcpHandler(req, res, req.body)
})

// '127.0.0.1': listen on this computer only. Without it the server listens on every network interface
app.listen(PORT, '127.0.0.1', () => {
  console.error(`[tredgate-loan] MCP server on http://127.0.0.1:${PORT}/mcp`)
})
