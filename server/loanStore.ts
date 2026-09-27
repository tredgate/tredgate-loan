import { copyFile, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { LoanApplication } from '../shared/loan'

export interface LoanStoreOptions {
  filePath: string  // the live data file, created from the seed when missing
  seedPath: string  // committed seed data
}

export interface LoanStore {
  /** Read all loans */
  read(): Promise<LoanApplication[]>
  /** Load, mutate and save in one serialized step; returns whatever `mutate` returns */
  update<T>(mutate: (loans: LoanApplication[]) => T): Promise<T>
  /** Replace the data file with the seed */
  reset(): Promise<void>
}

/**
 * A tiny JSON-file store, good enough for a teaching app:
 * one file, atomic writes, and updates serialized through a promise chain
 * so that concurrent requests cannot overwrite each other's changes.
 */
export function createLoanStore({ filePath, seedPath }: LoanStoreOptions): LoanStore {
  let chain: Promise<unknown> = Promise.resolve()

  async function read(): Promise<LoanApplication[]> {
    try {
      return JSON.parse(await readFile(filePath, 'utf8')) as LoanApplication[]
    } catch (err) {
      if (isMissingFile(err)) {
        await reset()
        return read()
      }
      throw err
    }
  }

  async function save(loans: LoanApplication[]): Promise<void> {
    // Write to a temp file first and rename: the data file is never left half-written
    const tempPath = `${filePath}.tmp`
    await writeFile(tempPath, JSON.stringify(loans, null, 2))
    await rename(tempPath, filePath)
  }

  async function reset(): Promise<void> {
    await mkdir(path.dirname(filePath), { recursive: true })
    await copyFile(seedPath, filePath)
  }

  function update<T>(mutate: (loans: LoanApplication[]) => T): Promise<T> {
    const run = chain.then(async () => {
      const loans = await read()
      const result = mutate(loans)
      await save(loans)
      return result
    })
    chain = run.catch(() => undefined)
    return run
  }

  return { read, update, reset }
}

function isMissingFile(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT'
}
