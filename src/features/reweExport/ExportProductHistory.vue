<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EChartsOption } from 'echarts'
import ChartCard from '../dashboard/ChartCard.vue'
import type { ExportProduct } from '../../domain/receipts/reweExport/analytics'
import { exportProductTimeline } from '../../domain/receipts/reweExport/productTimeline'

const props = defineProps<{ product: ExportProduct; start?: string; end?: string }>()
const emit = defineEmits<{ close: [] }>()
const { t, locale } = useI18n()
const metric = ref<'quantity' | 'days' | 'spend'>('quantity')
const timeline = computed(() => exportProductTimeline(props.product, props.start, props.end))
const currency = computed(() => new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }))
const numeric = computed(() => new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }))
const unit = computed(() => t(`reweExport.unit.${props.product.unit}`))
function money(cents: number) { return currency.value.format(cents / 100) }
function timestamp(date: string) { return Date.parse(`${date}T00:00:00Z`) }
function date(value: string | number) {
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(typeof value === 'number' ? value : timestamp(value)))
}
function rowPrice(quantity: number, cents: number) { return quantity > 0 && props.product.unit !== 'unknown' ? money(Math.round(cents / quantity)) : '—' }
const priceOption = computed<EChartsOption>(() => ({
  animation: false, useUTC: true, aria: { enabled: true }, color: ['#9b2848'],
  grid: { left: 62, right: 22, top: 46, bottom: 68 },
  legend: { top: 0, textStyle: { fontSize: 10 } },
  tooltip: {
    trigger: 'item', renderMode: 'richText', confine: true,
    formatter: (input: unknown) => {
      const point = input as { seriesName: string; data: { value: number[]; market?: string } }
      return `${date(point.data.value[0]!)}\n${point.seriesName}: ${money(Math.round(point.data.value[1]! * 100))} / ${unit.value}${point.data.market ? `\n${point.data.market}` : ''}`
    },
  },
  xAxis: { type: 'time', axisLabel: { fontSize: 10, hideOverlap: true, formatter: (value: number) => date(value) } },
  yAxis: { type: 'value', min: 0, name: `€ / ${unit.value}`, axisLabel: { formatter: (value: number) => money(Math.round(value * 100)), fontSize: 10 } },
  series: [
    { type: 'scatter', name: t('reweExport.observedUnitPrice'), symbolSize: 8, data: timeline.value.observations.map((point) => ({ value: [timestamp(point.date), point.priceCents / 100], market: point.market })) },
  ],
}))
const activityOption = computed<EChartsOption>(() => ({
  animation: false, aria: { enabled: true }, color: ['#9b2848'],
  grid: { left: 62, right: 22, top: 30, bottom: 68 },
  tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
  xAxis: { type: 'category', data: timeline.value.months.map((point) => point.month), axisLabel: { rotate: 35, fontSize: 10 } },
  yAxis: { type: 'value', min: 0, minInterval: metric.value === 'days' ? 1 : undefined, name: metric.value === 'quantity' ? unit.value : metric.value === 'spend' ? '€' : t('reweExport.days') },
  series: [{ type: 'bar', name: metric.value === 'quantity' ? unit.value : t(metric.value === 'spend' ? 'reweExport.amount' : 'reweExport.days'), data: timeline.value.months.map((point) => metric.value === 'quantity' ? point.quantity : metric.value === 'days' ? point.days : point.cents / 100) }],
}))
</script>

<template>
  <section class="export-product-history">
    <header><div><p class="eyebrow">{{ t('reweExport.productHistory') }}</p><h3>{{ product.name }}</h3></div><button class="button secondary export-product-close" type="button" :aria-label="t('close')" @click="emit('close')">×</button></header>
    <dl class="export-product-stats"><div><dt>{{ t('reweExport.minUnitPrice') }}</dt><dd>{{ product.minPriceCents === null ? '—' : money(product.minPriceCents) }}</dd></div><div><dt>{{ t('reweExport.maxUnitPrice') }}</dt><dd>{{ product.maxPriceCents === null ? '—' : money(product.maxPriceCents) }}</dd></div><div><dt>{{ t('reweExport.quantity') }}</dt><dd>{{ numeric.format(product.quantity) }} {{ unit }}</dd></div><div><dt>{{ t('reweExport.days') }}</dt><dd>{{ product.days }}</dd></div></dl>
    <ChartCard v-if="timeline.observations.length" :title="t('reweExport.productPriceTimeline')" :copy="t('reweExport.productPriceTimelineCopy')" :option="priceOption" :description="`${t('reweExport.priceRange')}: ${money(product.minPriceCents!)} – ${money(product.maxPriceCents!)} / ${unit}`" />
    <p v-else>{{ t('reweExport.quantityUnknown') }}</p>
    <ChartCard :title="t('reweExport.productActivityTimeline')" :copy="t('reweExport.productActivityTimelineCopy')" :option="activityOption">
      <template #actions><div class="metric-toggle" role="group" :aria-label="t('reweExport.productActivityMetric')"><button v-for="value in (['quantity', 'days', 'spend'] as const)" :key="value" type="button" :class="{ active: metric === value }" :aria-pressed="metric === value" @click="metric = value">{{ t(value === 'quantity' ? 'reweExport.quantity' : value === 'days' ? 'reweExport.days' : 'reweExport.amount') }}</button></div></template>
    </ChartCard>
    <details class="export-product-rows">
      <summary>{{ t('reweExport.productPurchaseRows', { count: product.rows.length }) }}</summary><p>{{ t('reweExport.priceUnitCopy') }}</p>
      <div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.date') }}</th><th>{{ t('reweExport.market') }}</th><th>{{ t('reweExport.quantity') }}</th><th>{{ t('reweExport.historyUnitPrice') }}</th><th>{{ t('reweExport.rowTotal') }}</th></tr></thead><tbody><tr v-for="(row, index) in product.rows" :key="index" :title="t('reweExport.provenance', { file: row.origin.file, table: row.origin.table + 1, row: row.origin.row + 1 })"><td>{{ date(row.date) }}</td><td>{{ row.market }}</td><td>{{ numeric.format(row.quantity) }}</td><td>{{ rowPrice(row.quantity, row.lineTotalCents) }} / {{ unit }}</td><td>{{ money(row.lineTotalCents) }}</td></tr></tbody></table></div>
    </details>
  </section>
</template>
