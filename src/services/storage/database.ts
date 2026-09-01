import { openDB, type IDBPDatabase } from 'idb'
import type { Receipt } from '../../domain/receipts/types'

const DATABASE_NAME = 'bonbon'
const DB_VERSION = 2
const STORE_RECEIPTS = 'receipts'
const STORE_PDFS = 'pdfs'

export interface PersistedPdf {
  filename: string
  buffer: ArrayBuffer
  lastModified: number
}

function database(): Promise<IDBPDatabase> {
  return openDB(DATABASE_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_RECEIPTS)) {
        db.createObjectStore(STORE_RECEIPTS, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(STORE_PDFS)) {
        db.createObjectStore(STORE_PDFS, { keyPath: 'filename' })
      }
    },
  })
}

export async function loadReceipts(): Promise<Receipt[]> {
  try {
    const db = await database()
    return await db.getAll(STORE_RECEIPTS)
  } catch (error) {
    console.error('Failed to load receipts from IndexedDB:', error)
    return []
  }
}

export async function saveReceipts(receipts: Receipt[]): Promise<void> {
  try {
    const db = await database()
    const rawReceipts: Receipt[] = JSON.parse(JSON.stringify(receipts))
    const tx = db.transaction(STORE_RECEIPTS, 'readwrite')
    await tx.store.clear()
    for (const receipt of rawReceipts) {
      await tx.store.put(receipt)
    }
    await tx.done
  } catch (error) {
    console.error('Failed to save receipts to IndexedDB:', error)
  }
}

export async function loadPdfFiles(): Promise<Map<string, File>> {
  const map = new Map<string, File>()
  try {
    const db = await database()
    const all: PersistedPdf[] = await db.getAll(STORE_PDFS)
    for (const item of all) {
      const file = new File([item.buffer], item.filename, {
        type: 'application/pdf',
        lastModified: item.lastModified || Date.now(),
      })
      map.set(item.filename, file)
    }
  } catch (error) {
    console.error('Failed to load PDFs from IndexedDB:', error)
  }
  return map
}

export async function savePdfFiles(files: File[] | Map<string, File>): Promise<void> {
  try {
    const db = await database()
    const fileList = files instanceof Map ? [...files.values()] : files
    const tx = db.transaction(STORE_PDFS, 'readwrite')
    for (const file of fileList) {
      const buffer = await file.arrayBuffer()
      await tx.store.put({
        filename: file.name,
        buffer,
        lastModified: file.lastModified,
      })
    }
    await tx.done
  } catch (error) {
    console.error('Failed to save PDFs to IndexedDB:', error)
  }
}

export async function clearPersistedReceipts(): Promise<void> {
  await clearPersistedData()
}

export async function clearPersistedData(): Promise<void> {
  try {
    const db = await database()
    const tx = db.transaction([STORE_RECEIPTS, STORE_PDFS], 'readwrite')
    await tx.objectStore(STORE_RECEIPTS).clear()
    await tx.objectStore(STORE_PDFS).clear()
    await tx.done
  } catch (error) {
    console.error('Failed to clear IndexedDB:', error)
  }
}
