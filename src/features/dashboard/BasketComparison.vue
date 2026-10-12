<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { bestBasketMatches, receiptBaskets, usualBasket } from '../../domain/receipts/basketComparison'
import type { Receipt } from '../../domain/receipts/types'
import { getMarketShortName } from '../../domain/receipts/markets'
import type { LocalMarketMatches } from '../../domain/receipts/marketContributions'

const props = defineProps<{ receipts: Receipt[]; locale: 'de' | 'en'; localMarketMatches: LocalMarketMatches }>()
const emit = defineEmits<{ openReceipt: [receipt: Receipt]; openProduct: [name: string] }>()
const { t } = useI18n()
const baskets = computed(() => receiptBaskets(props.receipts))
const staples = computed(() => usualBasket(baskets.value))
const groups = computed(() => bestBasketMatches(baskets.value))
const visibleCount = ref(12)
const visibleGroups = computed(() => groups.value.slice(0, visibleCount.value))
watch(baskets, () => { visibleCount.value = 12 })
const formatLocale = computed(() => props.locale === 'de' ? 'de-DE' : 'en-GB')
const currency = computed(() => new Intl.NumberFormat(formatLocale.value, { style: 'currency', currency: 'EUR' }))
const decimal = computed(() => new Intl.NumberFormat(formatLocale.value, { maximumFractionDigits: 3 }))
const percentage = computed(() => new Intl.NumberFormat(formatLocale.value, { style: 'percent', maximumFractionDigits: 0 }))
function money(cents: number) { return currency.value.format(Math.round(cents) / 100) }
function receiptLabel(receipt: Receipt) {
  const [year, month, day] = receipt.localTimestamp.slice(0, 10).split('-').map(Number)
  const date = new Intl.DateTimeFormat(formatLocale.value, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
  const market = getMarketShortName(receipt.marketId, t('market'), props.localMarketMatches)
  return `${date} · ${receipt.localTimestamp.slice(11, 16)} · ${market} · #${receipt.receiptNumber} · ${money(receipt.totalCents)}`
}
</script>

<template>
  <article class="product-card basket-matching">
    <header class="product-heading"><div><h2>{{ t('basketComparison.matchesTitle') }}</h2><p>{{ t('basketComparison.matchesIntro') }}</p></div></header>
    <p class="basket-coverage">{{ t('basketComparison.coverage', { count: baskets.length, total: receipts.length }) }}</p>
    <p class="basket-coverage">{{ t('basketComparison.matchingCopy') }}</p>
    <p v-if="!groups.length" class="basket-empty">{{ t(baskets.length < 2 ? 'basketComparison.needReceipts' : 'basketComparison.noMatches') }}</p>
    <ol v-else class="basket-groups">
      <li v-for="(group, index) in visibleGroups" :key="group.id" class="basket-group">
        <header><h3>{{ t('basketComparison.groupTitle', { number: index + 1 }) }}</h3><strong>{{ t('basketComparison.match', { value: percentage.format(group.similarity), count: group.baskets.length }) }}</strong></header>
        <p class="basket-coverage">{{ t('basketComparison.commonProducts', { count: group.commonProducts.length }) }}</p>
        <ul class="basket-group-products">
          <li v-for="product in group.commonProducts" :key="product.key">
            <button type="button" @click="emit('openProduct', product.name)">{{ product.name }}</button>
            <span>{{ decimal.format(product.quantity) }} {{ t(`quantityUnits.${product.unit}`) }}</span>
          </li>
        </ul>
        <h4>{{ t('basketComparison.costTitle') }}</h4>
        <dl class="basket-group-prices">
          <div><dt>{{ t('basketComparison.minCost') }}</dt><dd>{{ money(group.minCostCents) }}</dd></div>
          <div><dt>{{ t('basketComparison.medianCost') }}</dt><dd>{{ money(group.medianCostCents) }}</dd></div>
          <div><dt>{{ t('basketComparison.maxCost') }}</dt><dd>{{ money(group.maxCostCents) }}</dd></div>
        </dl>
        <p class="basket-coverage">{{ t('basketComparison.costCopy') }}</p>
        <details class="basket-group-receipts">
          <summary>{{ t('basketComparison.receipts', { count: group.baskets.length }) }}</summary>
          <ul><li v-for="basket in group.baskets" :key="basket.receipt.id"><button type="button" @click="emit('openReceipt', basket.receipt)">{{ receiptLabel(basket.receipt) }} <span aria-hidden="true">›</span></button></li></ul>
        </details>
      </li>
    </ol>
    <button v-if="visibleCount < groups.length" class="load-more" type="button" @click="visibleCount += 12">{{ t('basketComparison.showMore') }}</button>
  </article>

  <article v-if="staples.length" class="product-card usual-basket">
    <header class="product-heading"><div><h2>{{ t('basketComparison.title') }}</h2><p>{{ t('basketComparison.intro') }}</p></div></header>
    <ul class="basket-staples">
      <li v-for="product in staples" :key="product.key">
        <button type="button" @click="emit('openProduct', product.name)">{{ product.name }} <span aria-hidden="true">›</span></button>
        <span class="basket-frequency">{{ t('basketComparison.frequency', { count: product.receiptCount, total: baskets.length }) }} · {{ percentage.format(product.share) }}</span>
        <div class="market-rank-track" aria-hidden="true"><div class="market-rank-fill" :style="{ width: `${product.share * 100}%` }" /></div>
        <dl><div><dt>{{ t('basketComparison.typicalQuantity') }}</dt><dd>{{ decimal.format(product.quantity) }} {{ t(`quantityUnits.${product.unit}`) }}</dd></div><div><dt>{{ t('basketComparison.typicalPrice') }}</dt><dd>{{ money(product.unitPriceCents) }} / {{ t(`quantityUnits.${product.unit}`) }}</dd></div></dl>
      </li>
    </ul>
  </article>
</template>
