<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EChartsOption } from 'echarts'
import ChartCard from '../dashboard/ChartCard.vue'
import ExportProductHistory from './ExportProductHistory.vue'
import ExportDateRangePicker from './ExportDateRange.vue'
import type { ExportAnalysisView as View } from './navigation'
import { inExportRange, type ExportDateRange } from '../../domain/receipts/reweExport/dateRange'
import { exportProfileCards, profileValueFormat, profileValueToken } from '../../domain/receipts/reweExport/profile'
import type { ExportFact, ExportOrigin, ReweExport } from '../../domain/receipts/reweExport/schema'
import { activityCounts, exportBonus, exportDayGroups, exportDevices, exportMarkets, exportMonths, exportProducts, exportPurchases, exportSummary } from '../../domain/receipts/reweExport/analytics'

const props = defineProps<{ data: ReweExport; view?: View; hideTabs?: boolean }>()
const { t, te, locale } = useI18n()
const active = ref<View>(props.view ?? 'purchases')
const range = ref<ExportDateRange>({ start: '', end: '' })
const market = ref('')
const search = ref('')
const sort = ref('spend')
const limit = ref(20)
const selectedProduct = ref('')
const stream = ref<'app' | 'appEvents' | 'web'>('app')
const activityLimit = ref(20)
const currency = computed(() => new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }))
const decimal = computed(() => new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 3 }))
const percent = computed(() => new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { style: 'percent', maximumFractionDigits: 1 }))
const tabs = computed(() => (['purchases', 'products', 'bonus', 'profile', 'activity'] as View[]).map((id) => ({ id, label: t(`reweExport.${id}Tab`) })))
const markets = computed(() => [...new Set(props.data.purchases.map((row) => row.market))].sort())
const rows = computed(() => exportPurchases(props.data, 'all', market.value, range.value))
const summary = computed(() => exportSummary(rows.value))
const sourceSummary = computed(() => exportSummary(props.data.purchases))
const months = computed(() => exportMonths(rows.value))
const marketData = computed(() => exportMarkets(rows.value))
const groups = computed(() => exportDayGroups(rows.value))
const calendarDates = computed(() => [...new Set(active.value === 'bonus' ? props.data.bonusTransactions.map((row) => row.date) : props.data.purchases.filter((row) => !market.value || row.market === market.value).map((row) => row.date))])
const metadataDates = computed(() => [...new Set([...props.data.receiptIndex, ...props.data.bonusTransactions].map((row) => row.date))])
const itemBenefits = computed(() => props.data.itemBonus.filter((row) => inExportRange(row.date, range.value)))
const statusRows = computed(() => ({ coupons: props.data.coupons.filter((row) => inExportRange(row.date, range.value)), challenges: props.data.challenges.filter((row) => inExportRange(row.date, range.value)) }))
const products = computed(() => exportProducts(rows.value))
const productRows = computed(() => {
  const values = products.value.filter((product) => product.name.toLocaleLowerCase().includes(search.value.toLocaleLowerCase()))
  if (sort.value === 'days') values.sort((a, b) => b.days - a.days || b.cents - a.cents)
  else if (sort.value === 'name') values.sort((a, b) => a.name.localeCompare(b.name))
  return values
})
const product = computed(() => products.value.find((entry) => entry.key === selectedProduct.value))
const bonus = computed(() => exportBonus(props.data, 'all', range.value))
const skipped = computed(() => props.data.files.reduce((sum, file) => sum + file.skippedRows, 0))
const streams = ['app', 'appEvents', 'web'] as const
const activities = computed(() => props.data.activities.filter((row) => row.source === stream.value))
const activityRows = computed(() => [...activities.value].sort((a, b) => b.timestamp.localeCompare(a.timestamp)))
const devices = computed(() => exportDevices(props.data.activities))
const actions = computed(() => activityCounts(props.data.activities.filter((row) => row.source === 'appEvents'), 'EVENT_NAME').slice(0, 10))
const pages = computed(() => activityCounts(props.data.activities.filter((row) => row.source === 'app'), 'Page name').slice(0, 10))
const cities = computed(() => activityCounts(activities.value, stream.value === 'appEvents' ? 'CITY' : 'City').slice(0, 10))
const activityMonths = computed(() => {
  const months = new Map<string, number>()
  activities.value.forEach((row) => {
    if (/^\d{4}-\d{2}/.test(row.timestamp)) {
      const month = row.timestamp.slice(0, 7)
      months.set(month, (months.get(month) ?? 0) + 1)
    }
  })
  return [...months].sort(([a], [b]) => a.localeCompare(b))
})
const factGroups = computed(() => {
  const groups = new Map<string, ExportFact[]>()
  props.data.facts.forEach((fact) => groups.set(fact.section, [...(groups.get(fact.section) ?? []), fact]))
  const priority = ['Basis-Segmentierung', 'OC Preis Segementierung', 'Segmentierung für BIO Produkte', 'Stammmarkt', 'Kundenprofil-Personalisierungsdaten', 'Konto']
  const order = (name: string) => priority.includes(name) ? priority.indexOf(name) : priority.length
  return [...groups].map(([name, facts]) => ({ name, facts })).sort((a, b) => order(a.name) - order(b.name))
})
const profileCards = computed(() => exportProfileCards(props.data))
const profileSections = computed(() => (['preferences', 'estimates', 'relationship', 'account'] as const).map((id) => ({ id, cards: profileCards.value.filter((card) => card.group === id) })).filter((group) => group.cards.length))
const extraFacts = computed(() => props.data.facts.filter((fact) => !profileCards.value.some((card) => card.fact === fact) && !['calender week', 'processed timestamp'].includes(fact.field)))
const hasInterestNames = computed(() => props.data.interests.some((row) => Boolean(row.name)))
const interests = computed(() => [...props.data.interests].sort((a, b) => b.score - a.score))

