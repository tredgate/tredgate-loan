import type { ErrorRequestHandler, RequestHandler } from 'express'
import { LoanValidationError } from '../shared/loanRules'

/**
 * An error with an HTTP status code, thrown by routes and services
 */
export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

/**
 * 404 for unknown /api routes
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new HttpError(404, `Route ${req.method} ${req.originalUrl} not found`))
}

/**
 * Map errors to JSON responses.
 * 4xx are expected outcomes (logged as warn), 5xx are bugs (logged as error with stack).
 */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const status = statusOf(err)
  const message = err instanceof Error ? err.message : String(err)

  if (status >= 500) {
    req.log.error({ err }, 'request failed with an unexpected error')
    res.status(status).json({ error: 'Internal server error' })
    return
  }

  req.log.warn({ status, reason: message }, 'request rejected')
  res.status(status).json({ error: message })
}

function statusOf(err: unknown): number {
  if (err instanceof HttpError) return err.status
  if (err instanceof LoanValidationError) return 400
  // body-parser errors (e.g. malformed JSON) carry their own status
  if (typeof err === 'object' && err !== null && 'status' in err && typeof err.status === 'number') {
    return err.status
  }
  return 500
}
