<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ReweExport } from '../../domain/receipts/reweExport/schema'
import { exportOverview } from '../../domain/receipts/reweExport/overview'
import { profileValueToken } from '../../domain/receipts/reweExport/profile'

const props = defineProps<{ data: ReweExport }>()
const { t, locale } = useI18n()
const overview = computed(() => exportOverview(props.data))
const localeName = computed(() => locale.value === 'de' ? 'de-DE' : 'en-GB')
const money = (cents: number) => new Intl.NumberFormat(localeName.value, { style: 'currency', currency: 'EUR' }).format(cents / 100)
const number = (value: number) => new Intl.NumberFormat(localeName.value, { maximumFractionDigits: 3 }).format(value)
const date = (value: string) => new Intl.DateTimeFormat(localeName.value, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`))
const bonusCoverage = computed(() => overview.value.bonus && (!overview.value.summary || overview.value.bonus.firstDate !== overview.value.summary.firstDate || overview.value.bonus.lastDate !== overview.value.summary.lastDate))
const classifications = computed(() => overview.value.classifications.map((card) => {
  const token = locale.value === 'en' ? profileValueToken(card.fact) : undefined
  return { id: card.id, value: token ? t(`reweExport.values.${token}`) : card.fact.value }
}))
</script>

<template>
  <article class="export-overview" aria-labelledby="export-overview-title">
    <header class="export-overview-heading">
      <div><p class="eyebrow">{{ t('reweExport.overview.kicker') }}</p><h1 id="export-overview-title">{{ t('reweExport.overview.title') }}</h1></div>
    </header>
    <p v-if="overview.summary" class="export-overview-period">{{ t('reweExport.overview.purchasePeriod') }} · {{ date(overview.summary.firstDate!) }} – {{ date(overview.summary.lastDate!) }}</p>
    <div v-if="overview.summary || overview.bonus" class="export-overview-totals">
      <section v-if="overview.summary" class="export-overview-spend"><h2>{{ t('reweExport.overview.spend') }}</h2><strong>{{ money(overview.summary.totalCents) }}</strong></section>
      <section v-if="overview.bonus" class="export-overview-bonus"><h2>{{ t('reweExport.overview.bonus') }}</h2><strong>{{ money(overview.bonus.cents) }}</strong><small v-if="bonusCoverage">{{ date(overview.bonus.firstDate) }} – {{ date(overview.bonus.lastDate) }}</small></section>
    </div>
    <dl v-if="overview.summary" class="export-overview-counts">
      <div><dt>{{ t('reweExport.days') }}</dt><dd>{{ number(overview.summary.days) }}</dd></div>
      <div><dt>{{ t('reweExport.overview.markets') }}</dt><dd>{{ number(overview.summary.markets) }}</dd></div>
      <div><dt>{{ t('reweExport.overview.products') }}</dt><dd>{{ number(overview.summary.products) }}</dd></div>
    </dl>
    <div v-if="overview.regular || overview.market" class="export-overview-favourites">
      <section v-if="overview.regular" class="export-overview-regular"><h2>{{ t('reweExport.overview.regular') }}</h2><h3>{{ overview.regular.name }}</h3><p>{{ t('reweExport.overview.regularDays', { count: overview.regular.days }) }}</p><small>{{ number(overview.regular.quantity) }} {{ t(`reweExport.unit.${overview.regular.unit}`) }}</small></section>
      <section v-if="overview.market" class="export-overview-market"><h2>{{ t(overview.market.assigned ? 'reweExport.overview.assignedMarket' : 'reweExport.overview.visitedMarket') }}</h2><h3>{{ overview.market.name }}</h3></section>
    </div>
    <section v-if="classifications.length" class="export-overview-classifications"><h2>{{ t('reweExport.overview.classifications') }}</h2><dl><div v-for="card in classifications" :key="card.id"><dt>{{ t(`reweExport.profileLabels.${card.id}`) }}</dt><dd>{{ card.value }}</dd></div></dl></section>
    <footer class="export-overview-footer"><p v-if="overview.interactionRecords !== null"><strong>{{ number(overview.interactionRecords) }}</strong> {{ t('reweExport.overview.records') }}</p><span>{{ t('reweExport.overview.attribution') }}</span></footer>
  </article>
</template>
