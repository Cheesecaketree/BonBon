import { describe, expect, it, vi } from 'vitest'
import { extractPdfTextFromBytes, type PdfDocumentLoader } from '../../src/services/pdf/extractTextCore'

function fixtureLoader(pages: Array<{ items?: unknown[]; error?: Error }>) {
  const cleanup = pages.map(() => vi.fn())
  const destroy = vi.fn().mockResolvedValue(undefined)
  const loadDocument: PdfDocumentLoader = () => ({
    promise: Promise.resolve({
      numPages: pages.length,
      getPage: async (pageNumber) => ({
        getTextContent: async () => {
          const page = pages[pageNumber - 1]
          if (page.error) throw page.error
          return { items: page.items ?? [] }
        },
        cleanup: cleanup[pageNumber - 1],
      }),
    }),
    destroy,
  })
  return { loadDocument, cleanup, destroy }
}

describe('shared PDF text extraction', () => {
  it('joins pages and respects PDF.js line endings', async () => {
    const fixture = fixtureLoader([
      { items: [{ str: 'First', hasEOL: true }, { str: 'line' }] },
      { items: [{ str: 'Second' }, { type: 'marked-content' }] },
    ])
    await expect(extractPdfTextFromBytes(new Uint8Array([1]), fixture.loadDocument)).resolves.toBe('First\nline \nSecond ')
    expect(fixture.cleanup.every((cleanup) => cleanup.mock.calls.length === 1)).toBe(true)
    expect(fixture.destroy).toHaveBeenCalledOnce()
  })

  it('cleans up the page and document when text extraction fails', async () => {
    const fixture = fixtureLoader([{ error: new Error('broken') }])
    await expect(extractPdfTextFromBytes(new Uint8Array([1]), fixture.loadDocument)).rejects.toThrow('broken')
    expect(fixture.cleanup[0]).toHaveBeenCalledOnce()
    expect(fixture.destroy).toHaveBeenCalledOnce()
  })

  it('rejects documents without visible text after cleanup', async () => {
    const fixture = fixtureLoader([{ items: [{ str: '   ' }] }])
    await expect(extractPdfTextFromBytes(new Uint8Array([1]), fixture.loadDocument)).rejects.toThrow('no-text')
    expect(fixture.cleanup[0]).toHaveBeenCalledOnce()
    expect(fixture.destroy).toHaveBeenCalledOnce()
  })
})
