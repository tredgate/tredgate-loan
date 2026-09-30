import express from 'express'
import { createRequire } from 'node:module'
import type { LoanApplication, LoanStatus } from '../shared/loan'
import { HttpError, errorHandler, notFoundHandler } from './errors'
import { requestLogger, type Logger } from './logger'
import { createLoanService } from './loanService'
import type { LoanStore } from './loanStore'

type SettlementQuote = -1 | { st: string; [field: string]: unknown }

// Servicing rules taken over from the old core banking integration (CommonJS, untyped)
const servicing = createRequire(import.meta.url)('../legacy/servicing/settlement.js') as {
  quote(loan: LoanApplication, paid: unknown, date: unknown): SettlementQuote
}

const QUOTE_ERRORS: Record<string, string> = {
  ERR_1: 'paid must be a whole number of installments, 0 or more',
  ERR_2: 'paid must be less than the loan term',
  ERR_3: 'date must be a valid date in YYYY-MM-DD format'
}

export interface AppOptions {
  store: LoanStore
  logger: Logger
  /** Serve a built frontend from this folder (used by `npm start`) */
  staticDir?: string
}

/**
 * Build the Express app.
 * Kept separate from index.ts so tests can start it on any port with their own store.
 */
export function createApp({ store, logger, staticDir }: AppOptions) {
  const app = express()
  const loans = createLoanService(store)

  app.use(requestLogger(logger))
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) })
  })

  app.get('/api/loans', async (_req, res) => {
    res.json(await loans.list())
  })

  app.post('/api/loans', async (req, res) => {
    const loan = await loans.create(req.body)
    req.log.info({ loanId: loan.id, amount: loan.amount, termMonths: loan.termMonths }, 'loan created')
    res.status(201).json(loan)
  })

  app.patch('/api/loans/:id/status', async (req, res) => {
    const status = req.body?.status as LoanStatus | undefined
    if (status !== 'approved' && status !== 'rejected') {
      throw new HttpError(400, "Status must be 'approved' or 'rejected'")
    }
    const loan = await loans.updateStatus(req.params.id, status)
    req.log.info({ loanId: loan.id, status }, 'loan status updated')
    res.json(loan)
  })

  app.post('/api/loans/:id/auto-decide', async (req, res) => {
    const loan = await loans.autoDecide(req.params.id)
    req.log.info({ loanId: loan.id, status: loan.status }, 'loan auto-decided')
    res.json(loan)
  })

  app.get('/api/loans/:id/settlement-quote', async (req, res) => {
    const loan = await loans.get(req.params.id)
    if (loan.status !== 'approved') {
      throw new HttpError(409, `Loan with id ${loan.id} is not approved (${loan.status})`)
    }
    const quote = servicing.quote(loan, req.query.paid, req.query.date)
    if (quote === -1 || quote.st !== 'OK') {
      const code = quote === -1 ? 'ERR_0' : quote.st
      throw new HttpError(400, QUOTE_ERRORS[code] ?? `Settlement quote failed (${code})`)
    }
    req.log.info({ loanId: loan.id, paid: quote.paid, total: quote.total }, 'settlement quoted')
    res.json(quote)
  })

  app.use('/api', notFoundHandler)

  if (staticDir) {
    app.use(express.static(staticDir))
  }

  app.use(errorHandler)
  return app
}
