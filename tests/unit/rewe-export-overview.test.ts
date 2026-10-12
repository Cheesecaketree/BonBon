import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import { exportOverview } from '../../src/domain/receipts/reweExport/overview'
import { emptyReweExport, type ExportPurchase } from '../../src/domain/receipts/reweExport/schema'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import ExportOverview from '../../src/features/reweExport/ExportOverview.vue'
import { i18n } from '../../src/i18n'

const origin = { file: 'synthetic.html', table: 0, row: 0 }
const row: ExportPurchase = { date: '2026-01-01', market: 'Market A', name: 'PASTA', quantity: 1, quantityUnit: 'item', lineTotalCents: 200, kind: 'product', origin }

function fixture() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'receipts-and-consents', 'profile-and-activity']) readExportHtml(readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8'), `${name}.html`, data)
  return data
}

describe('export profile overview', () => {
  it('ranks regular products by distinct days without comparing quantities or counting deposits', () => {
    const data = emptyReweExport()
    data.purchases = [row, { ...row, date: '2026-01-02' }, { ...row, name: 'BULK', quantity: 80, quantityUnit: 'kg', lineTotalCents: 9000 }, { ...row, name: 'DEPOSIT', kind: 'deposit', quantity: 1000 }, { ...row, name: 'REFUND', kind: 'depositReturn', lineTotalCents: -25 }]
    const original = JSON.stringify(data)
    const overview = exportOverview(data)
    expect(overview.regular).toMatchObject({ name: 'PASTA', days: 2, quantity: 2 })
    expect(overview.summary).toMatchObject({ totalCents: 9575, days: 2, products: 2, markets: 1 })
    expect(JSON.stringify(data)).toBe(original)
    data.purchases.push({ ...row, name: 'TEA', lineTotalCents: 500 }, { ...row, name: 'TEA', date: '2026-01-02', lineTotalCents: 500 })
    expect(exportOverview(data).regular?.name).toBe('TEA')
    data.purchases.push({ ...row, name: 'APPLE', lineTotalCents: 500 }, { ...row, name: 'APPLE', date: '2026-01-02', lineTotalCents: 500 })
    expect(exportOverview(data).regular?.name).toBe('APPLE')
  })

  it('uses assigned markets before a deterministic shopping-day fallback', () => {
    const data = emptyReweExport()
    data.purchases = [row, { ...row, date: '2026-01-02' }, { ...row, market: 'Market B', lineTotalCents: 9999 }]
    expect(exportOverview(data).market).toEqual({ name: 'Market A', assigned: false })
    data.facts.push({ field: 'STAMMMARKT', value: 'Assigned market', section: 'Synthetic', origin })
    expect(exportOverview(data).market).toEqual({ name: 'Assigned market', assigned: true })
    data.facts = []
    data.purchases = [row, { ...row, market: 'Market B', lineTotalCents: 300 }]
    expect(exportOverview(data).market?.name).toBe('Market B')
    data.purchases[1]!.lineTotalCents = 200
    expect(exportOverview(data).market?.name).toBe('Market A')
  })

  it('omits absent sources, preserves observed zeros and exposes separate Bonus coverage', () => {
    const data = emptyReweExport()
    expect(exportOverview(data)).toMatchObject({ summary: null, regular: null, market: null, bonus: null, interactionRecords: null, classifications: [] })
    data.purchases = [{ ...row, lineTotalCents: 0 }]
    data.bonusTransactions = [{ date: '2026-02-01', channel: 'Example', type: 'DEBIT', cents: -50, origin }]
    expect(exportOverview(data)).toMatchObject({ summary: { totalCents: 0 }, bonus: { cents: 0, firstDate: '2026-02-01', lastDate: '2026-02-01' } })
    data.activities = (['app', 'appEvents', 'web'] as const).map((source) => ({ source, recordId: '1', timestamp: '2026-01-01', fields: {}, origin }))
    expect(exportOverview(data).interactionRecords).toBe(3)
  })

  it('renders a translated, noninteractive poster while preserving unfamiliar classifications', async () => {
    const data = fixture()
    data.facts.find((fact) => fact.field === 'PREISBEWUSSTSEIN')!.value = 'Unfamiliar category'
    i18n.global.locale.value = 'en'
    const wrapper = mount(ExportOverview, { props: { data }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('My REWE profile')
    expect(wrapper.text()).toContain('€6.55')
    expect(wrapper.text()).toContain('Quality conscious')
    expect(wrapper.text()).toContain('Unfamiliar category')
    expect(wrapper.text()).toContain('4 stored interaction records')
    expect(wrapper.findAll('button, input, select, details')).toHaveLength(0)
    i18n.global.locale.value = 'de'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('Mein REWE-Profil')
    expect(wrapper.text()).toContain('qualitaetsbewusst')
    wrapper.unmount()
  })
})
