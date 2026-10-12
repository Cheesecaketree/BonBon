import { openDB } from 'idb'
import { parseReweExportBackup, type ReweExport } from '../../domain/receipts/reweExport/schema'

// A separate database and opt-in. PDF storage and export storage never clear each other.
const DATABASE = 'bonbon-rewe-account-export'
const STORE = 'snapshot'

function database() {
  return openDB(DATABASE, 1, {
    upgrade(db) { db.createObjectStore(STORE) },
  })
}

export async function loadAccountExport(): Promise<ReweExport | null> {
  const db = await database()
  try {
    const data = await db.get(STORE, 'current')
    return data ? parseReweExportBackup(JSON.stringify(data)) : null
  } finally { db.close() }
}

export async function saveAccountExport(data: ReweExport) {
  const db = await database()
  try { await db.put(STORE, JSON.parse(JSON.stringify(data)), 'current') }
  finally { db.close() }
}

export async function clearAccountExport() {
  const db = await database()
  try { await db.clear(STORE) }
  finally { db.close() }
}

export function downloadAccountExport(data: ReweExport) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'bonbon-rewe-datenexport.json'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
