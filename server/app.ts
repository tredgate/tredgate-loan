import express from 'express'
import type { LoanStatus } from '../shared/loan'
import { HttpError, errorHandler, notFoundHandler } from './errors'
import { requestLogger, type Logger } from './logger'
import { createLoanService } from './loanService'
import type { LoanStore } from './loanStore'

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

  app.use('/api', notFoundHandler)

  if (staticDir) {
    app.use(express.static(staticDir))
  }

  app.use(errorHandler)
  return app
}
