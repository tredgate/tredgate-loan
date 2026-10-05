import { McpServer, ResourceTemplate } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";
import * as z from "zod/v4";
import type { LoanApplication } from "../../shared/loan";
import { calculateMonthlyPayment } from "../../shared/loanRules";

// Base URL of the Loan REST API.
const API_URL = process.env.LOAN_API_URL ?? "http://localhost:3000/api";

// Helper: download all loan applications from the REST API (GET /loans).
async function fetchLoans(): Promise<LoanApplication[]> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/loans`);
  } catch {
    throw new Error(
      `The Loan API at ${API_URL} is not reachable. Ask the user to start it with "npm run dev".`,
    );
  }
  // fetch() does not throw on HTTP errors such as 404 or 500, so we check response.ok ourselves.
  if (!response.ok) {
    throw new Error(`The Loan API returned HTTP ${response.status}.`);
  }
  // Parse the JSON body. "as LoanApplication[]" only tells TypeScript the type, it does not check the data at runtime.
  return (await response.json()) as LoanApplication[];
}

// Start the server on stdio. We pass a "factory" function, a function that
// builds and returns a configured McpServer. The SDK calls it when a client
// connects, and uses the returned server for that whole connection.
serveStdio(() => {
  // name and version identify this server to the client (for example, they
  // are shown in MCP Inspector and in Claude Code's /mcp list).
  const server = new McpServer(
    { name: "tredgate-loan", version: "1.0.0" },
    {
      // Instructions for the AI about how to use the tools provided by this server.
      instructions:
        "Tools for Tredgate Loan, a loan application system. Amounts are in USD. An interestRate of 0.08 means 8% per year. Loan ids look like ln-1004. Use list_loans to find loans and get_loan for the details of one loan.",
    },
  );

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

  // Tool: all loans, optionally filtered by status. One short line per loan instead of JSON
  server.registerTool(
    "list_loans",
    {
      title: "List loan applications",
      description:
        "List loan applications with their id, amount, term and status. Use it to find loans, for example all pending ones. Use get_loan for the full details of one loan.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "approved", "rejected"])
          .optional()
          .describe("Only loans with this status"),
      }),
    },
    async ({ status }) => {
      const loans = (await fetchLoans()).filter(
        (l) => !status || l.status === status,
      );
      const lines = loans.map(
        (l) => `${l.id}: ${l.amount} USD, ${l.termMonths} months, ${l.status}`,
      );
      return {
        content: [
          { type: "text", text: lines.join("\n") || "No loans found." },
        ],
      };
    },
  );

  // Tool: the installment from the shared business rules (POL-030), never a copy of the formula
  server.registerTool(
    "calculate_installment",
    {
      title: "Calculate the monthly installment",
      description:
        "Calculate the monthly installment and the total repayable for a loan with the Tredgate flat-rate formula (POL-030). Use it instead of calculating by yourself.",
      inputSchema: z.object({
        amount: z.number().positive().describe("Loan amount in USD"),
        termMonths: z.number().int().positive().describe("Term in months"),
        interestRate: z
          .number()
          .min(0)
          .max(1)
          .describe("Yearly rate as a fraction, for example 0.08 for 8%"),
      }),
    },
    async ({ amount, termMonths, interestRate }) => {
      const monthly = calculateMonthlyPayment({
        amount,
        termMonths,
        interestRate,
      });
      const total = amount * (1 + interestRate);
      return {
        content: [
          {
            type: "text",
            text: `Monthly installment: ${monthly.toFixed(2)} USD. Total repayable: ${total.toFixed(2)} USD.`,
          },
        ],
      };
    },
  );

  // Resource template: loan://{id}. The user attaches a loan, the model does not ask for it
  server.registerResource(
    "loan",
    new ResourceTemplate("loan://{id}", {
      list: async () => ({
        resources: (await fetchLoans()).map((l) => ({
          uri: `loan://${l.id}`,
          name: l.id,
          title: `Loan ${l.id} (${l.status})`,
          mimeType: "application/json",
        })),
      }),
    }),
    {
      title: "Loan application",
      description: "One loan application as JSON",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const loan = (await fetchLoans()).find((l) => l.id === id);
      if (!loan) {
        throw new Error(`No loan with id "${id}"`);
      }
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(loan, null, 2),
          },
        ],
      };
    },
  );

  // Prompt: a ready-made task the user starts with /mcp.tredgate-loan.review-loan
  server.registerPrompt(
    "review-loan",
    {
      title: "Review a loan application",
      description:
        "Review a pending loan application against the Tredgate lending policy",
      argsSchema: z.object({
        id: z.string().describe("Loan id, for example ln-1004"),
      }),
    },
    ({ id }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Review loan application ${id}. Read it with get_loan and calculate the monthly installment with calculate_installment. Check it against the automatic approval limits (POL-040) and say who may approve it under the approval authority ladder (POL-050). Recommend a decision, but do not approve or reject the loan.`,
          },
        },
      ],
    }),
  );

  // Give the configured server back to serveStdio.
  return server;
});

// Log to stderr, NOT stdout. stdout is reserved for MCP protocol messages;
// a console.log() here would corrupt the communication with the client.
// console.error() writes to stderr, which is safe for logs.
console.error("[tredgate-loan] MCP server running on stdio");
