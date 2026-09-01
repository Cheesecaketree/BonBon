import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import Dashboard from '../../src/features/dashboard/Dashboard.vue'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
}

describe('dashboard local market provenance', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'de'
  })

  it('shows the local name and links its source indicator back to matching', async () => {
    localStorage.setItem('bonbon-local-market-matches', JSON.stringify({
      '9999': {
        name: 'REWE Beispiel', street: 'Hauptstr.', houseNumber: '2', zip: '12345', city: 'Berlin',
        country: 'DE', lat: null, long: null,
      },
    }))
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: [receipt], locale: 'de' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('REWE Beispiel, Hauptstr. 2, 12345 Berlin (#9999)')
    const indicator = wrapper.get('.local-match-indicator')
    expect(indicator.text()).toContain('Lokal')
    expect(indicator.attributes('title')).toContain('nur in diesem Browser gespeichert')
    await indicator.trigger('click')
    expect(wrapper.emitted('improveMarkets')).toHaveLength(1)
  })

  it('does not mark bundled matches as local even if a stale local value exists', () => {
    localStorage.setItem('bonbon-local-market-matches', JSON.stringify({
      '0011': {
        name: 'Wrong local value', street: 'Wrong', houseNumber: '1', zip: '12345', city: 'Wrong',
        country: 'DE', lat: null, long: null,
      },
    }))
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: [{ ...receipt, marketId: '0011' }], locale: 'de' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('REWE Philipp Menz OHG')
    expect(wrapper.text()).not.toContain('Wrong local value')
    expect(wrapper.find('.local-match-indicator').exists()).toBe(false)
  })
})
