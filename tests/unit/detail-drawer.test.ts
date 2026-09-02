import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'
import DetailDrawer from '../../src/features/dashboard/DetailDrawer.vue'
import { i18n } from '../../src/i18n'
import type { Receipt } from '../../src/domain/receipts/types'

const receipt: Receipt = {
  id: 'receipt-1', source: 'rewe', filename: 'receipt.pdf', localTimestamp: '2026-08-31T12:00:00',
  marketId: '0011', registerId: '1', receiptNumber: '10', totalCents: 475,
  items: [
    { name: 'PASTA', kind: 'product', quantity: 2, quantityUnit: 'item', unitPriceCents: 200, lineTotalCents: 400, vatClass: 'B' },
    { name: 'PFAND', kind: 'deposit', quantity: 3, quantityUnit: 'item', unitPriceCents: 25, lineTotalCents: 75, vatClass: 'A' },
  ],
  loyalty: { earnedCents: 5, spentCents: 20, balanceCents: 80 },
  vatBreakdown: [{ vatClass: 'B', ratePercent: 7, netCents: 444, taxCents: 31, grossCents: 475 }],
}

describe('receipt detail drawer', () => {
  afterEach(() => document.body.replaceChildren())

  it('shows an itemized receipt with quantities, unit prices, VAT, and Bonus', () => {
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'receipt', receipt }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    expect(wrapper.text()).toContain('4,75 €')
    expect(wrapper.text()).toContain('PASTA')
    expect(wrapper.text()).toContain('2 Stk.')
    expect(wrapper.text()).toContain('2,00 €/Stk.')
    expect(wrapper.text()).toContain('Bonus gesammelt')
    expect(wrapper.text()).toContain('7 % MwSt.')
    wrapper.unmount()
  })

  it('navigates from a day to a receipt and back without leaving the drawer', async () => {
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'day', day: { date: '2026-08-31', totalCents: 475, trips: 1, averageCents: 475, receipts: [receipt] } }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
    })
    await wrapper.get('.drawer-receipts button').trigger('click')
    expect(wrapper.text()).toContain('Bondetails')
    expect(wrapper.text()).toContain('PASTA')
    await wrapper.get('.drawer-back').trigger('click')
    expect(wrapper.text()).toContain('Einkäufe an diesem Tag')
  })

  it('shows signed net deposit per receipt and keeps it primary in receipt details', async () => {
    const returnedReceipt: Receipt = {
      ...receipt,
      id: 'receipt-return',
      totalCents: 350,
      items: [
        { name: 'PFAND', kind: 'deposit', quantity: 2, quantityUnit: 'item', lineTotalCents: 50 },
        { name: 'LEERGUT', kind: 'depositReturn', quantity: 4, quantityUnit: 'item', lineTotalCents: -100 },
      ],
    }
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'financial', metric: 'depositNet', receipts: [receipt, returnedReceipt] }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
    })
    expect(wrapper.findAll('.drawer-context-value strong').map((value) => value.text())).toEqual(['+0,75 €', '−0,50 €'])
    expect(wrapper.findAll('.drawer-context-value small').map((value) => value.text())).toEqual(['Mehr Pfand bezahlt', 'Mehr Pfand zurückbekommen'])
    expect(wrapper.get('.drawer-receipt-columns').text()).toContain('Saldo (+ bezahlt · − zurück)')
    await wrapper.findAll('.drawer-receipts button')[1].trigger('click')
    expect(wrapper.get('.day-total').text()).toContain('−0,50 €')
    expect(wrapper.get('.day-total').text()).toContain('Mehr Pfand zurückbekommen')
    expect(wrapper.get('.eyebrow').text()).toBe('Pfand-Saldo')
    expect(wrapper.get('.context-basket-total').text()).toContain('3,50 €')
    expect(wrapper.findAll('.receipt-items li.contextual')).toHaveLength(2)
  })

  it('groups repeated product lines into one receipt contribution', () => {
    const repeated: Receipt = { ...receipt, items: [...receipt.items!, { name: 'PASTA', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 150 }] }
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'product', product: { name: 'PASTA', spendCents: 550, occurrences: 2, quantities: { item: 3 }, items: [{ receipt: repeated, item: repeated.items![0] }, { receipt: repeated, item: repeated.items![2] }] } }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
    })
    expect(wrapper.findAll('.drawer-receipts li')).toHaveLength(1)
    expect(wrapper.get('.drawer-context-value strong').text()).toBe('5,50 €')
    expect(wrapper.get('.drawer-receipt-columns').text()).toContain('Ausgaben für dieses Produkt')
    expect(wrapper.get('.quantity-facts').text()).toContain('Käufe')
    expect(wrapper.get('.quantity-facts').text()).toContain('2')
    expect(wrapper.get('.quantity-facts').text()).toContain('Durchschnittspreis')
    expect(wrapper.get('.quantity-facts').text()).toContain('1,83 € / Stk.')
  })

  it('does not render an empty facts grid when a receipt has no extra facts', () => {
    const plainReceipt: Receipt = {
      ...receipt,
      items: [{ name: 'BREAD', kind: 'product', quantity: 1, quantityUnit: 'item', lineTotalCents: 475 }],
      loyalty: undefined,
      payback: undefined,
      vatBreakdown: undefined,
    }
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'receipt', receipt: plainReceipt }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
    })
    expect(wrapper.find('.receipt-facts').exists()).toBe(false)
  })

  it('labels VAT receipt values with the selected rate', () => {
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'financial', metric: 'vat', vatRatePercent: 7, receipts: [receipt] }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
    })
    expect(wrapper.get('.drawer-receipt-columns').text()).toContain('7 % MwSt.')
    expect(wrapper.get('.drawer-context-value strong').text()).toBe('0,31 €')
  })

  it('closes with Escape', async () => {
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'receipt', receipt }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(wrapper.emitted('close')).toHaveLength(1)
    wrapper.unmount()
  })

  it('manages focus when drilling into a receipt and navigating back', async () => {
    const wrapper = mount(DetailDrawer, {
      props: { target: { kind: 'day', day: { date: '2026-08-31', totalCents: 475, trips: 1, averageCents: 475, receipts: [receipt] } }, locale: 'de', allYears: false, localMarketMatches: {} },
      global: { plugins: [i18n] },
      attachTo: document.body,
    })
    const receiptButton = wrapper.get('.drawer-receipts button')
    await receiptButton.trigger('click')
    expect(document.activeElement).toBe(wrapper.get('.drawer-back').element)
    await wrapper.get('.drawer-back').trigger('click')
    expect(document.activeElement).toBe(wrapper.get('.drawer-receipts button').element)
    wrapper.unmount()
  })
})
