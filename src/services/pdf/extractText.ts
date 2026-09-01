import { GlobalWorkerOptions, getDocument } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

GlobalWorkerOptions.workerSrc = pdfWorker

export async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const loadingTask = getDocument({ data: bytes })
  const document = await loadingTask.promise
  const pages: string[] = []

  try {
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const text = content.items.map((item) => {
        if (!('str' in item)) return ''
        const textItem = item as { str: string; hasEOL?: boolean }
        return `${textItem.str}${textItem.hasEOL ? '\n' : ' '}`
      }).join('')
      pages.push(text)
      page.cleanup()
    }
  } finally {
    await loadingTask.destroy()
  }

  const result = pages.join('\n')
  if (!result.trim()) throw new Error('no-text')
  return result
}
