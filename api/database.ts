import Database from 'better-sqlite3'
import {
  normalizeMarketObservation,
  type MarketObservationSubmission,
} from '../src/domain/receipts/marketObservationSchema.js'

export type ReviewStatus = 'pending' | 'accepted' | 'rejected'

export type PendingMarketEntry = {
  entryId: number
  submissionId: string
  appVersion: string
  locale: 'de' | 'en'
  createdAt: string
  retailer: 'rewe'
  marketId: string
  observations: string[]
  details?: Record<string, string>
}

export function openContributionDatabase(path: string) {
  const database = new Database(path)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.pragma('busy_timeout = 5000')
  database.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      client_submission_id TEXT NOT NULL UNIQUE,
      schema_version INTEGER NOT NULL,
      app_version TEXT NOT NULL,
      locale TEXT NOT NULL,
      consent_version INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS market_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      submission_id TEXT NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
      retailer TEXT NOT NULL,
      market_id TEXT NOT NULL,
      details_json TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected')),
      reviewer_note TEXT,
      reviewed_mapping_json TEXT,
      decided_at TEXT
    );
    CREATE TABLE IF NOT EXISTS observations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_entry_id INTEGER NOT NULL REFERENCES market_entries(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      normalized_text TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS market_entries_status_idx ON market_entries(status, market_id);
    CREATE INDEX IF NOT EXISTS observations_entry_idx ON observations(market_entry_id);
  `)
  database.pragma('user_version = 1')

  const insertSubmission = database.prepare(`
    INSERT INTO submissions (id, client_submission_id, schema_version, app_version, locale, consent_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `)
  const findSubmission = database.prepare('SELECT id FROM submissions WHERE client_submission_id = ?')
  const insertEntry = database.prepare(`
    INSERT INTO market_entries (submission_id, retailer, market_id, details_json)
    VALUES (?, ?, ?, ?)
  `)
  const insertObservation = database.prepare(`
    INSERT INTO observations (market_entry_id, text, normalized_text) VALUES (?, ?, ?)
  `)
  const selectObservations = database.prepare('SELECT text FROM observations WHERE market_entry_id = ? ORDER BY id')
  const selectPendingMarketEntries = database.prepare(`
    SELECT me.id AS entry_id, s.id AS submission_id, s.app_version, s.locale, s.created_at,
      me.retailer, me.market_id, me.details_json
    FROM market_entries me
    JOIN submissions s ON s.id = me.submission_id
    WHERE me.status = 'pending'
    ORDER BY me.market_id, s.created_at, me.id
  `)

  const saveSubmissionTransaction = database.transaction((id: string, submission: MarketObservationSubmission, createdAt: string) => {
    insertSubmission.run(
      id,
      submission.clientSubmissionId,
      submission.schemaVersion,
      submission.appVersion,
      submission.locale,
      submission.consent.version,
      createdAt,
    )
    for (const market of submission.markets) {
      const entry = insertEntry.run(
        id,
        market.retailer,
        market.marketId,
        market.details ? JSON.stringify(market.details) : null,
      )
      for (const observation of market.observations) {
        insertObservation.run(entry.lastInsertRowid, observation.text, normalizeMarketObservation(observation.text))
      }
    }
  })

  function saveSubmission(id: string, submission: MarketObservationSubmission, createdAt: string): { submissionId: string; created: boolean } {
    try {
      saveSubmissionTransaction(id, submission, createdAt)
      return { submissionId: id, created: true }
    } catch (error: unknown) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        const existing = findSubmission.get(submission.clientSubmissionId) as { id: string } | undefined
        if (existing) {
          return { submissionId: existing.id, created: false }
        }
      }
      throw error
    }
  }

  function pendingEntries(): PendingMarketEntry[] {
    const rows = selectPendingMarketEntries.all() as Array<Record<string, string | number | null>>
    return rows.map((row) => ({
      entryId: Number(row.entry_id),
      submissionId: String(row.submission_id),
      appVersion: String(row.app_version),
      locale: row.locale as 'de' | 'en',
      createdAt: String(row.created_at),
      retailer: row.retailer as 'rewe',
      marketId: String(row.market_id),
      observations: (selectObservations.all(row.entry_id) as Array<{ text: string }>).map((item) => item.text),
      ...(row.details_json ? { details: JSON.parse(String(row.details_json)) as Record<string, string> } : {}),
    }))
  }

  const decideEntry = database.prepare(`
    UPDATE market_entries
    SET status = ?, reviewer_note = ?, reviewed_mapping_json = ?, decided_at = ?
    WHERE id = ? AND status = 'pending'
  `)
  const getEntry = database.prepare('SELECT retailer, market_id AS marketId, status FROM market_entries WHERE id = ?')

  return {
    raw: database,
    findSubmission(clientSubmissionId: string) {
      return findSubmission.get(clientSubmissionId) as { id: string } | undefined
    },
    saveSubmission,
    pendingEntries,
    getEntry(entryId: number) {
      return getEntry.get(entryId) as { retailer: string; marketId: string; status: ReviewStatus } | undefined
    },
    decideEntry(entryId: number, status: Exclude<ReviewStatus, 'pending'>, note?: string, mapping?: unknown) {
      return decideEntry.run(status, note || null, mapping ? JSON.stringify(mapping) : null, new Date().toISOString(), entryId)
    },
    close() { database.close() },
  }
}

export type ContributionDatabase = ReturnType<typeof openContributionDatabase>
