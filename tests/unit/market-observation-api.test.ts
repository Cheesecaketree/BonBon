// @vitest-environment node
import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { createApi } from '../../api/app'
import { openContributionDatabase } from '../../api/database'

const directories: string[] = []

async function setup(rateLimitMax = 100) {
  const directory = await mkdtemp(join(tmpdir(), 'bonbon-api-'))
  directories.push(directory)
  const database = openContributionDatabase(join(directory, 'test.sqlite'))
  const app = await createApi({ database, adminToken: 'test-secret', allowedOrigins: ['https://bonbon.test'], rateLimitMax })
  return { app, database }
}

function submission(clientSubmissionId = '34c1c010-6d50-4e5e-9247-2cf203a874df') {
  return {
    schemaVersion: 1,
    clientSubmissionId,
    appVersion: '0.2.0',
    locale: 'en',
    consent: { confirmed: true, version: 1 },
    markets: [{
      retailer: 'rewe', marketId: '11',
      observations: [{ text: 'REWE Example, Main Street 2, 12345 Berlin' }],
      details: { city: 'Berlin' },
    }],
  }
}

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })))
})

describe('market observation API', () => {
  it('stores a canonical, idempotent submission and exposes it only with admin authentication', async () => {
    const { app, database } = await setup()
    const first = await app.inject({ method: 'POST', url: '/v1/submissions', headers: { origin: 'https://bonbon.test' }, payload: submission() })
    const repeated = await app.inject({ method: 'POST', url: '/v1/submissions', headers: { origin: 'https://bonbon.test' }, payload: submission() })
    expect(first.statusCode).toBe(201)
    expect(repeated.statusCode).toBe(200)
    expect(repeated.json().submissionId).toBe(first.json().submissionId)

    expect((await app.inject({ method: 'GET', url: '/v1/admin/submissions' })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/submissions', headers: { authorization: 'Bearer short' } })).statusCode).toBe(401)
    expect((await app.inject({ method: 'GET', url: '/v1/admin/submissions', headers: { authorization: 'Bearer ' + 'x'.repeat(100) } })).statusCode).toBe(401)
    const pending = await app.inject({ method: 'GET', url: '/v1/admin/submissions', headers: { authorization: 'Bearer test-secret' } })
    expect(pending.json().entries[0]).toMatchObject({ marketId: '0011', observations: ['REWE Example, Main Street 2, 12345 Berlin'] })
    await app.close()
    database.close()
  })

  it('handles origins with trailing slashes and rejects missing consent or disallowed browser origins', async () => {
    const { app, database } = await setup()
    const withTrailingSlashOrigin = await app.inject({ method: 'POST', url: '/v1/submissions', headers: { origin: 'https://bonbon.test/' }, payload: submission('019b8df7-1111-7000-8000-000000000001') })
    expect(withTrailingSlashOrigin.statusCode).toBe(201)

    const withoutConsent = submission() as any
    withoutConsent.consent.confirmed = false
    expect((await app.inject({ method: 'POST', url: '/v1/submissions', payload: withoutConsent })).statusCode).toBe(400)
    const origin = await app.inject({ method: 'OPTIONS', url: '/v1/submissions', headers: { origin: 'https://evil.test', 'access-control-request-method': 'POST' } })
    expect(origin.headers['access-control-allow-origin']).toBeUndefined()
    expect((await app.inject({ method: 'POST', url: '/v1/submissions', headers: { origin: 'https://evil.test' }, payload: submission('ed2f963c-cc50-4d04-9c11-f635b6244f82') })).statusCode).toBe(403)
    await app.close()
    database.close()
  })

  it('retains raw text after a protected review decision', async () => {
    const { app, database } = await setup()
    await app.inject({ method: 'POST', url: '/v1/submissions', payload: submission() })
    const pending = await app.inject({ method: 'GET', url: '/v1/admin/submissions', headers: { authorization: 'Bearer test-secret' } })
    const entryId = pending.json().entries[0].entryId
    expect((await app.inject({
      method: 'POST', url: `/v1/admin/entries/${entryId}/decision`, headers: { authorization: 'Bearer test-secret' }, payload: { status: 'accepted' },
    })).statusCode).toBe(200)
    expect(database.raw.prepare('SELECT text FROM observations').get()).toEqual({ text: 'REWE Example, Main Street 2, 12345 Berlin' })
    expect(database.pendingEntries()).toEqual([])
    await app.close()
    database.close()
  })

  it('handles concurrent identical submissions idempotently', async () => {
    const { app, database } = await setup()
    const clientSubmissionId = 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d'
    const [res1, res2] = await Promise.all([
      app.inject({ method: 'POST', url: '/v1/submissions', payload: submission(clientSubmissionId) }),
      app.inject({ method: 'POST', url: '/v1/submissions', payload: submission(clientSubmissionId) }),
    ])
    const statusCodes = [res1.statusCode, res2.statusCode].sort()
    expect(statusCodes).toEqual([200, 201])
    expect(res1.json().submissionId).toBe(res2.json().submissionId)
    await app.close()
    database.close()
  })

  it('enforces the public submission rate and body-size limits', async () => {
    const { app, database } = await setup(1)
    expect((await app.inject({ method: 'POST', url: '/v1/submissions', payload: submission() })).statusCode).toBe(201)
    expect((await app.inject({ method: 'POST', url: '/v1/submissions', payload: submission('4be2e6eb-ecc8-46b7-bcbb-c541d21df721') })).statusCode).toBe(429)
    await app.close()
    database.close()

    const second = await setup()
    const oversized = JSON.stringify({ padding: 'x'.repeat(270 * 1024) })
    expect((await second.app.inject({ method: 'POST', url: '/v1/submissions', headers: { 'content-type': 'application/json' }, payload: oversized })).statusCode).toBe(413)
    await second.app.close()
    second.database.close()
  })
})
