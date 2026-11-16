<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExportFormat } from './format'
import { useExportRoute } from './navigation'
import { exportDevices } from '../../domain/receipts/reweExport/analytics'
import { exportProfileCards } from '../../domain/receipts/reweExport/profile'
import type { ReweExport } from '../../domain/receipts/reweExport/schema'

const props = defineProps<{ data: ReweExport }>()
const { t } = useI18n()
const { navigate } = useExportRoute()
const { date, number, factValue } = useExportFormat()

// The labels anyone understands at a glance lead; the rest follow in a fixed order.
const leading = ['priceSensitivity', 'organic']
const following = ['pricePreference', 'household', 'age', 'power', 'budget', 'share', 'loyalty', 'frequency', 'primaryMarket']
const cards = computed(() => exportProfileCards(props.data).filter((card) => card.fact.value.trim()))
const highlights = computed(() => leading.flatMap((id) => cards.value.filter((card) => card.id === id)))
const labels = computed(() => following.flatMap((id) => cards.value.filter((card) => card.id === id)))
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
const empty = computed(() => !counts.value.length && !cards.value.length)
</script>

<template>
  <section id="export-panel-summary" role="tabpanel" aria-labelledby="export-tab-summary" class="export-rewe-summary">
    <header class="export-card-heading"><h2>{{ t('reweExport.summary.title') }}</h2><button v-if="cards.length" class="export-drill" type="button" @click="navigate({ view: 'profile' })">{{ t('reweExport.summary.allProfile') }} →</button></header>
    <p v-if="empty">{{ t('reweExport.noProfile') }}</p>

    <div v-if="highlights.length" class="export-rewe-highlights">
      <article v-for="card in highlights" :key="card.id" :data-label="card.id">
        <h3>{{ t(`reweExport.profileLabels.${card.id}`) }}</h3>
        <strong>{{ factValue(card.fact) }}</strong>
      </article>
    </div>

    <dl v-if="labels.length" class="export-card export-rewe-labels">
      <div v-for="card in labels" :key="card.id" :data-label="card.id"><dt>{{ t(`reweExport.profileLabels.${card.id}`) }}</dt><dd>{{ factValue(card.fact) }}</dd></div>
    </dl>

    <section v-if="counts.length" class="stat-grid export-rewe-counts">
      <button v-for="entry in counts" :key="entry.id" type="button" class="export-count" @click="navigate({ view: entry.view })">
        <span>{{ t(`reweExport.summary.counts.${entry.id}`) }}</span><strong>{{ number(entry.value) }}</strong><small>{{ t('reweExport.summary.open') }} →</small>
      </button>
    </section>

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
