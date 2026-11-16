<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EChartsOption } from 'echarts'
import ChartCard from '../dashboard/ChartCard.vue'
import { exportInsights, type InsightRange } from '../../domain/receipts/reweExport/insights'
import type { ExportPurchase } from '../../domain/receipts/reweExport/schema'

const props = defineProps<{ rows: ExportPurchase[] }>()
const { t, locale } = useI18n()
const localeName = computed(() => locale.value === 'de' ? 'de-DE' : 'en-GB')
const insights = computed(() => exportInsights(props.rows))
const currency = computed(() => new Intl.NumberFormat(localeName.value, { style: 'currency', currency: 'EUR' }))
const wholeCurrency = computed(() => new Intl.NumberFormat(localeName.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
const decimal = computed(() => new Intl.NumberFormat(localeName.value, { maximumFractionDigits: 1 }))
const percent = computed(() => new Intl.NumberFormat(localeName.value, { style: 'percent', maximumFractionDigits: 0 }))
const signedPercent = computed(() => new Intl.NumberFormat(localeName.value, { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' }))

function money(cents: number) { return currency.value.format(cents / 100) }
function roundMoney(cents: number) { return wholeCurrency.value.format(cents / 100) }
function signedMoney(cents: number) { return `${cents > 0 ? '+' : ''}${money(cents)}` }
function number(value: number) { return decimal.value.format(value) }
function range(value: InsightRange, format: (value: number) => string) { return value.low === value.high ? null : { low: format(value.low), high: format(value.high) } }
function monthLabel(month: string, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(localeName.value, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
}
function date(value: string) {
  return new Intl.DateTimeFormat(localeName.value, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
}
// 2024-01-07 is a Sunday, so adding the JavaScript weekday index yields that weekday.
function weekday(day: number, style: 'short' | 'long' = 'long') {
  return new Intl.DateTimeFormat(localeName.value, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)))
}
function unit(value: ExportPurchase['quantityUnit']) { return t(`reweExport.unit.${value}`) }

const typical = computed(() => insights.value.typical)
const monthRange = computed(() => typical.value ? range(typical.value.cents, roundMoney) : null)
const tripRange = computed(() => typical.value ? range(typical.value.trips, number) : null)
const gapRange = computed(() => insights.value.gapDays ? range(insights.value.gapDays, number) : null)
const favouriteShare = computed(() => {
  const favourite = insights.value.weekdays.find((entry) => entry.day === insights.value.favouriteWeekday)
  return favourite && insights.value.trips ? favourite.trips / insights.value.trips.count : 0
})
const trendText = computed(() => {
  const trend = insights.value.trend
  if (!trend) return ''
  const values = { recent: roundMoney(trend.recentCents), previous: roundMoney(trend.previousCents), change: percent.value.format(Math.abs(trend.change)) }
  if (Math.abs(trend.change) < 0.05) return t('reweExport.insights.trendFlat', values)
  return t(trend.change > 0 ? 'reweExport.insights.trendUp' : 'reweExport.insights.trendDown', values)
})
const priceGroups = computed(() => (['rising', 'falling'] as const)
  .map((id) => ({ id, rows: insights.value.priceChanges[id] }))
  .filter((group) => group.rows.length))
const reversedMonths = computed(() => [...insights.value.months].reverse())

const monthOption = computed<EChartsOption>(() => {
  const months = insights.value.months
  const median = typical.value ? typical.value.cents.median / 100 : null
  return {
    animation: false, aria: { enabled: true }, color: ['#9b2848', '#d98470'],
    legend: { top: 0, textStyle: { fontSize: 10 } },
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true, valueFormatter: (value) => typeof value === 'number' ? money(Math.round(value * 100)) : String(value) },
    grid: { left: 65, right: 20, top: 40, bottom: 75 },
    xAxis: { type: 'category', data: months.map((month) => monthLabel(month.month)), axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value', axisLabel: { formatter: (value: number) => roundMoney(value * 100), fontSize: 10 } },
    series: [
      { type: 'bar', name: t('reweExport.amount'), data: months.map((month) => ({ value: month.cents / 100, itemStyle: month.partial ? { opacity: 0.4 } : undefined })) },
      ...(median === null ? [] : [{ type: 'line' as const, name: t('reweExport.insights.typicalLine'), data: months.map(() => median), symbol: 'none', lineStyle: { type: 'dashed' as const, width: 2 } }]),
    ],
  }
})

const weekdayOrder = computed(() => insights.value.weekdays)
const weekdayOption = computed<EChartsOption>(() => ({
  animation: false, aria: { enabled: true }, color: ['#9b2848', '#d98470'],
  legend: { top: 0, textStyle: { fontSize: 10 } },
  tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
  grid: { left: 50, right: 60, top: 40, bottom: 40 },
  xAxis: { type: 'category', data: weekdayOrder.value.map((entry) => weekday(entry.day, 'short')) },
  yAxis: [
    { type: 'value', name: t('reweExport.insights.trips'), minInterval: 1 },
    { type: 'value', name: '€', axisLabel: { formatter: (value: number) => roundMoney(value * 100) } },
  ],
  series: [
    { type: 'bar', name: t('reweExport.insights.trips'), data: weekdayOrder.value.map((entry) => entry.trips) },
    { type: 'line', name: t('reweExport.amount'), yAxisIndex: 1, data: weekdayOrder.value.map((entry) => entry.cents / 100), tooltip: { valueFormatter: (value) => typeof value === 'number' ? money(Math.round(value * 100)) : String(value) } },
  ],
}))
</script>

<template>
  <section id="export-panel-insights" role="tabpanel" aria-labelledby="export-tab-insights" class="export-insights">
    <h2>{{ t('reweExport.insights.title') }}</h2>
    <p class="export-explanation">{{ t('reweExport.insights.copy') }}</p>
    <p v-if="!rows.length || !typical">{{ t('reweExport.insights.empty') }}</p>
    <template v-else>
      <section class="export-insight-highlights">
        <article class="export-insight-lead">
          <h3>{{ t('reweExport.insights.typicalMonth') }}</h3>
          <strong>{{ roundMoney(typical.cents.median) }}</strong>
          <p v-if="monthRange">{{ t('reweExport.insights.typicalMonthRange', monthRange) }}</p>
          <small>{{ t(typical.excludedPartial ? 'reweExport.insights.typicalMonthPartial' : 'reweExport.insights.typicalMonthBasis', { months: typical.months }) }}</small>
        </article>
        <article>
          <h3>{{ t('reweExport.insights.tripsPerMonth') }}</h3>
          <strong>{{ number(typical.trips.median) }}</strong>
          <p v-if="tripRange">{{ t('reweExport.insights.tripsPerMonthRange', tripRange) }}</p>
        </article>
        <article v-if="insights.trips">
          <h3>{{ t('reweExport.insights.typicalTrip') }}</h3>
          <strong>{{ money(insights.trips.cents.median) }}</strong>
          <p>{{ t('reweExport.insights.typicalTripItems', { count: number(insights.trips.products.median) }) }}</p>
        </article>
        <article v-if="insights.gapDays">
          <h3>{{ t('reweExport.insights.gap') }}</h3>
          <strong>{{ t('reweExport.insights.gapValue', { days: number(insights.gapDays.median) }) }}</strong>
          <p v-if="gapRange">{{ t('reweExport.insights.gapRange', gapRange) }}</p>
        </article>
        <article v-if="insights.favouriteWeekday !== null">
          <h3>{{ t('reweExport.insights.favouriteWeekday') }}</h3>
          <strong>{{ weekday(insights.favouriteWeekday) }}</strong>
          <p>{{ t('reweExport.insights.favouriteWeekdayShare', { share: percent.format(favouriteShare) }) }}</p>
        </article>
      </section>

      <p v-if="trendText" class="export-insight-trend"><strong>{{ t('reweExport.insights.trend') }}</strong> {{ trendText }}</p>

      <ChartCard :title="t('reweExport.insights.monthByMonth')" :copy="t('reweExport.insights.monthByMonthCopy')" :option="monthOption" />
      <div class="export-badges">
        <span>{{ t('reweExport.insights.highest') }}: {{ monthLabel(typical.highest.month, 'long') }} · {{ money(typical.highest.cents) }}</span>
        <span>{{ t('reweExport.insights.lowest') }}: {{ monthLabel(typical.lowest.month, 'long') }} · {{ money(typical.lowest.cents) }}</span>
      </div>
      <details class="export-card export-insight-months">
        <summary>{{ t('reweExport.insights.monthTable') }}</summary>
        <div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table">
          <thead><tr><th>{{ t('reweExport.insights.month') }}</th><th>{{ t('reweExport.amount') }}</th><th>{{ t('reweExport.insights.change') }}</th><th>{{ t('reweExport.insights.trips') }}</th><th>{{ t('reweExport.insights.perTrip') }}</th><th>{{ t('reweExport.products') }}</th></tr></thead>
          <tbody><tr v-for="month in reversedMonths" :key="month.month">
            <td>{{ monthLabel(month.month, 'long') }}<small v-if="month.partial"> · {{ t('reweExport.insights.partial') }}</small></td>
            <td>{{ money(month.cents) }}</td>
            <td :class="{ up: (month.changeCents ?? 0) > 0, down: (month.changeCents ?? 0) < 0 }">{{ month.changeCents === null ? '—' : signedMoney(month.changeCents) }}</td>
            <td>{{ month.trips }}</td>
            <td>{{ month.averageTripCents === null ? '—' : money(month.averageTripCents) }}</td>
            <td>{{ month.products }}</td>
          </tr></tbody>
        </table></div>
      </details>

      <article v-if="insights.years.length > 1" class="export-card">
        <h2>{{ t('reweExport.insights.years') }}</h2>
        <div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table">
          <thead><tr><th>{{ t('reweExport.insights.year') }}</th><th>{{ t('reweExport.insights.yearTotal') }}</th><th>{{ t('reweExport.insights.yearMonthly') }}</th><th>{{ t('reweExport.insights.yearMonths') }}</th><th>{{ t('reweExport.insights.trips') }}</th></tr></thead>
          <tbody><tr v-for="year in insights.years" :key="year.year"><td>{{ year.year }}</td><td>{{ money(year.cents) }}</td><td>{{ money(year.monthlyCents) }}</td><td>{{ year.months }}</td><td>{{ year.trips }}</td></tr></tbody>
        </table></div>
      </article>

      <article class="export-card">
        <h2>{{ t('reweExport.insights.staples') }}</h2>
        <p>{{ t('reweExport.insights.staplesCopy') }}</p>
        <p v-if="!insights.staples.length">{{ t('reweExport.insights.noStaples') }}</p>
        <div v-else class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table export-staples">
          <thead><tr><th>{{ t('reweExport.product') }}</th><th>{{ t('reweExport.insights.monthShare') }}</th><th>{{ t('reweExport.insights.every') }}</th><th>{{ t('reweExport.insights.perMonth') }}</th><th>{{ t('reweExport.insights.lastBought') }}</th></tr></thead>
          <tbody><tr v-for="product in insights.staples" :key="product.key">
            <td>{{ product.name }}</td>
            <td><span class="export-insight-meter" :style="{ '--share': product.monthShare }" aria-hidden="true"><i></i></span>{{ percent.format(product.monthShare) }}</td>
            <td>{{ product.intervalDays === null ? '—' : t('reweExport.insights.everyDays', { days: product.intervalDays }) }}</td>
            <td>{{ money(product.monthlyCents) }}</td>
            <td>{{ date(product.lastDate) }}</td>
          </tr></tbody>
        </table></div>
      </article>

      <div class="export-two-columns">
        <article v-if="insights.basket.length" class="export-card">
          <h2>{{ t('reweExport.insights.basket') }}</h2>
          <p>{{ t('reweExport.insights.basketCopy') }}</p>
          <ol class="export-ranking"><li v-for="product in insights.basket" :key="product.key">
            <span>{{ product.name }}<small v-if="product.quantityPerTrip !== null"> · {{ t('reweExport.insights.perTripQuantity', { quantity: number(product.quantityPerTrip), unit: unit(product.unit) }) }}</small></span>
            <strong>{{ t('reweExport.insights.tripShare', { share: percent.format(product.tripShare) }) }}</strong>
          </li></ol>
        </article>
        <ChartCard v-if="insights.trips && insights.trips.count > 1" :title="t('reweExport.insights.weekdays')" :copy="t('reweExport.insights.weekdaysCopy')" :option="weekdayOption" />
      </div>

      <article class="export-card">
        <h2>{{ t('reweExport.insights.prices') }}</h2>
        <p>{{ t('reweExport.insights.pricesCopy') }}</p>
        <p v-if="!insights.priceChanges.tracked">{{ t('reweExport.insights.noPriceChanges') }}</p>
        <template v-else>
          <p v-if="insights.priceChanges.medianChange !== null" class="export-insight-trend">{{ t('reweExport.insights.pricesMedian', { count: insights.priceChanges.tracked, change: signedPercent.format(insights.priceChanges.medianChange) }) }}</p>
          <div :class="{ 'export-two-columns': priceGroups.length > 1 }">
            <section v-for="group in priceGroups" :key="group.id">
              <h3>{{ t(`reweExport.insights.${group.id}`) }}</h3>
              <ol class="export-ranking"><li v-for="entry in group.rows" :key="entry.key">
                <span>{{ entry.name }}<small> · {{ t('reweExport.insights.priceFromTo', { from: money(entry.firstPriceCents), to: money(entry.lastPriceCents) }) }} / {{ unit(entry.unit) }}</small></span>
                <strong :class="group.id === 'rising' ? 'up' : 'down'">{{ signedPercent.format(entry.change) }}</strong>
              </li></ol>
            </section>
          </div>
        </template>
      </article>

      <article class="export-card">
        <h2>{{ t('reweExport.insights.habits') }}</h2>
        <p>{{ t('reweExport.insights.habitsCopy') }}</p>
        <p v-if="!insights.newProducts.length && !insights.droppedProducts.length">{{ insights.months.length >= 6 ? t('reweExport.insights.noHabitChanges') : t('reweExport.insights.habitsShort') }}</p>
        <div v-else :class="{ 'export-two-columns': insights.newProducts.length && insights.droppedProducts.length }">
          <section v-if="insights.newProducts.length">
            <h3>{{ t('reweExport.insights.newProducts') }}</h3><p>{{ t('reweExport.insights.newProductsCopy') }}</p>
            <ol class="export-ranking"><li v-for="product in insights.newProducts" :key="product.key"><span>{{ product.name }}</span><strong>{{ t('reweExport.insights.sinceDate', { date: date(product.firstDate) }) }}</strong></li></ol>
          </section>
          <section v-if="insights.droppedProducts.length">
            <h3>{{ t('reweExport.insights.droppedProducts') }}</h3><p>{{ t('reweExport.insights.droppedProductsCopy') }}</p>
            <ol class="export-ranking"><li v-for="product in insights.droppedProducts" :key="product.key"><span>{{ product.name }}</span><strong>{{ t('reweExport.insights.lastDate', { date: date(product.lastDate) }) }}</strong></li></ol>
          </section>
        </div>
      </article>

      <article class="export-card">
        <h2>{{ t('reweExport.insights.facts') }}</h2>
        <ul class="export-insight-facts">
          <li v-if="insights.trips">{{ t('reweExport.insights.largestTrip', { amount: money(insights.trips.largest.cents), date: date(insights.trips.largest.date), market: insights.trips.largest.market }) }}</li>
          <li v-if="insights.concentration">{{ t('reweExport.insights.concentration', { top: insights.concentration.top, share: percent.format(insights.concentration.share) }) }}</li>
          <li v-if="insights.deposits">{{ t('reweExport.insights.deposits', { paid: money(insights.deposits.paidCents), returned: money(insights.deposits.returnedCents) }) }}</li>
          <li v-if="insights.discountsCents > 0">{{ t('reweExport.insights.discounts', { amount: money(insights.discountsCents) }) }}</li>
        </ul>
      </article>
    </template>
  </section>
</template>
