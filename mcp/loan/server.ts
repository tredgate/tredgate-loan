import { serveStdio } from '@modelcontextprotocol/server/stdio'
import { buildServer } from './loanServer'

// stdio entry point: VS Code starts this process and talks to it over stdin and stdout
serveStdio(buildServer)

console.error('[tredgate-loan] MCP server running on stdio')
