---
applyTo: 'mcp/**'
---

# MCP servers: TypeScript SDK v2

MCP servers in `mcp/` (for example `mcp/loan/`, `mcp/docs/`) use the **MCP TypeScript SDK v2**. Most examples on the internet and in model training data are SDK v1; do not copy them.

## Packages (already installed)

| Package | Use |
|---|---|
| `@modelcontextprotocol/server` | `McpServer`, `createMcpHandler`, `OAuthError`, `OAuthErrorCode`, types such as `AuthInfo` |
| `@modelcontextprotocol/server/stdio` | `serveStdio` (subpath export of the same package) |
| `@modelcontextprotocol/express` | `createMcpExpressApp`, `requireBearerAuth`, type `OAuthTokenVerifier` |
| `@modelcontextprotocol/node` | `toNodeHandler` (wraps the MCP handler for Express) |
| `zod` (v4) | Tool input schemas |

Never use the v1 package `@modelcontextprotocol/sdk`, its deep imports (`@modelcontextprotocol/sdk/server/mcp.js`, `.../stdio.js`), `StdioServerTransport`, or `server.tool(...)`.

## Stdio server

```ts
import { McpServer } from '@modelcontextprotocol/server'
import { serveStdio } from '@modelcontextprotocol/server/stdio'
import * as z from 'zod/v4'

serveStdio(() => {
  const server = new McpServer({ name: 'tredgate-loan', version: '1.0.0' })

  server.registerTool(
    'get_loan',
    {
      description: 'Get one loan application by id',
      inputSchema: z.object({ id: z.string().describe('Loan id, for example ln-1004') })
    },
    async ({ id }) => ({
      content: [{ type: 'text', text: `Loan ${id}` }]
    })
  )

  return server
})
```

- `serveStdio` takes a factory that returns a new `McpServer`.
- `inputSchema` is a `z.object(...)`, not a plain object of fields as in v1. The SDK validates the arguments before the handler runs and infers their types.
- Describe every field with `.describe(...)`: the model reads it.
- A handler returns `{ content: [{ type: 'text', text }] }`. Return `isError: true` with a readable message for expected failures instead of throwing.
- Run TypeScript directly with `tsx` (for example `npx tsx mcp/loan/server.ts`); there is no build step.

## Logging: stderr only

Over stdio, stdout carries JSON-RPC. Any `console.log` breaks the connection (the client reports a parse error). Log with `console.error(...)` only, also in code the server imports.

## Streamable HTTP with Express

```ts
import { createMcpExpressApp, requireBearerAuth, type OAuthTokenVerifier } from '@modelcontextprotocol/express'
import { toNodeHandler } from '@modelcontextprotocol/node'
import { createMcpHandler, McpServer, OAuthError, OAuthErrorCode } from '@modelcontextprotocol/server'

function buildServer() {
  const server = new McpServer({ name: 'tredgate-loan', version: '1.0.0' })
  // server.registerTool(...) as above
  return server
}

const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token) {
    // look the token up; an unknown token must throw OAuthError, a plain Error becomes a 500
    if (token !== 'expected') throw new OAuthError(OAuthErrorCode.InvalidToken, 'Unknown token')
    return { token, clientId: 'officer', scopes: ['loans:read'], expiresAt: Math.floor(Date.now() / 1000) + 3600 }
  }
}

const app = createMcpExpressApp() // binds 127.0.0.1, runs express.json(), checks Host and Origin
const node = toNodeHandler(createMcpHandler(buildServer))
app.all('/mcp', requireBearerAuth({ verifier }), (req, res) => void node(req, res, req.body))
app.listen(3010, () => console.error('MCP server on http://localhost:3010/mcp'))
```

- `createMcpHandler` calls the factory for every request, so each request gets a fresh `McpServer`.
- `verifyAccessToken` returns an `AuthInfo`: `token`, `clientId`, `scopes` and `expiresAt` (seconds since epoch) are required; without `expiresAt` every request gets 401 "Token has no expiration time". Extra data such as a role goes into `extra`.
- `requireBearerAuth` answers 401 for a missing or unknown token and puts the verified `AuthInfo` on `req.auth`. A tool handler reads it from its second argument: `ctx.http?.authInfo`.

## When unsure

Check the v2 documentation at https://ts.sdk.modelcontextprotocol.io/v2/ or the type definitions in `node_modules/@modelcontextprotocol/*`. Do not fall back to v1 APIs.
