import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import MarketHelp from '../../src/features/markets/MarketHelp.vue'
import { getMarketData } from '../../src/domain/receipts/markets'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const unknownReceipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
  marketHeaderExcerpt: 'REWE Example, Guessstr. 9, 99999 Guessing',
}

describe('static market contribution workflow', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'de'
  })

  it('shows only unresolved markets and labels extracted text as unreviewed', () => {
    const knownReceipt = { ...unknownReceipt, id: 'known', marketId: '11' }
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt, knownReceipt] }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Markt 9999')
    expect(wrapper.text()).not.toContain('Markt 11')
    expect(wrapper.text()).toContain('Ungeprüfter Hinweis')
    expect(wrapper.text()).toContain('persönliche Daten')
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(false)
  })

  it('saves a validated contribution draft without overriding market resolution', async () => {
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt] }, global: { plugins: [i18n] } })
    await wrapper.get('#market-name-9999').setValue('REWE Beispiel')
    await wrapper.get('#market-street-9999').setValue('Hauptstr.')
    await wrapper.get('#market-house-9999').setValue('2')
    await wrapper.get('#market-zip-9999').setValue('12345')
    await wrapper.get('#market-city-9999').setValue('Berlin')
    await wrapper.get('button.button.primary').trigger('click')

    const stored = JSON.parse(localStorage.getItem('bonbon-market-contribution-drafts') || '{}')
    expect(stored['9999']).toMatchObject({ name: 'REWE Beispiel', zip: '12345', city: 'Berlin' })
    expect(localStorage.getItem('bonbon-market-overrides')).toBeNull()
    expect(getMarketData('9999')).toBeUndefined()

    const mailto = decodeURIComponent(wrapper.get('a[href^="mailto:"]').attributes('href') || '')
    expect(mailto).toContain('"schemaVersion": 1')
    expect(mailto).toContain('"mapping"')
    expect(mailto).toContain('"evidence": null')
  })

  it('includes header evidence only after explicit personal-data review opt-in', async () => {
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt] }, global: { plugins: [i18n] } })
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(false)

    await wrapper.get('#include-raw-9999').setValue(true)
    const mailto = decodeURIComponent(wrapper.get('a[href^="mailto:"]').attributes('href') || '')
    expect(mailto).toContain('"headerExcerpts"')
    expect(mailto).toContain(unknownReceipt.marketHeaderExcerpt)
    expect(mailto).toContain('"personalDataReviewed": true')
    expect(localStorage.getItem('bonbon-market-contribution-drafts')).toBeNull()
  })

  it('preserves conflicting receipt-header observations as separate evidence', async () => {
    const second = { ...unknownReceipt, id: 'second', marketHeaderExcerpt: 'Different header for the same market' }
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt, second] }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain(unknownReceipt.marketHeaderExcerpt)
    expect(wrapper.text()).toContain(second.marketHeaderExcerpt)
    await wrapper.get('#include-raw-9999').setValue(true)
    const mailto = decodeURIComponent(wrapper.get('a[href^="mailto:"]').attributes('href') || '')
    expect(mailto).toContain(unknownReceipt.marketHeaderExcerpt)
    expect(mailto).toContain(second.marketHeaderExcerpt)
  })
})
