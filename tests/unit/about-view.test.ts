import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import AboutView from '../../src/features/about/AboutView.vue'
import AppFooter from '../../src/features/common/AppFooter.vue'
import { i18n } from '../../src/i18n'

describe('AboutView', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'de'
  })

  it('renders the about tab with AI involvement notice, 0BSD license, and GitHub link', () => {
    const wrapper = mount(AboutView, {
      props: { initialTab: 'about', hasReceipts: true },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('Dein Einkauf, lokal & transparent')
    expect(wrapper.text()).toContain('Mit KI-Unterstützung entwickelt')
    expect(wrapper.text()).toContain('0BSD-Lizenz (Zero-Clause BSD)')
    expect(wrapper.text()).toContain('Open Source auf GitHub')

    const githubLink = wrapper.find('.github-button')
    expect(githubLink.exists()).toBe(true)
    expect(githubLink.attributes('href')).toBe('https://github.com/Cheesecaketree/BonBon')
    expect(githubLink.attributes('target')).toBe('_blank')
    expect(githubLink.attributes('rel')).toContain('noopener')
  })

  it('renders English translations when locale is set to en', () => {
    i18n.global.locale.value = 'en'
    const wrapper = mount(AboutView, {
      props: { initialTab: 'about' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('Your shopping, local & transparent')
    expect(wrapper.text()).toContain('Developed with AI assistance')
    expect(wrapper.text()).toContain('0BSD License (Zero-Clause BSD)')
    expect(wrapper.text()).toContain('Open Source on GitHub')
  })

  it('renders the privacy tab with Cloudflare Pages, Web Analytics, and Tunnel details', async () => {
    const wrapper = mount(AboutView, {
      props: { initialTab: 'privacy' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('Datenschutzhinweise')
    expect(wrapper.text()).toContain('Cloudflare Pages')
    expect(wrapper.text()).toContain('Cloudflare Web Analytics')
    expect(wrapper.text()).toContain('Cloudflare Tunnel')
    expect(wrapper.text()).toContain('Lokale Speicherung')
  })

  it('switches tabs between about and privacy upon button clicks', async () => {
    const wrapper = mount(AboutView, {
      props: { initialTab: 'about' },
      global: { plugins: [i18n] },
    })

    expect(wrapper.find('#panel-about').exists()).toBe(true)
    expect(wrapper.find('#panel-privacy').exists()).toBe(false)

    await wrapper.find('#tab-btn-privacy').trigger('click')
    expect(wrapper.find('#panel-privacy').exists()).toBe(true)
    expect(wrapper.find('#panel-about').exists()).toBe(false)

    await wrapper.find('#tab-btn-about').trigger('click')
    expect(wrapper.find('#panel-about').exists()).toBe(true)
  })

  it('emits navigate when clicking the back button', async () => {
    const wrapper = mount(AboutView, {
      props: { initialTab: 'about', hasReceipts: true },
      global: { plugins: [i18n] },
    })

    await wrapper.find('.back-link').trigger('click')
    expect(wrapper.emitted('navigate')).toHaveLength(1)
    expect(wrapper.emitted('navigate')?.[0]).toEqual(['dashboard'])
  })
})

describe('AppFooter', () => {
  beforeEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'de'
  })

  it('renders 0BSD license and GitHub link', () => {
    const wrapper = mount(AppFooter, {
      global: { plugins: [i18n] },
    })

    expect(wrapper.text()).toContain('0BSD-Lizenz')
    expect(wrapper.text()).toContain('100 % lokal')

    const githubLink = wrapper.find('.footer-github-link')
    expect(githubLink.exists()).toBe(true)
    expect(githubLink.attributes('href')).toBe('https://github.com/Cheesecaketree/BonBon')
  })

  it('emits navigate events when clicking footer links', async () => {
    const wrapper = mount(AppFooter, {
      global: { plugins: [i18n] },
    })

    const links = wrapper.findAll('.footer-links a')
    // Link 0: about
    await links[0].trigger('click')
    expect(wrapper.emitted('navigate')).toContainEqual(['about', 'about'])

    // Link 1: privacy
    await links[1].trigger('click')
    expect(wrapper.emitted('navigate')).toContainEqual(['about', 'privacy'])

    // Link 2: market-help
    await links[2].trigger('click')
    expect(wrapper.emitted('navigate')).toContainEqual(['market-help'])
  })
})
