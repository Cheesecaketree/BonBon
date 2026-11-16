import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultExportRoute, exportHash, isExportHash, parseExportHash, resetExportRoute } from '../../src/features/reweExport/navigation'
import { exportRealityChecks } from '../../src/domain/receipts/reweExport/realityCheck'
import { exportShareSummary } from '../../src/domain/receipts/reweExport/shareSummary'
import { emptyReweExport, type ExportPurchase } from '../../src/domain/receipts/reweExport/schema'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import ExportReweSummary from '../../src/features/reweExport/ExportReweSummary.vue'
import ExportShareDialog from '../../src/features/reweExport/ExportShareDialog.vue'
import { i18n } from '../../src/i18n'

const origin = { file: 'synthetic.html', table: 0, row: 0 }
function row(date: string, name: string, cents: number, market = 'REWE Beispielmarkt'): ExportPurchase {
  return { date, market, name, quantity: 1, quantityUnit: 'item', lineTotalCents: cents, kind: 'product', origin }
}
function fixture() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'receipts-and-consents', 'profile-and-activity']) readExportHtml(readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8'), `${name}.html`, data)
  return data
}
function fact(field: string, value: string) { return { field, value, section: 'Synthetic', origin } }

describe('export URL state', () => {
  it('round-trips views and filters and ignores invalid values', () => {
    const route = { ...defaultExportRoute(), view: 'products' as const, start: '2026-01-01', market: 'Markt & Co', q: 'ja! milch', sort: 'days' as const, product: '["MILCH","item"]' }
    const hash = exportHash(route)
    expect(hash.startsWith('#/rewe-export/shopping/products?')).toBe(true)
    expect(parseExportHash(hash)).toEqual(route)
    expect(exportHash(defaultExportRoute())).toBe('#/rewe-export/shopping')
    expect(exportHash({ ...defaultExportRoute(), view: 'summary' })).toBe('#/rewe-export/rewe')
    expect(parseExportHash('#/rewe-export/rewe/activity')?.view).toBe('activity')
    expect(parseExportHash('#/rewe-export/rewe/products')?.view).toBe('summary')
    expect(parseExportHash('#/rewe-export/unknown?start=2026-13-99&sort=evil')).toMatchObject({ view: 'insights', start: '', sort: 'spend' })
    expect(parseExportHash('#/about')).toBeNull()
    expect(isExportHash('#/rewe-export')).toBe(true)
    expect(isExportHash('#/rewe-exporter')).toBe(false)
  })
})

describe('REWE estimates versus purchases', () => {
  it('compares budget, market, frequency, organic and own-brand shares', () => {
    const data = emptyReweExport()
    data.purchases = ['01', '02', '03'].flatMap((month) => [
      row(`2026-${month}-03`, 'REWE BIO HAFERFLOCKEN', 300),
      row(`2026-${month}-10`, 'JA! MILCH 1L', 100),
      row(`2026-${month}-17`, 'KAFFEE', 600, 'REWE Anderer Markt'),
      row(`2026-${month}-28`, 'BIOGRAPHIE TASCHENBUCH', 0),
    ])
    data.purchases.push(row('2026-03-31', 'WASSER', 0))
    data.facts = [fact('FMCG_BUDGET', '300.0'), fact('SHARE_OF_WALLET', '0.5'), fact('STAMMMARKT', 'rewe  beispielmarkt'), fact('RFM_SEGMENT', 'High Frequency Customer'), fact('BioSegment', 'Bio-Fan'), fact('PREISBEWUSSTSEIN', 'preissensibel')]
    const checks = Object.fromEntries(exportRealityChecks(data).map((check) => [check.id, check]))
    expect(checks.budget).toMatchObject({ budgetCents: 30000, impliedCents: 15000, typicalCents: 1000, months: 3 })
    expect((checks.budget as { observedShare: number }).observedShare).toBeCloseTo(1000 / 30000)
    expect(checks.market).toMatchObject({ top: 'REWE Beispielmarkt', markets: 2, same: true })
    expect(checks.frequency).toMatchObject({ tripsPerMonth: 4, tripCents: 100 })
    expect(checks.organic).toMatchObject({ share: 0.3, products: 1, examples: ['REWE BIO HAFERFLOCKEN'] })
    expect(checks.price).toMatchObject({ share: 0.1, products: 1, examples: ['JA! MILCH 1L'] })
  })

  it('omits checks without a REWE value or purchase data', () => {
    const data = emptyReweExport()
    data.facts = [fact('FMCG_BUDGET', '300.0')]
    expect(exportRealityChecks(data)).toEqual([])
    data.purchases = [row('2026-01-05', 'A', 100)]
    data.facts = [fact('FMCG_BUDGET', 'unknown'), fact('STAMMMARKT', 'Elsewhere')]
    expect(exportRealityChecks(data)).toEqual([expect.objectContaining({ id: 'market', same: false })])
  })
})

describe('share summary', () => {
  it('collects non-identifying facts with short REWE labels only', () => {
    const data = fixture()
    const summary = exportShareSummary(data)!
    expect(summary.typicalCents).toBeGreaterThan(0)
    expect(summary.staples.length).toBeGreaterThan(0)
    expect(summary.labels.map((card) => card.id)).toContain('priceSensitivity')
    expect(summary.labels.every((card) => card.fact.value.length <= 40)).toBe(true)
    expect(JSON.stringify(summary)).not.toContain('Beispielmarkt')
    expect(exportShareSummary(emptyReweExport())).toBeNull()
  })
})

describe('REWE summary and share dialog', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
    resetExportRoute()
  })

  it('puts estimates next to purchase observations and links to details', async () => {
    const wrapper = mount(ExportReweSummary, { props: { data: fixture() }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('Was REWE über dich weiß')
    expect(wrapper.find('[data-check="budget"]').text()).toMatch(/300\s€ Alltagsbudget pro Monat/)
    expect(wrapper.find('[data-check="market"]').text()).toContain('REWE Beispielmarkt')
    expect(wrapper.text()).toContain('So ordnet REWE dich ein')
    await wrapper.findAll('.export-count').find((button) => button.text().includes('Interaktionsdatensätze'))!.trigger('click')
    expect(window.location.hash).toBe('#/rewe-export/rewe/activity')
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('What REWE knows about you')
    wrapper.unmount()
  })

  it('offers the summary image with privacy options and degrades without canvas', async () => {
    const wrapper = mount(ExportShareDialog, { props: { data: fixture() }, global: { plugins: [i18n] }, attachTo: document.body })
    await flushPromises()
    expect(wrapper.get('[role=dialog]').attributes('aria-modal')).toBe('true')
    expect(wrapper.findAll('input[type=checkbox]')).toHaveLength(2)
    expect(wrapper.text()).toContain('Marktnamen und einzelne Einkäufe sind nicht enthalten')
    expect(wrapper.text()).toContain('Dein Browser kann dieses Bild nicht erstellen.')
    expect(wrapper.get('.button.primary').attributes('disabled')).toBeDefined()
    await wrapper.get('[role=dialog]').trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })
})
