import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MarketHelp from '../../src/features/markets/MarketHelp.vue'
import { getStoredLocalMarketMatches } from '../../src/domain/receipts/marketContributions'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const { extractPdfTextMock } = vi.hoisted(() => ({ extractPdfTextMock: vi.fn() }))
vi.mock('../../src/services/pdf/extractText', () => ({ extractPdfText: extractPdfTextMock }))

const unknownReceipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
}

function pdf(name: string) { return new File(['synthetic'], name, { type: 'application/pdf' }) }

describe('market observation workflow', () => {
  beforeEach(() => {
    localStorage.clear()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:synthetic-receipt') })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    i18n.global.locale.value = 'en'
    extractPdfTextMock.mockReset()
    extractPdfTextMock.mockResolvedValue('REWE Markt GmbH\nVenloer Str. 310\n50823 Köln\nEUR')
  })

  it('extracts from known and unknown markets and collapses identical observations per market', async () => {
    const duplicate = { ...unknownReceipt, id: 'duplicate', filename: 'duplicate.pdf', receiptNumber: '2' }
    const known = { ...unknownReceipt, id: 'known', filename: 'known.pdf', marketId: '0011' }
    const wrapper = mount(MarketHelp, {
      props: {
        receipts: [unknownReceipt, duplicate, known],
        pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')], ['duplicate.pdf', pdf('duplicate.pdf')], ['known.pdf', pdf('known.pdf')]]),
      },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect(wrapper.findAll('.observation-market-card')).toHaveLength(2)
    expect(wrapper.findAll('.observation-editor')).toHaveLength(2)
    expect(wrapper.find('.bundled-market-reference').exists()).toBe(true)
    expect(wrapper.text()).toContain('What should I check?')
    expect(wrapper.text()).toContain('BonBon found a possible difference')
    expect(extractPdfTextMock).toHaveBeenCalledTimes(3)
  })

  it('does not prepare exact bundled-address confirmations for submission', async () => {
    extractPdfTextMock.mockResolvedValue('REWE Philipp Menz OHG\nGrindelallee 40-44\n20146 Hamburg\nEUR')
    const known = { ...unknownReceipt, id: 'known', filename: 'known.pdf', marketId: '0011' }
    const wrapper = mount(MarketHelp, {
      props: { receipts: [known], pdfFiles: new Map([['known.pdf', pdf('known.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect(wrapper.findAll('.observation-market-card')).toHaveLength(0)
    expect(wrapper.text()).toContain('Everything already matches')
    await wrapper.findAll('.market-mode-toggle button')[1].trigger('click')
    expect(wrapper.findAll('.observation-market-card')).toHaveLength(1)
    expect(wrapper.text()).toContain('Already matches')
    await wrapper.get('textarea').setValue('REWE Philipp Menz OHG\nGrindelallee 41-45\n20146 Hamburg')
    expect(wrapper.find('.observation-submit-panel').exists()).toBe(true)
  })

  it('defaults to the simple layout and uses one page-wide advanced switch without losing text edits', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect(wrapper.classes()).toContain('market-mode-simple')
    expect(wrapper.find('.advanced-market-fields').exists()).toBe(false)
    await wrapper.get('textarea').setValue('REWE corrected\nMain Street 2\n12345 Berlin')
    await wrapper.findAll('.market-mode-toggle button')[1].trigger('click')
    expect(wrapper.classes()).toContain('market-mode-advanced')
    expect(wrapper.findAll('.advanced-market-fields')).toHaveLength(1)
    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value).toContain('REWE corrected')
  })

  it('cleans retailer spacing and phone lines in the browser before submission', async () => {
    extractPdfTextMock.mockResolvedValue('R E W E Markt GmbH\nVenloer Str. 310\nTel.: 0221 123456\n50823 Köln\nEUR')
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    expect((wrapper.get('textarea').element as HTMLTextAreaElement).value)
      .toBe('REWE Markt GmbH, Venloer Str. 310, 50823 Köln')
  })

  it('opens the receipt beside the editable market content', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    await wrapper.get('.open-observation-receipt').trigger('click')
    expect(wrapper.classes()).toContain('has-receipt-viewer')
    expect(wrapper.find('.receipt-comparison-panel').exists()).toBe(true)
    expect(wrapper.find('.receipt-viewer-backdrop').exists()).toBe(false)
    expect(wrapper.find('.market-help-content textarea').exists()).toBe(true)
    const comparisonRow = wrapper.get('.market-review-row.viewer-open')
    expect(comparisonRow.find('.observation-market-card').exists()).toBe(true)
    expect(comparisonRow.find('.receipt-comparison-panel').exists()).toBe(true)
    expect(comparisonRow.find('.observation-editor.receipt-open').exists()).toBe(true)
    expect(comparisonRow.get('.open-observation-receipt').attributes('aria-pressed')).toBe('true')
    expect(comparisonRow.text()).toContain('The receipt for this market is open on the right')
    expect(wrapper.get('.receipt-comparison-panel .eyebrow').text()).toContain('Market 9999')
    expect(wrapper.get('.receipt-comparison-panel iframe').attributes('src')).toBe('blob:synthetic-receipt')

    await wrapper.get('.receipt-comparison-panel .close-button').trigger('click')
    expect(wrapper.find('.receipt-comparison-panel').exists()).toBe(false)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:synthetic-receipt')
  })

  it('allows a complete advanced mapping to resolve an unknown market locally', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.findAll('.market-mode-toggle button')[1].trigger('click')

    const save = wrapper.get('.advanced-market-fields .button')
    expect(save.attributes('disabled')).toBeUndefined()
    await save.trigger('click')
    expect(getStoredLocalMarketMatches()['9999']).toMatchObject({ street: 'Venloer Str.', houseNumber: '310', zip: '50823', city: 'Köln' })
  })

  it('allows a saved local match to be deleted', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.findAll('.market-mode-toggle button')[1].trigger('click')

    const save = wrapper.get('.advanced-market-fields .button')
    await save.trigger('click')
    expect(getStoredLocalMarketMatches()['9999']).toBeDefined()

    const deleteBtn = wrapper.get('.delete-local-match')
    await deleteBtn.trigger('click')
    expect(getStoredLocalMarketMatches()['9999']).toBeUndefined()
  })

  it('handles incomplete or invalid advanced fields without crashing the submission computed property', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()
    await wrapper.findAll('.market-mode-toggle button')[1].trigger('click')

    const countryInput = wrapper.get('#market-country-9999')
    await countryInput.setValue('D')
    // Computed submission must not crash on partial country code
    expect(wrapper.find('.market-help-page').exists()).toBe(true)
  })

  it('does not reset consent when blurring a textarea with unchanged text', async () => {
    const wrapper = mount(MarketHelp, {
      props: { receipts: [unknownReceipt], pdfFiles: new Map([['unknown.pdf', pdf('unknown.pdf')]]) },
      global: { plugins: [i18n] },
    })
    await flushPromises()

    const consentCheckbox = wrapper.get('.observation-consent input')
    await consentCheckbox.setValue(true)
    expect((consentCheckbox.element as HTMLInputElement).checked).toBe(true)

    const textarea = wrapper.get('textarea')
    await textarea.trigger('blur')
    expect((consentCheckbox.element as HTMLInputElement).checked).toBe(true)
  })
})

