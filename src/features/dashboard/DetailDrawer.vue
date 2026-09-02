<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DayAggregate, Receipt, ReceiptItem } from '../../domain/receipts/types'
import { productAveragePrices, type ProductAggregate } from '../../domain/receipts/basketAnalytics'
import { getMarketShortName } from '../../domain/receipts/markets'
import type { LocalMarketMatches } from '../../domain/receipts/marketContributions'

export type FinancialMetric = 'bonusEarned' | 'bonusSpent' | 'bonusBalance' | 'depositNet' | 'depositCharged' | 'depositReturned' | 'discount' | 'vat' | 'paybackEarned' | 'paybackPointsBefore' | 'paybackEquivalent'
export type DrawerTarget =
  | { kind: 'day'; day: DayAggregate }
  | { kind: 'receipt'; receipt: Receipt }
  | { kind: 'product'; product: ProductAggregate }
  | { kind: 'financial'; metric: FinancialMetric; receipts: Receipt[]; vatRatePercent?: number }

const props = defineProps<{
  target: DrawerTarget
  locale: 'de' | 'en'
  allYears: boolean
  localMarketMatches: LocalMarketMatches
}>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const drawer = ref<HTMLElement>()
const closeButton = ref<HTMLButtonElement>()
const backButton = ref<HTMLButtonElement>()
const activeReceipt = ref<Receipt>()
const lastFocusedReceiptId = ref<string>()

