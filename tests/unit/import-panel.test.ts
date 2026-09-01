import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import ImportPanel from '../../src/features/import/ImportPanel.vue'
import { i18n } from '../../src/i18n'

describe('ImportPanel', () => {
  it('renders the German-first private import state', () => {
    i18n.global.locale.value = 'de'
    const wrapper = mount(ImportPanel, { global: { plugins: [i18n] } })
    expect(wrapper.text()).toContain('REWE eBons hier ablegen')
    expect(wrapper.text()).toContain('Verarbeitung geschieht vollständig in diesem Browser-Tab')
  })
})
