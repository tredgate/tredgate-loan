import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import * as z from 'zod/v4'
import type { LoanApplication } from '../../shared/loan'
import { calculateMonthlyPayment } from '../../shared/loanRules'

// The Loan API, the same API the web app uses. Override with LOAN_API_URL
const API_URL = process.env.LOAN_API_URL ?? 'http://localhost:3000/api'

// Loads all loans. The API has no endpoint for a single loan
async function fetchLoans(): Promise<LoanApplication[]> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/loans`)
  } catch {
    throw new Error(`The Loan API at ${API_URL} is not reachable. Ask the user to start it with "npm run dev".`)
  }
  if (!response.ok) {
    throw new Error(`The Loan API returned HTTP ${response.status}.`)
  }
  return (await response.json()) as LoanApplication[]
}

// Builds a new server with all tools, resources and prompts. Used by the stdio and the HTTP entry point
export function buildServer(): McpServer {
  // Instructions are sent to the client in the initialize answer and tell the model how to read the data
  const server = new McpServer(
    { name: 'tredgate-loan', version: '1.0.0' },
    {
      instructions:
        'Tools for Tredgate Loan, a loan application system. Amounts are in USD. An interestRate of 0.08 means 8% per year. Loan ids look like ln-1004. Use list_loans to find loans and get_loan for the details of one loan.'
    }
  )

  // Tool: one loan by its id
  server.registerTool(
    'get_loan',
    {
      title: 'Get a loan application',
      description:
        'Get one loan application by its id, for example ln-1004. Returns the amount (USD), term, interest rate, status and creation date.',
      inputSchema: z.object({
        id: z.string().describe('Loan id, for example ln-1004')
      })
    },
    async ({ id }) => {
      const loans = await fetchLoans()
      const loan = loans.find((l) => l.id === id)
      if (!loan) {
        return {
          content: [{ type: 'text', text: `No loan with id "${id}". Known ids: ${loans.map((l) => l.id).join(', ')}` }],
          isError: true
        }
      }
      return { content: [{ type: 'text', text: JSON.stringify(loan, null, 2) }] }
    }
  )

  // Tool: all loans, optionally filtered by status. One short line per loan instead of JSON
  server.registerTool(
    'list_loans',
    {
      title: 'List loan applications',
      description:
        'List loan applications with their id, amount, term and status. Use it to find loans, for example all pending ones. Use get_loan for the full details of one loan.',
      inputSchema: z.object({
        status: z.enum(['pending', 'approved', 'rejected']).optional().describe('Only loans with this status')
      })
    },
    async ({ status }) => {
      const loans = (await fetchLoans()).filter((l) => !status || l.status === status)
      const lines = loans.map((l) => `${l.id}: ${l.amount} USD, ${l.termMonths} months, ${l.status}`)
      return { content: [{ type: 'text', text: lines.join('\n') || 'No loans found.' }] }
    }
  )

  // Tool: the installment from the shared business rules (POL-030), never a copy of the formula
  server.registerTool(
    'calculate_installment',
    {
      title: 'Calculate the monthly installment',
      description:
        'Calculate the monthly installment and the total repayable for a loan with the Tredgate flat-rate formula (POL-030). Use it instead of calculating by yourself.',
      inputSchema: z.object({
        amount: z.number().positive().describe('Loan amount in USD'),
        termMonths: z.number().int().positive().describe('Term in months'),
        interestRate: z.number().min(0).max(1).describe('Yearly rate as a fraction, for example 0.08 for 8%')
      })
    },
    async ({ amount, termMonths, interestRate }) => {
      const monthly = calculateMonthlyPayment({ amount, termMonths, interestRate })
      const total = amount * (1 + interestRate)
      return {
        content: [{ type: 'text', text: `Monthly installment: ${monthly.toFixed(2)} USD. Total repayable: ${total.toFixed(2)} USD.` }]
      }
    }
  )

  // Resource template: loan://{id}. The user attaches a loan, the model does not ask for it
  server.registerResource(
    'loan',
    new ResourceTemplate('loan://{id}', {
      list: async () => ({
        resources: (await fetchLoans()).map((l) => ({
          uri: `loan://${l.id}`,
          name: l.id,
          title: `Loan ${l.id} (${l.status})`,
          mimeType: 'application/json'
        }))
      })
    }),
    { title: 'Loan application', description: 'One loan application as JSON', mimeType: 'application/json' },
    async (uri, { id }) => {
      const loan = (await fetchLoans()).find((l) => l.id === id)
      if (!loan) {
        throw new Error(`No loan with id "${id}"`)
      }
      return { contents: [{ uri: uri.href, mimeType: 'application/json', text: JSON.stringify(loan, null, 2) }] }
    }
  )

  // Prompt: a ready-made task the user starts with /mcp.tredgate-loan.review-loan
  server.registerPrompt(
    'review-loan',
    {
      title: 'Review a loan application',
      description: 'Review a pending loan application against the Tredgate lending policy',
      argsSchema: z.object({ id: z.string().describe('Loan id, for example ln-1004') })
    },
    ({ id }) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Review loan application ${id}. Read it with get_loan and calculate the monthly installment with calculate_installment. Check it against the automatic approval limits (POL-040) and say who may approve it under the approval authority ladder (POL-050). Recommend a decision, but do not approve or reject the loan.`
          }
        }
      ]
    })
  )

  return server
}
