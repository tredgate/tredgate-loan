import { existsSync } from 'node:fs'
import { createApp } from './app'
import { config } from './config'
import { createLogger } from './logger'
import { createLoanStore } from './loanStore'

const logger = createLogger(config.logFile, config.logLevel)
const store = createLoanStore({ filePath: config.dataFile, seedPath: config.seedFile })
const staticDir = existsSync(config.staticDir) ? config.staticDir : undefined

const app = createApp({ store, logger, staticDir })

// Make sure the data file exists before the first request (it is created from the seed when missing)
await store.read()

app.listen(config.port, (err?: Error) => {
  if (err) {
    // Typically EADDRINUSE: another instance is already listening on this port (see runbook RB-004)
    logger.error({ err, port: config.port }, 'Tredgate Loan API failed to start')
    process.exit(1)
  }
  logger.info(
    {
      port: config.port,
      dataFile: config.dataFile,
      logFile: config.logFile,
      servingFrontend: Boolean(staticDir)
    },
    'Tredgate Loan API started'
  )
})