function money(cents: number) { return currency.value.format(cents / 100) }
function number(value: number) { return decimal.value.format(value) }
function formatDate(value: string) {
  const date = value.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return value
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime())) return value
  return new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
}
function source(origin: ExportOrigin) {
  const label = t('reweExport.provenance', { file: origin.file, table: origin.table + 1, row: origin.row + 1 })
  return origin.column === undefined ? label : `${label} · ${t('reweExport.sourceColumn', { column: origin.column + 1 })}`
}
function groupLabel(name: string) { return te(`reweExport.groups.${name}`) ? t(`reweExport.groups.${name}`) : name }
function fieldLabel(field: string) {
  if (te(`reweExport.metricLabels.${field}`)) return t(`reweExport.metricLabels.${field}`)
  return te(`reweExport.fields.${field}`) ? t(`reweExport.fields.${field}`) : field
}
function factValue(fact: ExportFact) {
  const value = Number(fact.value)
  const format = profileValueFormat(fact.field)
  if (format === 'money' && Number.isFinite(value)) return money(Math.round(value * 100))
  if (format === 'ratio' && Number.isFinite(value)) return percent.value.format(value)
  if (format === 'percent' && Number.isFinite(value)) return `${rounded(value)} %`
  if (format === 'date') return formatDate(fact.value)
  if (format === 'boolean') {
    if (fact.value === 'true' || value === 1) return t('reweExport.values.yes')
    if (fact.value === 'false' || value === 0) return t('reweExport.values.no')
    return fact.value
  }
  if (format === 'number' && Number.isFinite(value)) return rounded(value)
  const age = locale.value === 'en' && fact.field === 'LEBENSPHASE' ? fact.value.match(/^(\d+)\s+bis\s+(\d+)\s+Jahre$/) : undefined
  if (age) return t('reweExport.ageRange', { from: age[1], to: age[2] })
  const token = locale.value === 'en' ? profileValueToken(fact) : undefined
  if (token) return t(`reweExport.values.${token}`)
  if (/^[+-]?\d+(?:\.\d+|[eE][+-]?\d+)/.test(fact.value) && Number.isFinite(value)) return rounded(value)
  return fact.value
}
function rounded(value: number) { return new Intl.NumberFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 2 }).format(value) }
function consentLabel(type: string): string {
  const [base, channel] = type.split(' · ')
  const label = te(`reweExport.consentTypes.${base}`) ? t(`reweExport.consentTypes.${base}`) : base!
  if (!channel) return label
  const translated = channel === 'E-Mail' ? t('reweExport.emailChannel') : channel === 'Post' ? t('reweExport.postChannel') : channel
  return `${label} · ${translated}`
}
function consentVia(value: string) { return te(`reweExport.consentOrigins.${value}`) ? t(`reweExport.consentOrigins.${value}`) : value }
function statusLabel(status: string) { return te(`reweExport.statusLabels.${status}`) ? t(`reweExport.statusLabels.${status}`) : status }
function activityLabel(value: string, kind: string) {
  const key = kind === 'actions' ? `reweExport.activityEvents.${value}` : `reweExport.activityPages.${value.split(':').at(-1)}`
  return te(key) ? t(key) : value
}
function priceRange(min: number | null, max: number | null) {
  if (min === null || max === null) return '—'
  return min === max ? money(min) : `${money(min)} – ${money(max)}`
}
function selectProduct(key: string) {
  selectedProduct.value = key
  void nextTick(() => document.querySelector('.export-product-history')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }))
}
function switchTab(view: View) {
  active.value = view
  limit.value = 20
  selectedProduct.value = ''
}
function tabKeys(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.value.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.value.length) % tabs.value.length
  switchTab(tabs.value[target]!.id)
  void nextTick(() => document.getElementById(`export-tab-${active.value}`)?.focus())
}
watch([range, market, search, sort], () => {
  limit.value = 20
  selectedProduct.value = ''
})
watch(stream, () => { activityLimit.value = 20 })
watch(() => props.view, (view) => { if (view && view !== active.value) switchTab(view) })
watch(() => props.data, () => {
  active.value = 'purchases'
  search.value = ''
  sort.value = 'spend'
  stream.value = 'app'
  range.value = { start: '', end: '' }
  market.value = ''
  selectedProduct.value = ''
  limit.value = 20
  activityLimit.value = 20
})

