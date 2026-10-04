import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import type { LoanApplication } from "../../shared/loan";

// Base URL of the Loan REST API.
const API_URL = process.env.LOAN_API_URL ?? "http://localhost:3000/api";

// Helper: download all loan applications from the REST API (GET /loans).
async function fetchLoans(): Promise<LoanApplication[]> {
  const response = await fetch(`${API_URL}/loans`);

  // fetch() does not throw on HTTP errors such as 404 or 500, so we check response.ok ourselves.
  if (!response.ok) {
    throw new Error(`The Loan API returned HTTP ${response.status}.`);
  }

  // Parse the JSON body. "as LoanApplication[]" tells TypeScript the type;
  return (await response.json()) as LoanApplication[];
}

// Start the server on stdio. We pass a "factory" function, a function that
// builds and returns a configured McpServer. The SDK calls it when a client
// connects, and uses the returned server for that whole connection.
serveStdio(() => {
  // name and version identify this server to the client (for example, they
  // are shown in MCP Inspector and in Claude Code's /mcp list).
  const server = new McpServer({ name: "tredgate-loan", version: "1.0.0" });

  // Register the "get_loan" tool.
  // registerTool takes three arguments:
  //   1. the tool name the AI calls,
  //   2. the configuration (metadata + input schema),
  //   3. the handler, the function that runs when the AI calls the tool.
  server.registerTool(
    // 1. Tool name. Use snake_case, short and specific.
    "get_loan",

    // 2. Tool configuration.
    {
      // title: a human-readable name, shown in user interfaces.
      title: "Get a loan application",

      // description: read by the AI to decide WHEN to use the tool and WHAT it returns. This is effectively a prompt, so be clear and give an example.
      description:
        "Get one loan application by its id, for example ln-1004. Returns the amount (USD), term, interest rate, status and creation date.",

      // inputSchema: the parameters of the tool. Here it is one required text parameter "id". .describe() adds a hint for the AI about the value. If the AI sends invalid input (missing id, a number, ...), the SDK rejects it before our handler runs.
      inputSchema: z.object({
        id: z.string().describe("Loan id, for example ln-1004"),
      }),
    },

    // 3. Handler. It receives the validated input (we destructure "id") and must return a result with a "content" array. It is async because it waits for an HTTP call to the Loan API.
    async ({ id }) => {
      // Load all loans from the REST API and find the one with this id.
      const loans = await fetchLoans();
      const loan = loans.find((l) => l.id === id);

      // Not found: return a helpful message and set isError: true.
      if (!loan) {
        return {
          content: [
            {
              type: "text",
              text: `No loan with id "${id}". Known ids: ${loans.map((l) => l.id).join(", ")}`,
            },
          ],
          isError: true,
        };
      }

      // Found: return the loan as formatted JSON text.
      return {
        content: [{ type: "text", text: JSON.stringify(loan, null, 2) }],
      };
    },
  );

  // Give the configured server back to serveStdio.
  return server;
});

// Log to stderr, NOT stdout. stdout is reserved for MCP protocol messages;
// a console.log() here would corrupt the communication with the client.
// console.error() writes to stderr, which is safe for logs.
console.error("[tredgate-loan] MCP server running on stdio");
