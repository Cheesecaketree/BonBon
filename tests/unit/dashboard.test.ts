import { mount, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import Dashboard from '../../src/features/dashboard/Dashboard.vue'
import ChartCard from '../../src/features/dashboard/ChartCard.vue'
import DetailDrawer from '../../src/features/dashboard/DetailDrawer.vue'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'unknown', source: 'rewe', filename: 'unknown.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '9999', registerId: '1', receiptNumber: '1', totalCents: 1000,
}

const analyticsReceipts: Receipt[] = [
  { ...receipt, id: '2025-a', localTimestamp: '2025-02-01T10:00:00', marketId: '0011', totalCents: 1200, items: [{ name: 'PASTA', kind: 'product', quantity: 2, quantityUnit: 'item', lineTotalCents: 500 }], loyalty: { earnedCents: 12, balanceCents: 50 } },
  { ...receipt, id: '2026-a', localTimestamp: '2026-02-01T10:00:00', marketId: '0011', totalCents: 1800, items: [{ name: 'PASTA', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 300 }, { name: 'PFAND', kind: 'deposit', quantity: 1, quantityUnit: 'item', lineTotalCents: 25 }], loyalty: { earnedCents: 18, spentCents: 20, balanceCents: 48 }, vatBreakdown: [{ vatClass: 'B', ratePercent: 7, netCents: 1682, taxCents: 118, grossCents: 1800 }] },
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

  it('curates analytics into four switchable views', async () => {
    const wrapper = shallowMount(Dashboard, { props: { receipts: analyticsReceipts, locale: 'de' }, global: { plugins: [i18n] } })
    const tabs = wrapper.findAll('[role="tab"]')
    expect(tabs.map((tab) => tab.text())).toEqual(['Überblick', 'Geld', 'Produkte', 'Gewohnheiten'])
    expect(wrapper.find('#dashboard-panel-overview').exists()).toBe(true)
    expect(wrapper.get('.insight-strip').attributes('aria-label')).toBe('Auffälligkeiten')
    await tabs[1].trigger('click')
    expect(wrapper.find('#dashboard-panel-money').exists()).toBe(true)
    expect(wrapper.findAllComponents(ChartCard).map((card) => card.props('title'))).toEqual(['Ausgabentempo', 'Monatliche Ausgaben', 'Marktvergleich', 'REWE Bonus im Verlauf', 'Pfand und Rabatte', 'Mehrwertsteuer'])
    expect(wrapper.text()).not.toContain('Datum und Tageszeit')
    await wrapper.findAll('[role="tab"]')[2].trigger('click')
    expect(wrapper.find('#dashboard-panel-products').exists()).toBe(true)
    expect(wrapper.findAll('.product-table th').map((th) => th.text())).toEqual(['Produkt', 'Menge', 'Ø-Preis', 'Ausgaben'])
    expect(wrapper.findAll('.product-controls select option').map((opt) => opt.text())).toEqual(['Nach Ausgaben', 'Nach Menge', 'Nach Ø-Preis', 'Nach Name'])
    expect(wrapper.text()).toContain('PASTA')
    expect(wrapper.text()).toContain('Ø-Preis')
    expect(wrapper.text()).toContain('3,00 € / Stk.')
    await wrapper.findAll('[role="tab"]')[3].trigger('click')
    expect(wrapper.find('#dashboard-panel-habits').exists()).toBe(true)
    expect(wrapper.findAllComponents(ChartCard).map((card) => card.props('title'))).toEqual(['Wochenverlauf', 'Abstände zwischen Einkäufen', 'Tageszeitprofil', 'Besuche nach Markt', 'Wann du einkaufst'])
  })

  it('supports arrow-key tab navigation and metric toggles', async () => {
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: analyticsReceipts, locale: 'de' },
      global: { plugins: [i18n], stubs: { ChartCard: { template: '<article><slot name="actions" /></article>' } } },
    })
    await wrapper.find('[role="tab"][aria-selected="true"]').trigger('keydown', { key: 'ArrowRight' })
    expect(wrapper.find('[role="tab"][aria-selected="true"]').text()).toBe('Geld')
    const toggles = wrapper.findAll('.metric-toggle button')
    expect(toggles.map((button) => button.attributes('aria-pressed'))).toEqual(['true', 'false'])
    await toggles[1].trigger('click')
    expect(wrapper.findAll('.metric-toggle button').map((button) => button.attributes('aria-pressed'))).toEqual(['false', 'true'])
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
    expect(wrapper.findComponent(DetailDrawer).exists()).toBe(true)
    expect(wrapper.findComponent(DetailDrawer).props('target')).toMatchObject({ kind: 'receipt', receipt: { totalCents: 4200 } })
    wrapper.unmount()
  })

  it('passes the selected money metric and latest snapshot receipt to the drawer', async () => {
    const wrapper = shallowMount(Dashboard, { props: { receipts: analyticsReceipts, locale: 'de' }, global: { plugins: [i18n] } })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const cards = wrapper.findAll('.money-stats button')
    await cards[2].trigger('click')
    expect(wrapper.findComponent(DetailDrawer).props('target')).toMatchObject({ kind: 'financial', metric: 'depositNet' })
    await cards[1].trigger('click')
    expect(wrapper.findComponent(DetailDrawer).props('target')).toMatchObject({ kind: 'financial', metric: 'bonusBalance', receipts: [{ id: '2026-a' }] })
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
      ['Monat', 'Wert (€)'],
      ['Monat', 'Wert (€)'],
      ['Steuersatz', 'Wert (€)'],
    ])
    await wrapper.findAll('.metric-toggle button')[1].trigger('click')
    options = wrapper.findAllComponents(ChartCard).map((card) => card.props('option') as any)
    expect(options[2].xAxis.name).toBe('Median-Einkaufswert (€)')

    await wrapper.findAll('[role="tab"]')[3].trigger('click')
    options = wrapper.findAllComponents(ChartCard).map((card) => card.props('option') as any)
    expect(options.map((option) => [option.xAxis.name, option.yAxis.name])).toEqual([
      ['Woche', 'Einkäufe'],
      ['Abstand', 'Anzahl'],
      ['Uhrzeit', 'Einkäufe'],
      ['Einkäufe', 'Markt'],
      ['Uhrzeit', 'Wochentag'],
    ])
  })

  it('supports horizontal scrolling and hint on ChartCard when scrollable', () => {
    const wrapper = mount(ChartCard, {
      props: {
        title: 'Weekly rhythm',
        scrollable: true,
        scrollMinWidth: '600px',
        scrollHint: 'Swipe sideways to see full timeline',
      },
      global: { stubs: { VChart: true } },
    })
    expect(wrapper.find('.chart-scroll-wrap').exists()).toBe(true)
    expect(wrapper.find('.chart-scroll-hint').text()).toContain('Swipe sideways to see full timeline')
    expect(wrapper.find('.chart-scroll-canvas').attributes('style')).toContain('min-width: 600px;')
  })

  it('applies scroll focus ratio to position the horizontal scroll viewport', async () => {
    const wrapper = mount(ChartCard, {
      props: {
        title: 'When you shop',
        scrollable: true,
        scrollMinWidth: '600px',
        scrollFocusRatio: 0.625,
      },
      global: { stubs: { VChart: true } },
    })
    const viewport = wrapper.find<HTMLElement>('.chart-scroll-viewport')
    Object.defineProperty(viewport.element, 'scrollWidth', { value: 600, configurable: true })
    Object.defineProperty(viewport.element, 'clientWidth', { value: 320, configurable: true })
    await wrapper.setProps({ scrollFocusRatio: 0.5 })
    expect(viewport.element.scrollLeft).toBe(140)
  })

  it('renders a fixed sticky Y rail when stickyY is configured on ChartCard', () => {
    const wrapper = mount(ChartCard, {
      props: {
        title: 'When you shop',
        scrollable: true,
        scrollMinWidth: '600px',
        stickyY: {
          labels: ['Sun', 'Sat', 'Fri', 'Thu', 'Wed', 'Tue', 'Mon'],
          top: '16px',
          bottom: '82px',
          width: '34px',
          align: 'center',
        },
      },
      global: { stubs: { VChart: true } },
    })
    const rail = wrapper.find('.chart-sticky-y-rail')
    expect(rail.exists()).toBe(true)
    expect(rail.classes()).toContain('align-center')
    expect(rail.attributes('style')).toContain('width: 34px;')
    const labels = wrapper.findAll('.chart-sticky-y-label')
    expect(labels).toHaveLength(7)
    expect(labels[0].text()).toBe('Sun')
    expect(labels[6].text()).toBe('Mon')
  })

  it('displays detailed market names and addresses in the market comparison breakdown', async () => {
    const wrapper = shallowMount(Dashboard, {
      props: { receipts: analyticsReceipts, locale: 'de' },
      global: {
        plugins: [i18n],
        stubs: {
          ChartCard: {
            props: ['option', 'title'],
            template: '<article><slot name="actions" /><slot /></article>',
          },
        },
      },
    })
    await wrapper.findAll('[role="tab"]')[1].trigger('click')
    const marketList = wrapper.find('.market-rank-list')
    expect(marketList.exists()).toBe(true)
    expect(marketList.text()).toContain('REWE Philipp Menz OHG')
    expect(marketList.text()).toContain('Grindelallee 40-44, Hamburg · #0011')
    expect(marketList.text()).toContain('18,00 €')
    expect(marketList.text()).toContain('Markt 9999')
  })
})
