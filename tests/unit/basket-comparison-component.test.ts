import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import BasketComparison from '../../src/features/dashboard/BasketComparison.vue'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const base: Receipt = { id: '1', source: 'rewe', filename: 'synthetic.pdf', localTimestamp: '2026-02-01T12:00:00', marketId: '0011', registerId: '1', receiptNumber: '1', totalCents: 200 }
const receipts: Receipt[] = [
  { ...base, items: [{ name: 'MILK', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 100 }] },
  { ...base, id: '2', localTimestamp: '2026-02-02T12:00:00', items: [{ name: 'MILK', kind: 'product', quantity: 2, quantityUnit: 'item', lineTotalCents: 300 }] },
  { ...base, id: '3', localTimestamp: '2026-02-03T12:00:00', items: [{ name: 'BREAD', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 200 }] },
]

describe('usual basket and receipt comparison', () => {
  beforeEach(() => { i18n.global.locale.value = 'en' })
  function render(values = receipts) {
    return mount(BasketComparison, { props: { receipts: values, locale: 'en', localMarketMatches: {} }, global: { plugins: [i18n] } })
  }

  it('shows the best matching groups without receipt selectors', async () => {
    const wrapper = render()
    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.findAll('.basket-group')).toHaveLength(1)
    expect(wrapper.get('.basket-group header').text()).toContain('100% overlap · 2 trips')
    expect(wrapper.findAll('.basket-group-prices dd').map((value) => value.text())).toEqual(['€1.50', '€1.88', '€2.25'])
    expect(wrapper.get('.basket-group-products').text()).toContain('MILK')
    expect(wrapper.get('.basket-group-products').text()).not.toContain('BREAD')
    await wrapper.get('.basket-group-receipts summary').trigger('click')
    await wrapper.get('.basket-group-receipts button').trigger('click')
    expect(wrapper.emitted('openReceipt')?.[0]?.[0]).toMatchObject({ id: '2' })
    await wrapper.get('.basket-group-products button').trigger('click')
    expect(wrapper.emitted('openProduct')).toEqual([['MILK']])
    expect(wrapper.get('.basket-frequency').text()).toContain('On 2 of 3 receipts')
  })

  it('recomputes matches after filtering and handles missing item details', async () => {
    const wrapper = render()
    await wrapper.setProps({ receipts: [receipts[0], receipts[2]] })
    expect(wrapper.find('.basket-group').exists()).toBe(false)
    expect(wrapper.text()).toContain('No sufficiently similar baskets')
    await wrapper.setProps({ receipts: [receipts[0], base] })
    expect(wrapper.text()).toContain('Import at least two receipts')
    expect(wrapper.text()).toContain('1 of 2 receipts')
    await wrapper.setProps({ receipts: [] })
    expect(wrapper.text()).toContain('0 of 0 receipts')
  })
})
