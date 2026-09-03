import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createApi } from './app.js'
import { openContributionDatabase } from './database.js'

const port = Number(process.env.PORT || 8788)
const host = process.env.HOST || '127.0.0.1'
const databasePath = resolve(process.env.DATABASE_PATH || './data/market-contributions.sqlite')
const adminToken = process.env.ADMIN_TOKEN || ''
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173')
  .split(',').map((origin) => origin.trim().replace(/\/+$/, '')).filter(Boolean)

if (adminToken.length < 32) throw new Error('ADMIN_TOKEN must contain at least 32 characters.')
mkdirSync(dirname(databasePath), { recursive: true })
const database = openContributionDatabase(databasePath)
const app = await createApi({ database, adminToken, allowedOrigins, logger: true, trustProxy: process.env.TRUST_PROXY === 'true' })

let shuttingDown = false
const shutdown = async () => {
  if (shuttingDown) return
  shuttingDown = true
  try {
    await app.close()
    database.close()
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port, host })
