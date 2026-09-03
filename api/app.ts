import Fastify from 'fastify'
import cors from '@fastify/cors'
import rateLimit from '@fastify/rate-limit'
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto'
import {
  marketObservationDecisionSchema,
  marketObservationSubmissionSchema,
} from '../src/domain/receipts/marketObservationSchema.js'
import type { ContributionDatabase } from './database.js'

export type ApiOptions = {
  database: ContributionDatabase
  adminToken: string
  allowedOrigins: string[]
  logger?: boolean
  rateLimitMax?: number
  trustProxy?: boolean
}

function tokenMatches(actual: string | undefined, expected: string): boolean {
  if (!actual?.startsWith('Bearer ')) return false
  const supplied = createHash('sha256').update(actual.slice(7)).digest()
  const wanted = createHash('sha256').update(expected).digest()
  return timingSafeEqual(supplied, wanted)
}

export async function createApi(options: ApiOptions) {
  const normalizedAllowedOrigins = options.allowedOrigins.map((origin) => origin.replace(/\/+$/, ''))
  function isAllowedOrigin(origin: string | undefined): boolean {
    if (!origin) return true
    return normalizedAllowedOrigins.includes(origin.replace(/\/+$/, ''))
  }

  const app = Fastify({ logger: options.logger ?? false, bodyLimit: 256 * 1024, trustProxy: options.trustProxy ?? false })
  await app.register(cors, {
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin))
    },
  })
  await app.register(rateLimit, {
    global: false,
    max: options.rateLimitMax ?? 10,
    timeWindow: '1 hour',
    keyGenerator: (request) => {
      if (options.trustProxy) {
        const cloudflareIp = request.headers['cf-connecting-ip']
        if (typeof cloudflareIp === 'string') return cloudflareIp
      }
      return request.ip
    },
  })

  app.get('/healthz', async () => ({ ok: true }))

  app.post('/v1/submissions', { config: { rateLimit: {} } }, async (request, reply) => {
    const origin = request.headers.origin
    if (origin && !isAllowedOrigin(origin)) {
      return reply.status(403).send({ message: 'Origin is not allowed.' })
    }
    const parsed = marketObservationSubmissionSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({ message: 'Invalid market observation submission.', issues: parsed.error.issues })
    }
    const existing = options.database.findSubmission(parsed.data.clientSubmissionId)
    if (existing) return { submissionId: existing.id, marketCount: parsed.data.markets.length }

    const id = randomUUID()
    const result = options.database.saveSubmission(id, parsed.data, new Date().toISOString())
    return reply.status(result.created ? 201 : 200).send({ submissionId: result.submissionId, marketCount: parsed.data.markets.length })
  })

  app.get('/v1/admin/submissions', async (request, reply) => {
    if (!tokenMatches(request.headers.authorization, options.adminToken)) {
      return reply.status(401).send({ message: 'Unauthorized.' })
    }
    return { entries: options.database.pendingEntries() }
  })

  app.post<{ Params: { entryId: string } }>('/v1/admin/entries/:entryId/decision', async (request, reply) => {
    if (!tokenMatches(request.headers.authorization, options.adminToken)) {
      return reply.status(401).send({ message: 'Unauthorized.' })
    }
    const entryId = Number(request.params.entryId)
    const decision = marketObservationDecisionSchema.safeParse(request.body)
    if (!Number.isSafeInteger(entryId) || entryId < 1 || !decision.success) {
      return reply.status(400).send({ message: 'Invalid review decision.' })
    }
    const entry = options.database.getEntry(entryId)
    if (!entry || entry.status !== 'pending') return reply.status(404).send({ message: 'Pending entry not found.' })
    if (decision.data.mapping && (decision.data.mapping.marketId !== entry.marketId || decision.data.mapping.retailer !== entry.retailer)) {
      return reply.status(400).send({ message: 'Reviewed mapping does not match the pending market.' })
    }
    const result = options.database.decideEntry(entryId, decision.data.status, decision.data.note, decision.data.mapping)
    if (!result.changes) return reply.status(404).send({ message: 'Pending entry not found.' })
    return { ok: true }
  })

  return app
}