const currency = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }))
const decimal = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }))
const integer = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 0 }))
function money(cents: number) { return currency.value.format(cents / 100) }
function formatDate(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function formatMonthDay(value: string) {
  const [year, month, day] = value.slice(0, 10).split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function market(receipt: Receipt) { return getMarketShortName(receipt.marketId, t('market'), props.localMarketMatches) }
function quantity(item: ReceiptItem) { return `${decimal.value.format(item.quantity)} ${t(`quantityUnits.${item.quantityUnit}`)}` }

const receipts = computed(() => {
  if (props.target.kind === 'day') return props.target.day.receipts
  if (props.target.kind === 'product') return [...new Map(props.target.product.items.map((entry) => [entry.receipt.id, entry.receipt])).values()]
  if (props.target.kind === 'financial') return props.target.receipts
  return [props.target.receipt]
})
const title = computed(() => {
  if (props.target.kind === 'receipt' || (activeReceipt.value && props.target.kind === 'day')) return t('receiptDetails')
  if (props.target.kind === 'day') return t('dayDetails')
  if (props.target.kind === 'product') return props.target.product.name
  if (props.target.metric === 'vat' && props.target.vatRatePercent === undefined) return t('vatPaid')
  return t(`financialMetrics.${props.target.metric}`, props.target.metric === 'vat' ? { rate: props.target.vatRatePercent } : {})
})
const subtitle = computed(() => {
  if (activeReceipt.value) return `${formatDate(activeReceipt.value.localTimestamp)} · ${market(activeReceipt.value)}`
  if (props.target.kind === 'receipt') return `${formatDate(props.target.receipt.localTimestamp)} · ${market(props.target.receipt)}`
  if (props.target.kind === 'day') return props.allYears ? formatMonthDay(props.target.day.date) : formatDate(props.target.day.date)
  if (props.target.kind === 'product') return t('productOccurrenceCount', { count: props.target.product.occurrences })
  return t('contributingReceipts', { count: receipts.value.length })
})
const shownReceipt = computed(() => activeReceipt.value ?? (props.target.kind === 'receipt' ? props.target.receipt : undefined))
type ContextValue = { value: number; unit: 'money' | 'points' }
function productValue(receipt: Receipt): ContextValue {
  if (props.target.kind !== 'product') return { value: 0, unit: 'money' }
  const productName = props.target.product.name
  return { value: (receipt.items ?? []).filter((item) => item.kind === 'product' && item.name === productName).reduce((sum, item) => sum + item.lineTotalCents, 0), unit: 'money' }
}
function financialValue(receipt: Receipt): ContextValue {
  if (props.target.kind !== 'financial') return { value: receipt.totalCents, unit: 'money' }
  const items = receipt.items ?? []
  const charged = items.filter((item) => item.kind === 'deposit').reduce((sum, item) => sum + item.lineTotalCents, 0)
  const returned = items.filter((item) => item.kind === 'depositReturn').reduce((sum, item) => sum + Math.abs(item.lineTotalCents), 0)
  const values: Record<FinancialMetric, ContextValue> = {
    bonusEarned: { value: receipt.loyalty?.earnedCents ?? 0, unit: 'money' },
    bonusSpent: { value: receipt.loyalty?.spentCents ?? 0, unit: 'money' },
    bonusBalance: { value: receipt.loyalty?.balanceCents ?? 0, unit: 'money' },
    depositNet: { value: charged - returned, unit: 'money' },
    depositCharged: { value: charged, unit: 'money' },
    depositReturned: { value: returned, unit: 'money' },
    discount: { value: items.filter((item) => item.kind === 'discount').reduce((sum, item) => sum + Math.abs(item.lineTotalCents), 0), unit: 'money' },
    vat: { value: (receipt.vatBreakdown ?? []).filter((row) => props.target.kind === 'financial' && (props.target.vatRatePercent === undefined || row.ratePercent === props.target.vatRatePercent)).reduce((sum, row) => sum + row.taxCents, 0), unit: 'money' },
    paybackEarned: { value: receipt.payback?.pointsEarned ?? 0, unit: 'points' },
    paybackPointsBefore: { value: receipt.payback?.pointsBefore ?? 0, unit: 'points' },
    paybackEquivalent: { value: receipt.payback?.balanceEquivalentCents ?? 0, unit: 'money' },
  }
  return values[props.target.metric]
}
function contextValue(receipt: Receipt): ContextValue {
  if (props.target.kind === 'product') return productValue(receipt)
  if (props.target.kind === 'financial') return financialValue(receipt)
  return { value: receipt.totalCents, unit: 'money' }
}
function displayValue(receipt: Receipt) {
  const result = contextValue(receipt)
  if (result.unit === 'points') return decimal.value.format(result.value)
  if (props.target.kind === 'financial' && props.target.metric === 'depositNet' && result.value > 0) return `+${money(result.value)}`
  if (props.target.kind === 'financial' && props.target.metric === 'depositNet' && result.value < 0) return `−${money(Math.abs(result.value))}`
  return money(result.value)
}
function valueQualifier(receipt: Receipt) {
  if (props.target.kind !== 'financial' || props.target.metric !== 'depositNet') return undefined
  const value = contextValue(receipt).value
  return t(value > 0 ? 'depositNetPaid' : value < 0 ? 'depositNetReturned' : 'depositNetBalanced')
}
const contextLabel = computed(() => {
  if (props.target.kind === 'product') return t('productSpend')
  if (props.target.kind === 'financial' && props.target.metric === 'depositNet' && shownReceipt.value) return valueQualifier(shownReceipt.value)
  if (props.target.kind === 'financial') return title.value
  return t('basketValue')
})
const listValueLabel = computed(() => props.target.kind === 'financial' && props.target.metric === 'depositNet' ? t('depositNetColumn') : contextLabel.value)
function itemMatchesContext(item: ReceiptItem) {
  if (props.target.kind === 'product') return item.kind === 'product' && item.name === props.target.product.name
  if (props.target.kind !== 'financial') return false
  if (props.target.metric === 'depositNet') return item.kind === 'deposit' || item.kind === 'depositReturn'
  if (props.target.metric === 'depositCharged') return item.kind === 'deposit'
  if (props.target.metric === 'depositReturned') return item.kind === 'depositReturn'
  if (props.target.metric === 'discount') return item.kind === 'discount'
  return false
}
const receiptAdjustments = computed(() => {
  const result = { depositChargedCents: 0, depositReturnedCents: 0, discountCents: 0 }
  for (const item of shownReceipt.value?.items ?? []) {
    if (item.kind === 'deposit') result.depositChargedCents += item.lineTotalCents
    if (item.kind === 'depositReturn') result.depositReturnedCents += Math.abs(item.lineTotalCents)
    if (item.kind === 'discount') result.discountCents += Math.abs(item.lineTotalCents)
  }
  return result
})
const hasReceiptFacts = computed(() => {
  if (!shownReceipt.value) return false
  const r = shownReceipt.value
  const adj = receiptAdjustments.value
  return Boolean(
    r.loyalty?.earnedCents !== undefined
    || r.loyalty?.spentCents !== undefined
    || r.loyalty?.balanceCents !== undefined
    || adj.depositChargedCents
    || adj.depositReturnedCents
    || adj.discountCents
    || r.payback?.pointsEarned !== undefined
    || r.payback?.pointsBefore !== undefined
    || r.payback?.balanceEquivalentCents !== undefined
    || r.vatBreakdown?.length,
  )
})

watch(() => props.target, async () => {
  lastFocusedReceiptId.value = undefined
  activeReceipt.value = undefined
  await nextTick()
  closeButton.value?.focus()
}, { immediate: true })

async function openReceipt(receipt: Receipt) {
  lastFocusedReceiptId.value = receipt.id
  activeReceipt.value = receipt
  await nextTick()
  if (backButton.value) {
    backButton.value.focus()
  } else {
    closeButton.value?.focus()
  }
}

async function back() {
  const targetId = lastFocusedReceiptId.value
  activeReceipt.value = undefined
  await nextTick()
  if (targetId && drawer.value) {
    const button = drawer.value.querySelector<HTMLButtonElement>(`[data-receipt-id="${targetId}"]`)
    if (button) {
      button.focus()
      return
    }
  }
  closeButton.value?.focus()
}

function handleKeys(event: KeyboardEvent) {
  if (event.defaultPrevented) return
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  if (event.key !== 'Tab' || !drawer.value) return
  const focusable = [...drawer.value.querySelectorAll<HTMLElement>('button,[href],[tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  if (!drawer.value.contains(document.activeElement)) {
    event.preventDefault()
    focusable[0].focus()
    return
  }
  if (event.shiftKey && document.activeElement === focusable[0]) {
    event.preventDefault()
    focusable.at(-1)?.focus()
  } else if (!event.shiftKey && document.activeElement === focusable.at(-1)) {
    event.preventDefault()
    focusable[0].focus()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeys)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeys)
})
</script>

<template>
  <div class="day-backdrop detail-backdrop" @click.self="emit('close')">
    <aside ref="drawer" class="day-panel detail-drawer" role="dialog" aria-modal="true" :aria-label="title" @keydown="handleKeys">
      <button ref="closeButton" class="close-button" type="button" :aria-label="t('close')" @click="emit('close')">×</button>
      <button v-if="activeReceipt" ref="backButton" class="drawer-back" type="button" @click="back">← {{ t('back') }}</button>
      <p class="eyebrow">{{ title }}</p>
      <h2>{{ subtitle }}</h2>

      <template v-if="shownReceipt">
        <div class="day-total"><strong>{{ displayValue(shownReceipt) }}</strong><span>{{ contextLabel }}</span></div>
        <p v-if="target.kind==='product'||target.kind==='financial'" class="context-basket-total">{{ t('basketValue') }}: <strong>{{ money(shownReceipt.totalCents) }}</strong></p>
        <dl v-if="hasReceiptFacts" class="receipt-facts">
          <div v-if="shownReceipt.loyalty?.earnedCents !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='bonusEarned' }"><dt>{{ t('bonusEarned') }}</dt><dd>{{ money(shownReceipt.loyalty.earnedCents) }}</dd></div>
          <div v-if="shownReceipt.loyalty?.spentCents !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='bonusSpent' }"><dt>{{ t('bonusRedeemed') }}</dt><dd>{{ money(shownReceipt.loyalty.spentCents) }}</dd></div>
          <div v-if="shownReceipt.loyalty?.balanceCents !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='bonusBalance' }"><dt>{{ t('latestBonusBalance') }}</dt><dd>{{ money(shownReceipt.loyalty.balanceCents) }}</dd></div>
          <div v-if="receiptAdjustments.depositChargedCents" :class="{ contextual: target.kind==='financial'&&['depositNet','depositCharged'].includes(target.metric) }"><dt>{{ t('depositCharged') }}</dt><dd>{{ money(receiptAdjustments.depositChargedCents) }}</dd></div>
          <div v-if="receiptAdjustments.depositReturnedCents" :class="{ contextual: target.kind==='financial'&&['depositNet','depositReturned'].includes(target.metric) }"><dt>{{ t('depositReturned') }}</dt><dd>{{ money(receiptAdjustments.depositReturnedCents) }}</dd></div>
          <div v-if="receiptAdjustments.discountCents" :class="{ contextual: target.kind==='financial'&&target.metric==='discount' }"><dt>{{ t('discounts') }}</dt><dd>{{ money(receiptAdjustments.discountCents) }}</dd></div>
          <div v-if="shownReceipt.payback?.pointsEarned !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='paybackEarned' }"><dt>{{ t('pointsEarned') }}</dt><dd>{{ decimal.format(shownReceipt.payback.pointsEarned) }}</dd></div>
          <div v-if="shownReceipt.payback?.pointsBefore !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='paybackPointsBefore' }"><dt>{{ t('latestPoints') }}</dt><dd>{{ decimal.format(shownReceipt.payback.pointsBefore) }}</dd></div>
          <div v-if="shownReceipt.payback?.balanceEquivalentCents !== undefined" :class="{ contextual: target.kind==='financial'&&target.metric==='paybackEquivalent' }"><dt>{{ t('latestEquivalent') }}</dt><dd>{{ money(shownReceipt.payback.balanceEquivalentCents) }}</dd></div>
          <div v-for="row in shownReceipt.vatBreakdown" :key="row.vatClass" :class="{ contextual: target.kind==='financial'&&target.metric==='vat'&&(target.vatRatePercent===undefined||target.vatRatePercent===row.ratePercent) }"><dt>{{ t('vatRate', { rate: row.ratePercent }) }}</dt><dd>{{ money(row.taxCents) }}</dd></div>
        </dl>
        <p v-if="!shownReceipt.items" class="coverage-note">{{ t('receiptItemsUnavailable') }}</p>
        <ol v-else class="receipt-items">
          <li v-for="(item, index) in shownReceipt.items" :key="`${item.name}-${index}`" :class="{ contextual: itemMatchesContext(item) }">
            <div><strong>{{ item.name }}</strong><small>{{ quantity(item) }}<template v-if="item.unitPriceCents !== undefined"> · {{ money(item.unitPriceCents) }}/{{ t(`quantityUnits.${item.quantityUnit}`) }}</template><template v-if="item.vatClass"> · {{ t('vatClass', { value: item.vatClass }) }}</template></small></div>
            <span :class="{ negative: item.lineTotalCents < 0 }">{{ money(item.lineTotalCents) }}</span>
          </li>
        </ol>
      </template>

      <template v-else-if="target.kind === 'product'">
        <div class="day-total"><strong>{{ money(target.product.spendCents) }}</strong><span>{{ t('productSpend') }}</span></div>
        <dl class="receipt-facts quantity-facts">
          <div><dt>{{ t('purchases') }}</dt><dd>{{ integer.format(target.product.occurrences) }}</dd></div>
          <div v-for="(value, unit) in target.product.quantities" :key="unit"><dt>{{ t('quantity') }}</dt><dd>{{ decimal.format(value ?? 0) }} {{ t(`quantityUnits.${unit}`) }}</dd></div>
          <div v-for="avg in productAveragePrices(target.product)" :key="`avg-${avg.unit}`"><dt>{{ t('averagePrice') }}</dt><dd>{{ money(avg.averagePriceCents) }} / {{ t(`quantityUnits.${avg.unit}`) }}</dd></div>
        </dl>
      </template>

      <div v-if="!shownReceipt" class="drawer-receipt-columns" aria-hidden="true"><span>{{ t('receipt') }}</span><strong>{{ listValueLabel }}</strong><span></span></div>
      <ul v-if="!shownReceipt" class="drawer-receipts">
        <li v-for="(receipt, index) in receipts" :key="`${receipt.id}-${index}`">
          <button :data-receipt-id="receipt.id" type="button" @click="openReceipt(receipt)"><span><time>{{ formatDate(receipt.localTimestamp) }}</time><small>{{ market(receipt) }} · {{ t('receipt') }} {{ receipt.receiptNumber }}<template v-if="target.kind==='product'||target.kind==='financial'"> · {{ t('basketValue') }} {{ money(receipt.totalCents) }}</template></small></span><span class="drawer-context-value" :class="{ returned: target.kind==='financial'&&target.metric==='depositNet'&&contextValue(receipt).value<0 }"><strong>{{ displayValue(receipt) }}</strong><small v-if="valueQualifier(receipt)">{{ valueQualifier(receipt) }}</small></span><span aria-hidden="true">›</span></button>
        </li>
      </ul>
    </aside>
  </div>
</template>
