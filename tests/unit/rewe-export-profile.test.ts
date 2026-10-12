import { readFileSync } from 'node:fs'
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ExportDashboard from '../../src/features/reweExport/ExportDashboard.vue'
import { exportProfileCards, profileValueFormat, profileValueToken } from '../../src/domain/receipts/reweExport/profile'
import { emptyReweExport } from '../../src/domain/receipts/reweExport/schema'
import { readExportHtml } from '../../src/services/reweExport/importHtml'
import { i18n } from '../../src/i18n'

function data() {
  const data = emptyReweExport()
  for (const name of ['purchases', 'profile-and-activity', 'receipts-and-consents']) readExportHtml(readFileSync(`tests/fixtures/rewe-export/${name}.html`, 'utf8'), `${name}.html`, data)
  const origin = { file: 'profile.html', table: 10, row: 1 }
  data.facts.push({ field: 'price affinity score', value: '0.5108932543643466', section: 'OC Preis Segementierung', origin })
  data.facts.push({ field: 'app coupon discount', value: '16.439999999999998', section: 'Coupons per Kunde', origin })
  data.facts.push({ field: 'OM_AppvisitWeekCount90d', value: '7', section: 'Synthetic usage', origin })
  return data
}

describe('export profile presentation', () => {
  it('curates useful facts with calculation context without mutating original values', () => {
    const snapshot = data()
    const original = JSON.stringify(snapshot)
    const cards = exportProfileCards(snapshot)
    expect(cards.find((card) => card.id === 'pricePreference')?.context[0]?.value).toBe('2026/W03')
    expect(cards.find((card) => card.id === 'age')?.fact.value).toBe('35 bis 49 Jahre')
    expect(cards.some((card) => card.fact.field === 'price affinity score')).toBe(false)
    expect(profileValueToken(cards.find((card) => card.id === 'household')!.fact)).toBe('multiplePeople')
    const fact = cards.find((card) => card.id === 'household')!.fact
    expect(profileValueToken({ ...fact, value: 'Neue Haushaltsklasse' })).toBeUndefined()
    expect(profileValueToken({ ...fact, field: 'Unknown score', value: 'Sehr hoch' })).toBeUndefined()
    expect(profileValueToken({ ...fact, field: 'RFM_SEGMENT', value: 'High Frequency Customer with high purchase amounts' })).toBeUndefined()
    expect(profileValueFormat('price affinity score')).toBe('number')
    expect(profileValueFormat('market zip code')).toBe('text')
    expect(JSON.stringify(snapshot)).toBe(original)
  })

  it('translates literal known values, keeps labels close to the source and omits card explanations', async () => {
    i18n.global.locale.value = 'en'
    const snapshot = data()
    const wrapper = mount(ExportDashboard, { props: { data: snapshot }, global: { plugins: [i18n], stubs: { ChartCard: true } } })
    await wrapper.get('#export-tab-profile').trigger('click')
    const cards = wrapper.get('.export-profile-section').text()
    expect(cards).toContain('Quality conscious')
    expect(wrapper.findAll('.export-profile-section').map((section) => section.text()).join(' ')).toContain('35–49 years')
    expect(wrapper.findAll('.export-profile-section').map((section) => section.text()).join(' ')).toContain('Multiple-person household')
    expect(wrapper.get('#export-panel-profile').text()).toContain('Estimated life stage')
    expect(wrapper.get('#export-panel-profile').text()).toContain('Estimated REWE share of total purchases')
    expect(wrapper.get('#export-panel-profile').text()).toContain('Weeks with app use in the last 90 days')
    expect(wrapper.findAll('.export-profile-card p')).toHaveLength(0)
    expect(wrapper.findAll('.export-profile-section').map((section) => section.text()).join(' ')).not.toContain('qualitätsbewusst')
    expect(wrapper.get('.export-more-profile').text()).toContain('0.51')
    expect(wrapper.get('.export-more-profile').text()).toContain('€16.44')
    expect(wrapper.get('.export-more-profile').attributes('open')).toBeUndefined()
    expect(wrapper.get('.export-original-profile').attributes('open')).toBeUndefined()
    expect(wrapper.get('.export-original-profile').text()).toContain('0.5108932543643466')
    expect(wrapper.get('.export-consents').text()).toContain('Earlier marketing consent (V2) · Email')
    expect(wrapper.get('.export-interests').text()).toContain('product name is missing')
    expect(wrapper.get('.export-interests').text()).not.toContain('No product name')
    expect(wrapper.findAll('.export-interests th')).toHaveLength(2)
    expect(snapshot.facts.find((fact) => fact.field === 'price affinity score')?.value).toBe('0.5108932543643466')
    wrapper.unmount()
  })

  it('preserves original German category values and unfamiliar English categories', async () => {
    const snapshot = data()
    snapshot.facts.find((fact) => fact.field === 'PREISBEWUSSTSEIN')!.value = 'Neue Preisbewusstseinsklasse'
    i18n.global.locale.value = 'de'
    const wrapper = mount(ExportDashboard, { props: { data: snapshot }, global: { plugins: [i18n], stubs: { ChartCard: true } } })
    await wrapper.get('#export-tab-profile').trigger('click')
    expect(wrapper.get('#export-panel-profile').text()).toContain('qualitaetsbewusst')
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.get('.export-profile-section').text()).toContain('Neue Preisbewusstseinsklasse')
    wrapper.unmount()
  })
})
