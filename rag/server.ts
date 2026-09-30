import { createRagApp } from './app'
import { ragConfig } from './config'

// The RAG HTTP API: `npm run rag:serve` (also started by `npm run dev`)
const app = createRagApp({
  docsRoot: ragConfig.docsRoot,
  indexPath: ragConfig.indexPath,
  defaultK: ragConfig.defaultK,
  log: line => console.log(`[rag] ${line}`)
})

app.listen(ragConfig.port, (err?: Error) => {
  if (err) {
    console.error(`[rag] failed to start on port ${ragConfig.port}: ${err.message}`)
    process.exit(1)
  }
  console.log(`[rag] documentation search API listening on http://localhost:${ragConfig.port} (docs: ${ragConfig.docsRoot})`)
})
