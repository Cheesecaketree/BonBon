import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import ExportGuide from '../../src/features/reweExport/ExportGuide.vue'
import { i18n } from '../../src/i18n'
import { guideCheckedOn, guideSegments, reweExportGuide, rewePrivacyPage } from '../../src/i18n/reweExportGuide'

describe('guideSegments', () => {
  it('splits plain text and [[UI labels]]', () => {
    expect(guideSegments('Klicke auf [[Anmelden]] und dann [[Bestätigen]].')).toEqual([
      { label: false, text: 'Klicke auf ' },
      { label: true, text: 'Anmelden' },
      { label: false, text: ' und dann ' },
      { label: true, text: 'Bestätigen' },
      { label: false, text: '.' },
    ])
  })

  it('keeps unmatched brackets as plain text', () => {
    expect(guideSegments('[[Anmelden')).toEqual([{ label: false, text: '[[Anmelden' }])
    expect(guideSegments('')).toEqual([])
  })
})

describe('reweExportGuide content', () => {
  it('has the same structure in both locales', () => {
    const { de, en } = reweExportGuide
    expect(en.steps).toHaveLength(de.steps.length)
    expect(en.steps.map((step) => Boolean(step.note))).toEqual(de.steps.map((step) => Boolean(step.note)))
  })

  it('quotes the same German REWE labels in both locales', () => {
    const labels = (locale: 'de' | 'en') => {
      const content = reweExportGuide[locale]
      const texts = [content.confusionCopy, ...content.steps.flatMap((step) => [step.text, step.note ?? ''])]
      return texts.flatMap((text) => guideSegments(text).filter((segment) => segment.label).map((segment) => segment.text))
    }
    expect(labels('en')).toEqual(labels('de'))
  })

  it('records when the steps were last checked', () => {
    expect(guideCheckedOn).toMatch(/^\d{4}-(0[1-9]|1[0-2])$/)
  })
})

describe('ExportGuide', () => {
  beforeEach(() => {
    i18n.global.locale.value = 'de'
  })

  it('renders the request steps with highlighted REWE labels', () => {
    const wrapper = mount(ExportGuide, { global: { plugins: [i18n] } })
    expect(wrapper.find('h1').text()).toBe('So bekommst du deinen REWE-Datenexport')
    expect(wrapper.findAll('.export-guide-steps > li')).toHaveLength(5)
    const labels = wrapper.findAll('.export-guide-steps .ui-label').map((label) => label.text())
    expect(labels).toContain('Daten und Sicherheit')
    expect(labels).toContain('Datenübertragung anfragen')
    expect(wrapper.text()).toContain('Auskunft über deine Daten')
    expect(wrapper.text()).toContain('Zuletzt geprüft: November 2026')
    expect(wrapper.text()).not.toContain('[[')
  })

  it('links directly to the REWE privacy page in a new tab', () => {
    const wrapper = mount(ExportGuide, { global: { plugins: [i18n] } })
    const link = wrapper.find('[data-rewe-privacy-link]')
    expect(link.attributes('href')).toBe(rewePrivacyPage)
    expect(rewePrivacyPage).toBe('https://www.rewe.de/shop/mydata/privacy')
    expect(link.attributes('target')).toBe('_blank')
    expect(link.attributes('rel')).toContain('noopener')
  })

  it('switches to English and keeps the German UI labels', async () => {
    const wrapper = mount(ExportGuide, { global: { plugins: [i18n] } })
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(wrapper.find('h1').text()).toBe('How to get your REWE data export')
    expect(wrapper.text()).toContain('Last checked: November 2026')
    expect(wrapper.findAll('.ui-label').map((label) => label.text())).toContain('Datenübertragung anfragen')
  })

  it('emits import from the back link and the import button', async () => {
    const wrapper = mount(ExportGuide, { global: { plugins: [i18n] } })
    await wrapper.find('.back-link').trigger('click')
    await wrapper.find('.export-guide-steps button').trigger('click')
    expect(wrapper.emitted('import')).toHaveLength(2)
  })
})
