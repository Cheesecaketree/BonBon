import { shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import Dashboard from '../../src/features/dashboard/Dashboard.vue'
import ChartCard from '../../src/features/dashboard/ChartCard.vue'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
}

const analyticsReceipts: Receipt[] = [
  { ...receipt, id: '2025-a', localTimestamp: '2025-02-01T10:00:00', marketId: '0011', totalCents: 1200 },
  { ...receipt, id: '2026-a', localTimestamp: '2026-02-01T10:00:00', marketId: '0011', totalCents: 1800 },
  { ...receipt, id: '2026-b', localTimestamp: '2026-02-08T16:00:00', marketId: '9999', totalCents: 4200 },
]

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

  it('curates analytics into three switchable views', async () => {
    const wrapper = shallowMount(Dashboard, { props: { receipts: analyticsReceipts, locale: 'de' }, global: { plugins: [i18n] } })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Überblick', 'Ausgaben', 'Gewohnheiten'])
    expect(wrapper.find('#dashboard-panel-overview').exists()).toBe(true)
    expect(wrapper.get('.insight-strip').attributes('aria-label')).toBe('Auffälligkeiten')
    await tabs[1].trigger('click')
    expect(wrapper.find('#dashboard-panel-spending').exists()).toBe(true)
    expect(wrapper.findAllComponents(ChartCard).map((card) => card.props('title'))).toEqual(['Ausgabentempo', 'Monatliche Ausgaben', 'Marktvergleich'])
    expect(wrapper.text()).not.toContain('Datum und Tageszeit')
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    expect(wrapper.find('#dashboard-panel-habits').exists()).toBe(true)
    expect(wrapper.findAllComponents(ChartCard).map((card) => card.props('title'))).toEqual(['Wochenverlauf', 'Abstände zwischen Einkäufen', 'Tageszeitprofil', 'Wann du einkaufst'])
  })

  it('supports arrow-key tab navigation and metric toggles', async () => {
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: analyticsReceipts, locale: 'de' },
      global: { plugins: [i18n], stubs: { ChartCard: { template: '<article><slot name="actions" /></article>' } } },
    })
    await wrapper.find('[role="tab"][aria-selected="true"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Ausgaben')
    const toggles = wrapper.findAll('.metric-toggle button')
    expect(toggles.map((button) => button.attributes('aria-pressed'))).toEqual(['true', 'false', 'false'])
    await toggles[1].trigger('click')
    expect(wrapper.findAll('.metric-toggle button').map((button) => button.attributes('aria-pressed'))).toEqual(['false', 'true', 'false'])
  })

  it('applies the year filter across the active view', async () => {
    const wrapper = shallowMount(Dashboard, { props: { receipts: analyticsReceipts, locale: 'de' }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('60,00 €')
    await wrapper.get('select').setValue('2025')
    expect(wrapper.text()).toContain('12,00 €')
    expect(wrapper.text()).not.toContain('60,00 €')
  })

  it('opens the notable basket in the receipt day panel', async () => {
    const wrapper = shallowMount(Dashboard, { props: { receipts: analyticsReceipts, locale: 'de' }, global: { plugins: [i18n] }, attachTo: document.body })
    await wrapper.get('.insight-strip button:last-child').trigger('click')
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
    expect(wrapper.find('[role="dialog"]').text()).toContain('42,00 €')
    wrapper.unmount()
  })

  it('labels every chart axis and updates metric-dependent labels', async () => {
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: analyticsReceipts, locale: 'de' },
      global: { plugins: [i18n], stubs: { ChartCard: { props: ['option', 'title'], template: '<article><slot name="actions" /></article>' } } },
    })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    let options = wrapper.findAllComponents(ChartCard).map((card) => card.props('option') as any)
    expect(options.map((option) => [option.xAxis.name, option.yAxis.name])).toEqual([
      ['Kalendertag', 'Kumulierte Ausgaben (€)'],
      ['Monat', 'Ausgaben (€)'],
      ['Ausgaben (€)', 'Markt'],
    ])
    await wrapper.findAll('.metric-toggle button')[2].trigger('click')
    options = wrapper.findAllComponents(ChartCard).map((card) => card.props('option') as any)
    expect(options[2].xAxis.name).toBe('Median-Einkaufswert (€)')

    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    options = wrapper.findAllComponents(ChartCard).map((card) => card.props('option') as any)
    expect(options.map((option) => [option.xAxis.name, option.yAxis.name])).toEqual([
      ['Woche', 'Einkäufe'],
      ['Abstand', 'Anzahl'],
      ['Uhrzeit', 'Einkäufe'],
      ['Uhrzeit', 'Wochentag'],
    ])
  })
})
