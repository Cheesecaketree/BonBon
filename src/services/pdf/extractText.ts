import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { extractPdfTextFromBytes } from './extractTextCore'

GlobalWorkerOptions.workerSrc = pdfWorker

const extractionCache = new WeakMap<File, Promise<string>>()

async function readPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  return extractPdfTextFromBytes(bytes, (data) => getDocument({ data }))
}

export function extractPdfText(file: File): Promise<string> {
  const cached = extractionCache.get(file)
  if (cached) return cached
  const extraction = readPdfText(file).catch((error) => {
    extractionCache.delete(file)
    throw error
  })
  extractionCache.set(file, extraction)
  return extraction
}
