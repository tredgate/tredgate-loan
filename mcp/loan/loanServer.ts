import {
  McpServer,
  ResourceTemplate,
  type McpRequestContext,
} from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import type { LoanApplication } from "../../shared/loan";
import { calculateMonthlyPayment } from "../../shared/loanRules";

// Base URL of the Loan REST API.
const API_URL = process.env.LOAN_API_URL ?? "http://localhost:3000/api";
// Roles from the token (mcp/test-tokens.json). stdio has no token and runs as the local user
type Role = "officer" | "senior" | "credit-risk" | "auditor";
// The highest amount a role may approve (POL-050). Roles that are not listed may not approve at all.
// Above 100,000 USD two people must sign, so the server never approves those loans
const APPROVAL_LIMIT: Partial<Record<Role, number>> = {
  officer: 50_000,
  senior: 100_000,
};

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

// Builds a new server for one request (HTTP) or one connection (stdio).
// The tools, and what they show, depend on the role in the token
export function buildServer(ctx?: McpRequestContext): McpServer {
  const role = ctx?.authInfo?.extra?.role as Role | undefined;
  const user = ctx?.authInfo?.clientId ?? "local user";

  // The auditor reconciles decisions and needs no personal data (POL-070): hide the applicant name
  const forRole = (loan: LoanApplication): LoanApplication =>
    role === "auditor"
      ? { ...loan, applicantName: "[hidden for the auditor role]" }
      : loan;

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
      annotations: { readOnlyHint: true },
    },

    // 3. Handler. It receives the validated input (we destructure "id") and must return a result with a "content" array. It is async because it waits for an HTTP call to the Loan API.
    async ({ id }) => {
      // Load all loans from the REST API and find the one with this id.
      const loans = await fetchLoans();
      const loan = loans.find((l) => l.id === id);

      // Not found: return a helpful message and set isError: true.
      if (!loan) {
        // List the known ids only while there are few of them. With 5,000 loans the list alone would be 11,000 tokens
        const hint =
          loans.length <= 20
            ? `Known ids: ${loans.map((l) => l.id).join(", ")}`
            : "Use list_loans to find the id.";
        return {
          content: [{ type: "text", text: `No loan with id "${id}". ${hint}` }],
          isError: true,
        };
      }

      // Found: return the loan as formatted JSON text.
      return {
        content: [
          { type: "text", text: JSON.stringify(forRole(loan), null, 2) },
        ],
      };
    },
  );

  // Tool: one page of loans, filtered on the server. One short line per loan instead of JSON
  server.registerTool(
    "list_loans",
    {
      title: "List loan applications",
      description:
        "List loan applications with their id, amount, term and status, one page at a time. Filter by status and maximum amount. Use loan_summary first for an overview, and get_loan for the full details of one loan.",
      inputSchema: z.object({
        status: z
          .enum(["pending", "approved", "rejected"])
          .optional()
          .describe("Only loans with this status"),
        maxAmount: z
          .number()
          .positive()
          .optional()
          .describe(
            "Only loans up to this amount in USD, for example 50000 for what a Loan Officer may approve",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .default(20)
          .describe("How many loans to return, at most 100"),
        offset: z
          .number()
          .int()
          .min(0)
          .default(0)
          .describe("How many matching loans to skip, for the next page"),
      }),
      annotations: { readOnlyHint: true },
    },
    async ({ status, maxAmount, limit, offset }) => {
      const matching = (await fetchLoans()).filter(
        (l) =>
          (!status || l.status === status) &&
          (maxAmount === undefined || l.amount <= maxAmount),
      );
      if (matching.length === 0) {
        return { content: [{ type: "text", text: "No loans found." }] };
      }
      const page = matching.slice(offset, offset + limit);
      if (page.length === 0) {
        return {
          content: [
            {
              type: "text",
              text: `No loans at offset ${offset}. There are ${matching.length} matching loans.`,
            },
          ],
        };
      }
      // Tell the model where it is and how to get the next page
      const next =
        offset + limit < matching.length
          ? ` Next page: offset ${offset + limit}.`
          : "";
      const header = `Loans ${offset + 1}-${offset + page.length} of ${matching.length}.${next}`;
      const lines = page.map(
        (l) => `${l.id}: ${l.amount} USD, ${l.termMonths} months, ${l.status}`,
      );
      return {
        content: [{ type: "text", text: [header, ...lines].join("\n") }],
      };
    },
  );

  // Tool: a few numbers instead of thousands of lines. Summary first, details on demand
  server.registerTool(
    "loan_summary",
    {
      title: "Summarise the loan applications",
      description:
        "Count loan applications by status with their total amount, and split the pending ones by approval tier (POL-050). Use it first for an overview, then list_loans for the loans you need.",
      annotations: { readOnlyHint: true },
    },
    async () => {
      const loans = await fetchLoans();
      const byStatus = (["pending", "approved", "rejected"] as const).map(
        (status) => {
          const group = loans.filter((l) => l.status === status);
          const total = group.reduce((sum, l) => sum + l.amount, 0);
          return `${status}: ${group.length} loans, ${total} USD`;
        },
      );
      const pending = loans.filter((l) => l.status === "pending");
      const tiers = [
        `up to 50,000 USD (Loan Officer): ${pending.filter((l) => l.amount <= 50_000).length}`,
        `50,000.01 to 100,000 USD (Senior Loan Officer): ${pending.filter((l) => l.amount > 50_000 && l.amount <= 100_000).length}`,
        `above 100,000 USD (Senior Loan Officer and Credit Risk): ${pending.filter((l) => l.amount > 100_000).length}`,
      ];
      return {
        content: [
          {
            type: "text",
            text: [
              `${loans.length} loan applications`,
              ...byStatus,
              "Pending by approval tier:",
              ...tiers,
            ].join("\n"),
          },
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
      annotations: { readOnlyHint: true },
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

  // Tool: approve a loan. Registered only for roles that may approve, so the auditor never sees it
  const limit = role ? APPROVAL_LIMIT[role] : undefined;
  if (limit !== undefined) {
    server.registerTool(
      "approve_loan",
      {
        title: "Approve a loan application",
        description:
          "Approve one pending loan application. The server checks the approval authority ladder (POL-050) against the signed-in user and refuses loans above their limit. Confirm with the user before you approve.",
        inputSchema: z.object({
          id: z.string().describe("Loan id, for example ln-1004"),
        }),
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
        },
      },
      async ({ id }) => {
        const loan = (await fetchLoans()).find((l) => l.id === id);
        if (!loan) {
          return {
            content: [{ type: "text", text: `No loan with id "${id}".` }],
            isError: true,
          };
        }
        // The checks run in the server, whatever the model was told
        if (loan.amount > 100_000) {
          return {
            content: [
              {
                type: "text",
                text: `Loan ${id} is ${loan.amount} USD. Above 100,000 USD, POL-050 requires a Senior Loan Officer and a Credit Risk Analyst to sign the Decision Register. This server does not approve such loans.`,
              },
            ],
            isError: true,
          };
        }
        if (loan.amount > limit) {
          return {
            content: [
              {
                type: "text",
                text: `Not approved. You are signed in as ${user} (${role}), who may approve up to ${limit} USD under POL-050. Loan ${id} is ${loan.amount} USD. Ask a Senior Loan Officer.`,
              },
            ],
            isError: true,
          };
        }
        // The decision goes through the Loan API, like every other client
        const response = await fetch(`${API_URL}/loans/${id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "approved" }),
        });
        if (!response.ok) {
          const { error } = (await response.json()) as { error?: string };
          return {
            content: [
              {
                type: "text",
                text: `The Loan API refused: ${error ?? response.status}`,
              },
            ],
            isError: true,
          };
        }
        // Audit: the loan id and the user, never the applicant name (POL-070)
        console.error(`[tredgate-loan] ${id} approved by ${user}`);
        return {
          content: [
            {
              type: "text",
              text: `Loan ${id} approved by ${user}. Record the decision in the Decision Register (POL-050).`,
            },
          ],
        };
      },
    );
  }

  // Resource template: loan://{id}. The user attaches a loan, the model does not ask for it
  server.registerResource(
    "loan",
    new ResourceTemplate("loan://{id}", {
      list: async () => ({
        resources: (await fetchLoans())
          .filter((l) => l.status === "pending")
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
          .slice(0, 50)
          .map((l) => ({
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
            text: JSON.stringify(forRole(loan), null, 2),
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
}
