<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExportFormat } from './format'
import { useExportRoute } from './navigation'
import { exportDevices } from '../../domain/receipts/reweExport/analytics'
import { exportProfileCards } from '../../domain/receipts/reweExport/profile'
import { exportRealityChecks } from '../../domain/receipts/reweExport/realityCheck'
import type { ReweExport } from '../../domain/receipts/reweExport/schema'

const props = defineProps<{ data: ReweExport }>()
const { t } = useI18n()
const { navigate } = useExportRoute()
const { money, roundMoney, short, share, date, number, factValue } = useExportFormat()

const checks = computed(() => exportRealityChecks(props.data))
const cards = computed(() => exportProfileCards(props.data).filter((card) => card.fact.value.trim()))
const labels = computed(() => cards.value.filter((card) => ['preferences', 'estimates'].includes(card.group) && card.id !== 'budget'))
const devices = computed(() => exportDevices(props.data.activities))
const granted = computed(() => props.data.consents.filter((consent) => consent.granted).length)
const activityRange = computed(() => {
  const stamps = props.data.activities.map((row) => row.timestamp).filter((value) => /^\d{4}-\d{2}-\d{2}/.test(value)).sort()
  return stamps.length ? { first: stamps[0]!, last: stamps.at(-1)! } : null
})
const counts = computed(() => [
  { id: 'facts', value: props.data.facts.length, view: 'profile' as const },
  { id: 'interests', value: props.data.interests.length, view: 'profile' as const },
  { id: 'consents', value: props.data.consents.length, view: 'profile' as const },
  { id: 'records', value: props.data.activities.length, view: 'activity' as const },
].filter((entry) => entry.value > 0))
const empty = computed(() => !counts.value.length && !checks.value.length)
</script>

<template>
  <section id="export-panel-summary" role="tabpanel" aria-labelledby="export-tab-summary" class="export-rewe-summary">
    <h2>{{ t('reweExport.summary.title') }}</h2>
    <p class="export-explanation">{{ t('reweExport.summary.copy') }}</p>
    <p v-if="empty">{{ t('reweExport.noProfile') }}</p>

    <section v-if="counts.length" class="stat-grid export-rewe-counts">
      <button v-for="entry in counts" :key="entry.id" type="button" class="export-count" @click="navigate({ view: entry.view })">
        <span>{{ t(`reweExport.summary.counts.${entry.id}`) }}</span><strong>{{ number(entry.value) }}</strong><small>{{ t('reweExport.summary.open') }} →</small>
      </button>
    </section>

    <section v-if="checks.length" class="export-reality">
      <h2>{{ t('reweExport.summary.checksTitle') }}</h2>
      <p class="export-explanation">{{ t('reweExport.summary.checksCopy') }}</p>
      <article v-for="check in checks" :key="check.id" class="export-reality-check" :data-check="check.id">
        <h3>{{ t(`reweExport.summary.checks.${check.id}.title`) }}</h3>
        <div class="export-reality-sides">
          <section>
            <h4>{{ t('reweExport.summary.reweSays') }}</h4>
            <template v-if="check.id === 'budget'">
              <strong>{{ t('reweExport.summary.checks.budget.rewe', { budget: roundMoney(check.budgetCents) }) }}</strong>
              <p v-if="check.share && check.impliedCents !== null">{{ t('reweExport.summary.checks.budget.reweShare', { share: share(Number(check.share.value)), amount: roundMoney(check.impliedCents) }) }}</p>
            </template>
            <strong v-else-if="check.id === 'market'">{{ check.assigned.value }}</strong>
            <strong v-else>{{ factValue(check.segment) }}</strong>
          </section>
          <section>
            <h4>{{ t('reweExport.summary.dataSays') }}</h4>
            <template v-if="check.id === 'budget'">
              <strong>{{ t('reweExport.summary.checks.budget.data', { amount: roundMoney(check.typicalCents) }) }}</strong>
              <p>{{ t('reweExport.summary.checks.budget.dataShare', { share: share(check.observedShare), months: check.months }) }}</p>
            </template>
            <template v-else-if="check.id === 'market'">
              <strong>{{ check.top }}</strong>
              <p>{{ t('reweExport.summary.checks.market.data', { share: share(check.topShare), markets: check.markets }) }}</p>
              <p class="export-reality-verdict">{{ t(check.same ? 'reweExport.summary.checks.market.same' : 'reweExport.summary.checks.market.different') }}</p>
            </template>
            <template v-else-if="check.id === 'frequency'">
              <strong>{{ t('reweExport.summary.checks.frequency.data', { trips: short(check.tripsPerMonth), amount: money(check.tripCents) }) }}</strong>
              <p v-if="check.gapDays !== null">{{ t('reweExport.summary.checks.frequency.gap', { days: short(check.gapDays) }) }}</p>
            </template>
            <template v-else>
              <strong>{{ t(`reweExport.summary.checks.${check.id}.data`, { share: share(check.share) }) }}</strong>
              <p>{{ check.products ? t(`reweExport.summary.checks.${check.id}.products`, { count: check.products, examples: check.examples.join(', ') }, check.products) : t(`reweExport.summary.checks.${check.id}.none`) }}</p>
            </template>
          </section>
        </div>
      </article>
      <p class="fine-print">{{ t('reweExport.summary.checksNote') }}</p>
    </section>

    <article v-if="labels.length" class="export-card">
      <header class="export-card-heading"><h2>{{ t('reweExport.summary.labelsTitle') }}</h2><button class="export-drill" type="button" @click="navigate({ view: 'profile' })">{{ t('reweExport.summary.allProfile') }} →</button></header>
      <dl class="export-rewe-labels"><div v-for="card in labels" :key="card.id"><dt>{{ t(`reweExport.profileLabels.${card.id}`) }}</dt><dd>{{ factValue(card.fact) }}</dd></div></dl>
    </article>

    <div class="export-two-columns">
      <article v-if="data.activities.length" class="export-card">
        <header class="export-card-heading"><h2>{{ t('reweExport.summary.trailTitle') }}</h2><button class="export-drill" type="button" @click="navigate({ view: 'activity' })">{{ t('reweExport.summary.open') }} →</button></header>
        <p v-if="activityRange">{{ t('reweExport.summary.trailRange', { count: number(data.activities.length), first: date(activityRange.first), last: date(activityRange.last) }) }}</p>
        <p v-if="devices.length">{{ t('reweExport.summary.trailDevices', { devices: devices.map((device) => device.name).join(', ') }) }}</p>
      </article>
      <article v-if="data.consents.length" class="export-card">
        <header class="export-card-heading"><h2>{{ t('reweExport.consents') }}</h2><button class="export-drill" type="button" @click="navigate({ view: 'profile' })">{{ t('reweExport.summary.open') }} →</button></header>
        <p>{{ t('reweExport.summary.consents', { granted, total: data.consents.length }) }}</p>
      </article>
    </div>
  </section>
</template>
