import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ExportDashboard from '../../src/features/reweExport/ExportDashboard.vue'
import ChartCard from '../../src/features/dashboard/ChartCard.vue'
import { emptyReweExport } from '../../src/domain/receipts/reweExport/schema'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import { i18n } from '../../src/i18n'

function render() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'receipts-and-consents', 'profile-and-activity']) readExportHtml(readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8'), `${name}.html`, data)
  return mount(ExportDashboard, { props: { data }, global: { plugins: [i18n], stubs: { ChartCard: true } } })
}

describe('account export dashboard', () => {
  beforeEach(() => { i18n.global.locale.value = 'de' })

  it('labels day aggregates and keeps receipt metadata in the data without displaying it', async () => {
    const wrapper = render()
    expect(wrapper.findAll('[role="tab"]').map((tab) => tab.text())).toEqual(['Einkäufe', 'Produkte', 'Bonus', 'REWEs Bild von dir', 'Datenspuren'])
    expect(wrapper.find('.primary-stats').text()).toContain('Artikelbeträge6,55')
    expect(wrapper.find('.primary-stats').text()).toContain('Einkaufstage3')
    const receiptIndex = JSON.stringify(wrapper.props('data').receiptIndex)
    expect(wrapper.props('data').receiptIndex.length).toBeGreaterThan(0)
    expect(wrapper.text()).not.toContain('eBon-Metadaten')
    expect(wrapper.text()).not.toContain('Tag mit mehreren Bons')
    await wrapper.findAll('input[type=date]')[0]!.setValue('2026-01-01')
    await wrapper.findAll('input[type=date]')[1]!.setValue('2026-12-31')
    expect(wrapper.find('.primary-stats').text()).toContain('5,06')
    await wrapper.findAll('input[type=date]')[0]!.setValue('2026-09-24')
    await wrapper.findAll('input[type=date]')[1]!.setValue('2026-09-24')
    expect(wrapper.findAll('.export-day')).toHaveLength(1)
    expect(JSON.stringify(wrapper.props('data').receiptIndex)).toBe(receiptIndex)
    wrapper.unmount()
  })

  it('explores unit-aware product prices while preserving individual row history', async () => {
    const wrapper = render()
    await wrapper.findAll('[role=tab]')[1]!.trigger('click')
    await wrapper.get('input[type=search]').setValue('BOLOGNESE')
    expect(wrapper.findAll('#export-panel-products > .export-table-scroll tbody tr')).toHaveLength(1)
    await wrapper.get('.export-table button').trigger('click')
    expect(wrapper.findAll('.export-product-history chart-card-stub')).toHaveLength(2)
    const priceSeries = wrapper.findAllComponents(ChartCard)[0]!.props('option')!.series as { type: string; data: { value: number[] }[] }[]
    expect(priceSeries.map((series) => series.type)).toEqual(['scatter'])
    expect(priceSeries[0]!.data.map((point) => point.value[1])).toEqual([1.49, 1.59, 1.79])
    expect(wrapper.get('.export-product-rows').attributes('open')).toBeUndefined()
    await wrapper.get('.export-product-rows summary').trigger('click')
    expect(wrapper.findAll('.export-product-history tbody tr')).toHaveLength(3)
    expect(wrapper.get('.export-product-history').text()).toContain('1,49')
    expect(wrapper.findAll('#export-panel-products > .export-table-scroll th').map((th) => th.text())).toContain('Min. – Max. je Einheit')
    expect(wrapper.get('#export-panel-products > .export-table-scroll').text()).toContain('1,49 € – 1,79 €')
    expect(wrapper.findAll('.export-product-history tbody tr')[1]!.text()).toContain('1,59 €')
    expect(wrapper.findAll('.export-product-history tbody tr')[1]!.text()).toContain('3,18 €')
    wrapper.unmount()
  })

  it('explains bonus reconciliation and model estimates', async () => {
    const wrapper = render()
    await wrapper.findAll('[role=tab]')[2]!.trigger('click')
    expect(wrapper.text()).toContain('0,30')
    expect(wrapper.text()).toContain('Ein Anfangsguthaben')
    await wrapper.findAll('[role=tab]')[3]!.trigger('click')
    expect(wrapper.text()).toContain('42,5')
    expect(wrapper.text()).toContain('Diese Angaben stammen aus deinem REWE-Datenexport')
    expect(wrapper.findAll('.export-profile-card p')).toHaveLength(0)
    expect(wrapper.text()).toContain('Personalisierung auf REWE-Kanälen')
    expect(wrapper.text()).toContain('2026/W03')
    wrapper.unmount()
  })

  it('keeps analytics streams distinct and supports keyboard navigation', async () => {
    const wrapper = render()
    await wrapper.findAll('[role=tab]')[0]!.trigger('keydown', { key: 'End' })
    expect(wrapper.get('#export-tab-activity').attributes('aria-selected')).toBe('true')
    expect(wrapper.text()).toContain('Pixel 6')
    expect(wrapper.text()).toContain('IP-Adressen')
    expect(wrapper.text()).toContain('weder eindeutige Aktionen noch Besuche')
    await wrapper.get('.export-filters select').setValue('appEvents')
    expect(wrapper.find('.export-record summary').text()).toContain('add_coupon')
    wrapper.unmount()
  })

  it('renders imported text safely and switches interface language', async () => {
    const wrapper = render()
    const data = wrapper.props('data')
    data.purchases[0]!.name = '<img src=x onerror=alert(1)>'
    await wrapper.setProps({ data: { ...data } })
    await wrapper.findAll('[role=tab]')[1]!.trigger('click')
    expect(wrapper.text()).toContain('<img src=x onerror=alert(1)>')
    expect(wrapper.find('img').exists()).toBe(false)
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Your recurring products')
    wrapper.unmount()
  })
})
