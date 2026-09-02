interface PdfTextContent {
  items: unknown[]
}

interface PdfPage {
  getTextContent(): Promise<PdfTextContent>
  cleanup(): unknown
}

interface PdfDocument {
  numPages: number
  getPage(pageNumber: number): Promise<PdfPage>
}

interface PdfLoadingTask {
  promise: Promise<PdfDocument>
  destroy(): Promise<void>
}

export type PdfDocumentLoader = (data: Uint8Array) => PdfLoadingTask

export async function extractPdfTextFromBytes(data: Uint8Array, loadDocument: PdfDocumentLoader): Promise<string> {
  const loadingTask = loadDocument(data)
  const pages: string[] = []

  try {
    const document = await loadingTask.promise
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      try {
        const content = await page.getTextContent()
        pages.push(content.items.map((item) => {
          if (!item || typeof item !== 'object' || !('str' in item)) return ''
          const textItem = item as { str: string; hasEOL?: boolean }
          return `${textItem.str}${textItem.hasEOL ? '\n' : ' '}`
        }).join(''))
      } finally {
        page.cleanup()
      }
    }
  } finally {
    await loadingTask.destroy()
  }

  const result = pages.join('\n')
  if (!result.trim()) throw new Error('no-text')
  return result
}