function chart(labels: string[], series: EChartsOption['series']): EChartsOption {
  return {
    animation: false, aria: { enabled: true }, color: ['#9b2848', '#d98470'],
    tooltip: { trigger: 'axis', renderMode: 'richText', confine: true },
    grid: { left: 65, right: 20, top: 40, bottom: 75 },
    xAxis: { type: 'category', data: labels, axisLabel: { rotate: 35, fontSize: 10 } },
    yAxis: { type: 'value' }, series,
  }
}
const monthlyOption = computed(() => chart(months.value.map((row) => row.month), [{ type: 'bar', name: `${t('reweExport.amount')} (€)`, data: months.value.map((row) => row.cents / 100) }]))
const marketsOption = computed(() => chart(marketData.value.map((row) => row.market.length > 34 ? `${row.market.slice(0, 32)}…` : row.market), [{ type: 'bar', name: `${t('reweExport.amount')} (€)`, data: marketData.value.map((row) => row.cents / 100) }]))
const bonusOption = computed<EChartsOption>(() => ({
  ...chart(bonus.value.months.map((row) => row.month), [
    { type: 'bar', name: t('reweExport.earned'), data: bonus.value.months.map((row) => row.earned / 100) },
    { type: 'bar', name: t('reweExport.redeemed'), data: bonus.value.months.map((row) => row.spent / 100) },
  ]), legend: { top: 0 },
}))
const activityOption = computed(() => chart(activityMonths.value.map(([month]) => month), [{ type: 'bar', name: t('reweExport.records'), data: activityMonths.value.map(([, count]) => count) }]))
</script>

