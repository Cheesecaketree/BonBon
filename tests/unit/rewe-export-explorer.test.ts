import { readFileSync } from 'node:fs'
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { defaultExportRoute, exportHash, isExportHash, parseExportHash, resetExportRoute } from '../../src/features/reweExport/navigation'
import { exportShareSummary } from '../../src/domain/receipts/reweExport/shareSummary'
import { emptyReweExport } from '../../src/domain/receipts/reweExport/schema'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import ExportReweSummary from '../../src/features/reweExport/ExportReweSummary.vue'
import ExportShareDialog from '../../src/features/reweExport/ExportShareDialog.vue'
import { i18n } from '../../src/i18n'

function fixture() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'receipts-and-consents', 'profile-and-activity']) readExportHtml(readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8'), `${name}.html`, data)
  return data
}

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

  it('leads with price awareness and organic labels and links to details', async () => {
    const wrapper = mount(ExportReweSummary, { props: { data: fixture() }, global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('So ordnet REWE dich ein')
    expect(wrapper.findAll('.export-rewe-highlights [data-label]').map((card) => card.attributes('data-label'))).toEqual(['priceSensitivity', 'organic'])
    expect(wrapper.find('[data-label="priceSensitivity"]').text()).toContain('qualitätsbewusst')
    expect(wrapper.find('.export-rewe-labels [data-label="budget"]').text()).toMatch(/300,00\s€/)
    expect(wrapper.text()).not.toContain('Deine Einkäufe zeigen')
    await wrapper.findAll('.export-count').find((button) => button.text().includes('Interaktionsdatensätze'))!.trigger('click')
    expect(window.location.hash).toBe('#/rewe-export/rewe/activity')
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.text()).toContain('How REWE classifies you')
    expect(wrapper.find('[data-label="priceSensitivity"]').text()).toContain('Quality conscious')
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
