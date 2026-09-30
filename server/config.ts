import path from 'node:path'
import type { Level } from 'pino'

/**
 * Runtime configuration.
 * Everything has a local default so `npm run dev` just works;
 * environment variables let you override ports and paths.
 */
const serverDir = import.meta.dirname
const rootDir = path.resolve(serverDir, '..')

export const config = {
  port: Number(process.env.PORT ?? 3000),
  dataFile: process.env.DATA_FILE ?? path.join(serverDir, 'data', 'loans.json'),
  seedFile: path.join(serverDir, 'data', 'loans.seed.json'),
  logFile: process.env.LOG_FILE ?? path.join(rootDir, 'logs', 'app.log'),
  logLevel: (process.env.LOG_LEVEL ?? 'info') as Level,
  staticDir: path.join(rootDir, 'dist')
}
