import { randomUUID } from 'node:crypto'
import type { RequestHandler } from 'express'
import { destination, multistream, pino, stdTimeFunctions, type Level, type Logger } from 'pino'

export type { Logger }

/**
 * A pino logger that writes JSON lines to stdout and to a log file.
 * The log folder is created on demand.
 */
export function createLogger(filePath: string, level: Level = 'info'): Logger {
  return pino(
    { level, timestamp: stdTimeFunctions.isoTime },
    multistream([
      { level, stream: process.stdout },
      { level, stream: destination({ dest: filePath, mkdir: true, sync: true }) }
    ])
  )
}

// Every request carries its own child logger tagged with a request id
declare global {
  namespace Express {
    interface Request {
      log: Logger
    }
  }
}

/**
 * Attach a per-request child logger and log every finished request
 */
export function requestLogger(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const startedAt = Date.now()
    req.log = logger.child({ reqId: randomUUID().slice(0, 8) })

    res.on('finish', () => {
      req.log.info(
        {
          method: req.method,
          url: req.originalUrl,
          status: res.statusCode,
          durationMs: Date.now() - startedAt
        },
        'request completed'
      )
    })

    next()
  }
}