<template>
  <section class="dashboard export-dashboard">
    <header class="dashboard-heading">
      <div><p class="eyebrow">{{ t('reweExport.kicker') }}</p><h1>{{ t('reweExport.title') }}</h1><p>{{ t('reweExport.separate') }}</p></div>
      <p class="export-period" v-if="sourceSummary.firstDate">{{ t('reweExport.period') }}<strong>{{ formatDate(sourceSummary.firstDate) }} – {{ formatDate(sourceSummary.lastDate!) }}</strong></p>
    </header>
    <nav v-if="!hideTabs" class="analytics-tabs" role="tablist" :aria-label="t('analyticsViews')">
      <button v-for="(tab, index) in tabs" :id="`export-tab-${tab.id}`" :key="tab.id" type="button" role="tab" :aria-selected="active === tab.id" :aria-controls="`export-panel-${tab.id}`" :tabindex="active === tab.id ? 0 : -1" @click="switchTab(tab.id)" @keydown="tabKeys($event, index)">{{ tab.label }}</button>
    </nav>
    <div v-if="['purchases', 'products', 'bonus'].includes(active)" class="export-filters export-main-filters">
      <ExportDateRangePicker v-model="range" :data-dates="calendarDates" :metadata-dates="market || active === 'bonus' ? [] : metadataDates" :data-label="active === 'bonus' ? t('reweExport.calendarBonus') : undefined" />
      <label v-if="active !== 'bonus'">{{ t('reweExport.market') }}<select v-model="market"><option value="">{{ t('reweExport.allMarkets') }}</option><option v-for="value in markets" :key="value">{{ value }}</option></select></label>
    </div>

    <section v-if="active === 'purchases'" id="export-panel-purchases" role="tabpanel" aria-labelledby="export-tab-purchases">
      <section class="stat-grid primary-stats">
        <article><span>{{ t('reweExport.amount') }}</span><strong>{{ money(summary.totalCents) }}</strong></article>
        <article><span>{{ t('reweExport.days') }}</span><strong>{{ number(summary.days) }}</strong></article>
        <article><span>{{ t('reweExport.markets') }}</span><strong>{{ number(summary.markets) }}</strong></article>
        <article><span>{{ t('reweExport.products') }}</span><strong>{{ number(summary.products) }}</strong></article>
        <article><span>{{ t('reweExport.rows') }}</span><strong>{{ number(summary.rows) }}</strong></article>
      </section>
      <p class="export-explanation">{{ t('reweExport.purchasesCopy') }}</p>
      <div v-if="rows.length" class="chart-grid">
        <ChartCard :title="t('reweExport.monthly')" :description="`${t('reweExport.amount')}: ${money(summary.totalCents)}`" :option="monthlyOption" />
        <ChartCard :title="t('reweExport.marketChart')" :option="marketsOption" />
      </div>
      <article class="export-card">
        <h2>{{ t('reweExport.dayGroups') }}</h2><p>{{ t('reweExport.dayCopy') }}</p>
        <p v-if="!groups.length">{{ t('reweExport.noPurchases') }}</p>
        <details v-for="group in groups.slice(0, limit)" :key="group.key" class="export-day">
          <summary><span><strong>{{ formatDate(group.date) }}</strong><small>{{ group.market }}</small></span><span>{{ t('reweExport.positions', { count: group.rows.length }) }}<strong>{{ money(group.cents) }}</strong></span></summary>
          <div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.product') }}</th><th>{{ t('reweExport.quantity') }}</th><th>{{ t('reweExport.amountColumn') }}</th></tr></thead><tbody><tr v-for="(row, index) in group.rows" :key="index" :title="source(row.origin)"><td>{{ row.name }}</td><td>{{ number(row.quantity) }} {{ t(`reweExport.unit.${row.quantityUnit}`) }}</td><td>{{ money(row.lineTotalCents) }}</td></tr></tbody></table></div>
        </details>
        <button v-if="groups.length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button>
      </article>
    </section>

    <section v-else-if="active === 'products'" id="export-panel-products" role="tabpanel" aria-labelledby="export-tab-products" class="export-card">
      <h2>{{ t('reweExport.productsTitle') }}</h2><p>{{ t('reweExport.productsCopy') }}</p>
      <div class="export-filters"><label>{{ t('reweExport.search') }}<input v-model="search" type="search" /></label><label>{{ t('reweExport.sort') }}<select v-model="sort"><option value="spend">{{ t('reweExport.sortSpend') }}</option><option value="days">{{ t('reweExport.sortDays') }}</option><option value="name">{{ t('reweExport.sortName') }}</option></select></label></div>
      <div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.product') }}</th><th>{{ t('reweExport.quantity') }}</th><th>{{ t('reweExport.days') }}</th><th>{{ t('reweExport.unitPrice') }}</th><th>{{ t('reweExport.priceRange') }}</th><th>{{ t('reweExport.amountColumn') }}</th></tr></thead><tbody><tr v-for="entry in productRows.slice(0, limit)" :key="entry.key"><td><button class="export-inline-button" type="button" @click="selectProduct(entry.key)">{{ entry.name }} ↗</button></td><td>{{ number(entry.quantity) }} {{ t(`reweExport.unit.${entry.unit}`) }}</td><td>{{ entry.days }}</td><td>{{ entry.averagePriceCents === null ? '—' : money(entry.averagePriceCents) }}</td><td>{{ priceRange(entry.minPriceCents, entry.maxPriceCents) }}</td><td>{{ money(entry.cents) }}</td></tr></tbody></table></div>
      <p v-if="!productRows.length">{{ t('reweExport.noProducts') }}</p>
      <button v-if="productRows.length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button>
      <ExportProductHistory v-if="product" :key="product.key" :product="product" :start="range.start || sourceSummary.firstDate" :end="range.end || sourceSummary.lastDate" @close="selectedProduct = ''" />
    </section>

    <section v-else-if="active === 'bonus'" id="export-panel-bonus" role="tabpanel" aria-labelledby="export-tab-bonus">
      <h2>{{ t('reweExport.bonusTitle') }}</h2><p class="export-explanation">{{ t('reweExport.bonusCopy') }}</p>
      <section class="stat-grid export-bonus-stats"><article><span>{{ t('reweExport.earned') }}</span><strong>{{ money(bonus.earnedCents) }}</strong></article><article><span>{{ t('reweExport.redeemed') }}</span><strong>{{ money(bonus.spentCents) }}</strong></article><article><span>{{ t('reweExport.balance') }}</span><strong>{{ bonus.balance ? money(bonus.balance.cents) : '—' }}</strong><small v-if="bonus.balance">{{ formatDate(bonus.balance.date) }}</small></article></section>
      <p v-if="bonus.differenceCents !== null && bonus.differenceCents !== 0" class="export-explanation">{{ t('reweExport.difference', { amount: money(bonus.differenceCents) }) }}</p>
      <ChartCard v-if="bonus.months.length" :title="t('reweExport.bonusFlow')" :option="bonusOption" />
      <article class="export-card"><h2>{{ t('reweExport.ledger') }}</h2><p v-if="!bonus.transactions.length">{{ t('reweExport.noBonus') }}</p><div v-else class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.date') }}</th><th>{{ t('reweExport.type') }}</th><th>{{ t('reweExport.amountColumn') }}</th></tr></thead><tbody><tr v-for="(row, index) in bonus.transactions.slice(0, limit)" :key="index" :title="source(row.origin)"><td>{{ formatDate(row.date) }}</td><td>{{ t(`reweExport.${row.type}`) }}</td><td>{{ money(row.cents) }}</td></tr></tbody></table></div><button v-if="bonus.transactions.length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button></article>
      <article class="export-card"><h2>{{ t('reweExport.itemBenefits') }}</h2><p>{{ t('reweExport.statusesCopy') }}</p><div class="export-badges"><span>{{ t('reweExport.positions', { count: itemBenefits.length }) }}</span><span>{{ t('reweExport.coupons') }}: {{ number(statusRows.coupons.length) }}</span><span>{{ t('reweExport.challenges') }}: {{ number(statusRows.challenges.length) }}</span></div>
        <details><summary>{{ t('reweExport.itemBenefits') }}</summary><div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><tbody><tr v-for="(row, index) in itemBenefits.slice(0, limit)" :key="index" :title="source(row.origin)"><td>{{ row.date }} · {{ row.name }}</td><td>{{ row.market }}</td><td>{{ money(row.cents) }}</td></tr></tbody></table></div><button v-if="itemBenefits.length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button></details>
        <details v-for="kind in (['coupons', 'challenges'] as const)" :key="kind"><summary>{{ t(`reweExport.${kind}`) }}</summary><ul class="export-status-list"><li v-for="(row, index) in statusRows[kind].slice(0, limit)" :key="index" :title="source(row.origin)"><time>{{ formatDate(row.date) }}</time><span>{{ row.title }}</span><strong>{{ statusLabel(row.status) }}</strong></li></ul><button v-if="statusRows[kind].length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button></details>
      </article>
    </section>

    <section v-else-if="active === 'profile'" id="export-panel-profile" role="tabpanel" aria-labelledby="export-tab-profile">
      <h2>{{ t('reweExport.profileTitle') }}</h2><p class="export-explanation">{{ t('reweExport.profileCopy') }}</p>
      <p v-if="!factGroups.length">{{ t('reweExport.noProfile') }}</p>
      <section v-for="section in profileSections" :key="section.id" class="export-profile-section">
        <h3>{{ t(`reweExport.profileSections.${section.id}`) }}</h3>
        <div class="export-profile-cards"><article v-for="card in section.cards" :key="card.id" class="export-profile-card" :title="`${card.fact.field}: ${card.fact.value} · ${source(card.fact.origin)}`">
          <h4>{{ t(`reweExport.profileLabels.${card.id}`) }}</h4><strong>{{ factValue(card.fact) }}</strong>
          <small v-for="context in card.context" :key="context.field">{{ fieldLabel(context.field) }}: {{ factValue(context) }}</small>
        </article></div>
      </section>
      <details v-if="extraFacts.length" class="export-card export-more-profile"><summary>{{ t('reweExport.moreProfile') }}</summary><dl class="export-facts"><div v-for="(fact, index) in extraFacts" :key="index" :title="source(fact.origin)"><dt>{{ fieldLabel(fact.field) }}</dt><dd>{{ factValue(fact) }}</dd></div></dl></details>
      <details v-if="factGroups.length" class="export-card export-original-profile"><summary>{{ t('reweExport.originalProfile') }}</summary><section v-for="group in factGroups" :key="group.name"><h3>{{ groupLabel(group.name) }}</h3><dl class="export-facts"><div v-for="(fact, index) in group.facts" :key="index" :title="source(fact.origin)"><dt><code>{{ fact.field }}</code></dt><dd>{{ fact.value }}</dd></div></dl></section></details>
      <article v-if="data.consents.length" class="export-card"><h2>{{ t('reweExport.consents') }}</h2><ul class="export-consents"><li v-for="(consent, index) in data.consents" :key="index" :title="source(consent.origin)"><div><strong>{{ consentLabel(consent.type) }}</strong><small>{{ formatDate(consent.changedAt) }} · {{ consentVia(consent.via) }}</small></div><span :class="{ granted: consent.granted }">{{ t(consent.granted ? 'reweExport.granted' : 'reweExport.denied') }}</span></li></ul></article>
      <article v-if="interests.length" class="export-card export-interests">
        <h2>{{ t('reweExport.interests') }}</h2><p>{{ t('reweExport.interestsCopy') }}</p><p v-if="!hasInterestNames">{{ t('reweExport.interestMissingNames', { count: interests.length }) }}</p>
        <div class="export-badges"><span>{{ t('reweExport.interestCount') }}: {{ number(interests.length) }}</span><span>{{ t('reweExport.interestScoreRange') }}: {{ number(interests.at(-1)!.score) }}<template v-if="interests[0]!.score !== interests.at(-1)!.score"> – {{ number(interests[0]!.score) }}</template></span></div>
        <details><summary>{{ t('reweExport.interestDetails') }}</summary><div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.articleId') }}</th><th v-if="hasInterestNames">{{ t('reweExport.product') }}</th><th>{{ t('reweExport.score') }}</th></tr></thead><tbody><tr v-for="(row, index) in interests.slice(0, limit)" :key="index" :title="source(row.origin)"><td>{{ row.articleId }}</td><td v-if="hasInterestNames">{{ row.name || t('reweExport.unnamed') }}</td><td>{{ number(row.score) }}</td></tr></tbody></table></div><button v-if="interests.length > limit" class="button secondary" type="button" @click="limit += 20">{{ t('reweExport.showMore') }}</button></details>
      </article>
    </section>

    <section v-else id="export-panel-activity" role="tabpanel" aria-labelledby="export-tab-activity">
      <h2>{{ t('reweExport.activityTitle') }}</h2><p class="export-explanation">{{ t('reweExport.activityCopy') }}</p>
      <section class="stat-grid export-bonus-stats"><article v-for="value in streams" :key="value"><span>{{ t(`reweExport.streams.${value}`) }}</span><strong>{{ number(data.activities.filter((row) => row.source === value).length) }}</strong></article></section>
      <p v-if="!data.activities.length">{{ t('reweExport.noActivity') }}</p>
      <template v-else>
        <article class="export-card" v-if="devices.length"><h2>{{ t('reweExport.devices') }}</h2><p>{{ t('reweExport.deviceCopy') }}</p><ol class="export-devices"><li v-for="device in devices" :key="device.name"><strong>{{ device.name }}</strong><span>{{ formatDate(device.first) }} – {{ formatDate(device.last) }}</span><small>{{ number(device.count) }} {{ t('reweExport.records') }}</small></li></ol></article>
        <div class="export-filters"><label>{{ t('reweExport.stream') }}<select v-model="stream"><option v-for="value in streams" :key="value" :value="value">{{ t(`reweExport.streams.${value}`) }}</option></select></label></div>
        <ChartCard v-if="activityMonths.length" :title="t(`reweExport.streams.${stream}`)" :copy="t('reweExport.activityCopy')" :option="activityOption" />
        <div class="export-two-columns"><article v-for="group in [{ title: 'actions', rows: actions }, { title: 'pages', rows: pages }]" :key="group.title" class="export-card"><h3>{{ t(`reweExport.${group.title}`) }}</h3><ol class="export-ranking"><li v-for="row in group.rows" :key="row.value"><span :title="row.value">{{ activityLabel(row.value, group.title) }}</span><strong>{{ number(row.count) }}</strong></li></ol></article></div>
        <article class="export-card"><h2>{{ t('reweExport.locations') }}</h2><p>{{ t('reweExport.locationCopy') }}</p><ol class="export-ranking"><li v-for="row in cities" :key="row.value"><span>{{ row.value }}</span><strong>{{ number(row.count) }}</strong></li></ol></article>
        <article class="export-card"><h2>{{ t('reweExport.inspect') }}</h2><p>{{ t('reweExport.originalProfileCopy') }}</p><details v-for="(row, index) in activityRows.slice(0, activityLimit)" :key="index" class="export-record"><summary>{{ row.timestamp }} · {{ row.fields['Page name'] ?? row.fields.EVENT_NAME ?? row.recordId }}</summary><p class="fine-print">{{ source(row.origin) }} · {{ row.recordId }}</p><dl class="export-facts"><div v-for="(value, field) in row.fields" :key="field"><dt>{{ field }}</dt><dd>{{ value }}</dd></div></dl></details><button v-if="activityRows.length > activityLimit" class="button secondary" type="button" @click="activityLimit += 20">{{ t('reweExport.showMore') }}</button></article>
      </template>
    </section>

    <details class="export-card export-import-details"><summary>{{ t('reweExport.importDetails') }} · {{ t('reweExport.importedFiles', { count: data.files.length }) }}</summary><p v-if="skipped">{{ t('reweExport.skippedCopy', { count: skipped }) }}</p><div class="export-table-scroll" tabindex="0" :aria-label="t('reweExport.tableScroll')"><table class="export-table"><thead><tr><th>{{ t('reweExport.source') }}</th><th>{{ t('reweExport.recognized') }}</th><th>{{ t('reweExport.skipped') }}</th></tr></thead><tbody><tr v-for="(file, index) in data.files" :key="index"><td>{{ file.name }}</td><td>{{ file.recognizedTables }}</td><td>{{ file.skippedRows }}</td></tr></tbody></table></div></details>
  </section>
</template>
