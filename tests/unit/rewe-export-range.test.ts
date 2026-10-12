import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ExportDateRange from '../../src/features/reweExport/ExportDateRange.vue'
import { exportDatePreset, inExportRange, normalizeExportRange } from '../../src/domain/receipts/reweExport/dateRange'
import { exportBonus, exportCoverage, exportPurchases } from '../../src/domain/receipts/reweExport/analytics'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import { i18n } from '../../src/i18n'

function data() {
  const result = readExportHtml(readFileSync('tests/fixtures/rewe-export/purchases.html', 'utf8'), 'purchases.html')
  return readExportHtml(readFileSync('tests/fixtures/rewe-export/receipts-and-consents.html', 'utf8'), 'receipts.html', result)
}

describe('export date ranges', () => {
  beforeEach(() => { i18n.global.locale.value = 'en' })

  it('uses inclusive boundaries and supports open-ended and reversed inputs', () => {
    expect(normalizeExportRange('2026-10-02', '2026-09-24')).toEqual({ start: '2026-09-24', end: '2026-10-02' })
    expect(inExportRange('2026-09-24', { start: '2026-09-24', end: '2026-10-02' })).toBe(true)
    expect(inExportRange('2026-10-02', { start: '2026-09-24', end: '2026-10-02' })).toBe(true)
    expect(inExportRange('2026-10-03', { start: '2026-09-24', end: '2026-10-02' })).toBe(false)
    expect(inExportRange('2026-10-03', { start: '', end: '2026-10-02' })).toBe(false)
  })

  it('calculates month and year presets across January and leap-year boundaries', () => {
    expect(exportDatePreset('lastMonth', '2026-01-12')).toEqual({ start: '2025-12-01', end: '2025-12-31' })
    expect(exportDatePreset('lastMonth', '2024-03-01')).toEqual({ start: '2024-02-01', end: '2024-02-29' })
    expect(exportDatePreset('thisMonth', '2026-10-12')).toEqual({ start: '2026-10-01', end: '2026-10-12' })
    expect(exportDatePreset('thisYear', '2026-10-12')).toEqual({ start: '2026-01-01', end: '2026-10-12' })
    expect(exportDatePreset('lastYear', '2026-10-12')).toEqual({ start: '2025-01-01', end: '2025-12-31' })
    expect(exportDatePreset('last90Days', '2026-10-12')).toEqual({ start: '2026-07-15', end: '2026-10-12' })
  })

  it('filters item and receipt tables separately and does not reconcile a partial bonus ledger', () => {
    const snapshot = data()
    const range = { start: '2026-10-01', end: '2026-10-03' }
    expect(exportPurchases(snapshot, 'all', '', range)).toHaveLength(1)
    expect(exportCoverage(snapshot, range)).toMatchObject({ receiptCount: 1, cancelledCount: 0, missingPurchaseDays: ['2026-10-03'] })
    expect(exportBonus(snapshot, 'all', range)).toMatchObject({ earnedCents: 0, spentCents: 50, differenceCents: null, balance: { cents: 80 } })
    expect(snapshot.purchases).toHaveLength(6)
  })

  it('distinguishes purchase days from metadata-only days and supports selecting an inclusive range', async () => {
    const wrapper = mount(ExportDateRange, { props: { modelValue: { start: '', end: '' }, dataDates: ['2026-09-24', '2026-10-02'], metadataDates: ['2026-10-03'] }, global: { plugins: [i18n] } })
    expect(wrapper.get('[data-date="2026-09-24"]').classes()).toContain('has-purchases')
    expect(wrapper.get('[data-date="2026-10-03"]').classes()).toContain('has-metadata')
    expect(wrapper.get('[data-date="2026-09-25"]').attributes('aria-label')).toContain('No data')
    expect(wrapper.get('[data-date="2026-09-25"]').find('i').exists()).toBe(false)
    expect(wrapper.get('[data-date="2026-09-24"]').find('i').exists()).toBe(true)
    await wrapper.get('[data-date="2026-10-02"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ start: '2026-10-02', end: '2026-10-02' })
    await wrapper.get('[data-date="2026-09-24"]').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)?.[0]).toEqual({ start: '2026-09-24', end: '2026-10-02' })
    wrapper.unmount()
  })
})
