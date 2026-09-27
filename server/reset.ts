import { config } from './config'
import { createLoanStore } from './loanStore'

// Restore the data file from the seed: `npm run data:reset`
const store = createLoanStore({ filePath: config.dataFile, seedPath: config.seedFile })
await store.reset()
console.log(`Loan data reset from seed: ${config.dataFile}`)
