import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import MarketHelp from '../../src/features/markets/MarketHelp.vue'
import { getStoredLocalMarketMatches } from '../../src/domain/receipts/marketContributions'
import { getMarketData } from '../../src/domain/receipts/markets'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const unknownReceipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
}

const localMarket = {
  name: 'REWE Beispiel', street: 'Hauptstr.', houseNumber: '2', zip: '12345', city: 'Berlin',
  country: 'DE', lat: null, long: null,
}

describe('static market matching workflow', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'de'
  })

  it('shows only unresolved IDs and no raw receipt evidence UI', () => {
    const knownReceipt = { ...unknownReceipt, id: 'known', marketId: '11' }
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt, knownReceipt] }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Markt 9999')
    expect(wrapper.text()).not.toContain('Markt 11')
    expect(wrapper.text()).not.toContain('Kopfbereich')
    expect(wrapper.text()).not.toContain('persönliche Daten')
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(false)
  })

  it('saves a local match that immediately resolves the unknown ID', async () => {
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt] }, global: { plugins: [i18n] } })
    await wrapper.get('#market-name-9999').setValue(localMarket.name)
    await wrapper.get('#market-street-9999').setValue(localMarket.street)
    await wrapper.get('#market-house-9999').setValue(localMarket.houseNumber)
    await wrapper.get('#market-zip-9999').setValue(localMarket.zip)
    await wrapper.get('#market-city-9999').setValue(localMarket.city)
    await wrapper.get('button.button.primary').trigger('click')

    const stored = getStoredLocalMarketMatches()
    expect(stored['9999']).toEqual(localMarket)
    expect(getMarketData('9999', stored)).toEqual(localMarket)
    expect(localStorage.getItem('bonbon-market-contribution-drafts')).toBeNull()

    const mailto = decodeURIComponent(wrapper.get('a[href^="mailto:"]').attributes('href') || '')
    expect(mailto).toContain('"mapping"')
    expect(mailto).not.toContain('"evidence"')
    expect(mailto).not.toContain('headerExcerpts')
  })

  it('migrates a valid legacy draft into the local-match store', () => {
    localStorage.setItem('bonbon-market-contribution-drafts', JSON.stringify({ '9999': localMarket }))
    const wrapper = mount(MarketHelp, { props: { receipts: [unknownReceipt] }, global: { plugins: [i18n] } })
    expect((wrapper.get('#market-name-9999').element as HTMLInputElement).value).toBe(localMarket.name)
    expect(JSON.parse(localStorage.getItem('bonbon-local-market-matches') || '{}')['9999']).toEqual(localMarket)
    expect(localStorage.getItem('bonbon-market-contribution-drafts')).toBeNull()
  })

  it('does not offer bundled IDs for local matching or contribution', () => {
    localStorage.setItem('bonbon-local-market-matches', JSON.stringify({ '0011': localMarket }))
    const knownReceipt = { ...unknownReceipt, marketId: '0011' }
    const wrapper = mount(MarketHelp, { props: { receipts: [knownReceipt] }, global: { plugins: [i18n] } })
    expect(wrapper.find('.market-help-card').exists()).toBe(false)
    expect(wrapper.find('a[href^="mailto:"]').exists()).toBe(false)
  })
})
