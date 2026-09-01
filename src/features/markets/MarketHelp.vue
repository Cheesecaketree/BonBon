<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Receipt } from '../../domain/receipts/types'
import { getMarketDataset, isKnownMarket, parseMarketAddressString } from '../../domain/receipts/markets'
import {
  createMarketContributionFile,
  getStoredContributionDrafts,
  removeContributionDraft,
  saveContributionDraft,
  serializeMarketContribution,
} from '../../domain/receipts/marketContributions'
import { completeMarketMappingSchema, type MarketContribution, type MarketData } from '../../domain/receipts/marketSchema'

const props = defineProps<{ receipts: Receipt[] }>()
defineEmits<{ navigate: [] }>()
const { t } = useI18n()
const dataset = getMarketDataset()
const storedDrafts = ref(getStoredContributionDrafts())
type MarketDraft = { name: string; street: string; houseNumber: string; zip: string; city: string; country: string }
const drafts = ref<Record<string, MarketDraft>>({})
const includeHeaderEvidence = ref<Record<string, boolean>>({})
const savedId = ref<string | null>(null)
const saveError = ref<Record<string, string>>({})
const copied = ref(false)

const receiptMarkets = computed(() => {
  const byId = new Map<string, { id: string; count: number; headerExcerpts: Set<string> }>()
  for (const receipt of props.receipts) {
    const current = byId.get(receipt.marketId) || { id: receipt.marketId, count: 0, headerExcerpts: new Set<string>() }
    current.count += 1
    const excerpt = receipt.marketHeaderExcerpt || receipt.marketName
    if (excerpt?.trim()) current.headerExcerpts.add(excerpt.trim())
    byId.set(receipt.marketId, current)
  }
  return [...byId.values()].map((market) => ({ ...market, headerExcerpts: [...market.headerExcerpts] }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
})

const missingMarkets = computed(() => receiptMarkets.value.filter((market) => !isKnownMarket(market.id)))

function emptyDraft(): MarketDraft {
  return { name: '', street: '', houseNumber: '', zip: '', city: '', country: 'DE' }
}

function getDraft(id: string): MarketDraft {
  if (drafts.value[id]) return drafts.value[id]
  const source = storedDrafts.value[id]
  return source ? {
    name: source.name,
    street: source.street || '',
    houseNumber: source.houseNumber || '',
    zip: source.zip || '',
    city: source.city || '',
    country: source.country || 'DE',
  } : emptyDraft()
}

function updateDraft(id: string, field: keyof MarketDraft, value: string) {
  drafts.value[id] = { ...getDraft(id), [field]: value }
  delete saveError.value[id]
}

function draftToMarketData(id: string): MarketData {
  const draft = getDraft(id)
  return {
    name: draft.name.trim(),
    street: draft.street.trim() || null,
    houseNumber: draft.houseNumber.trim() || null,
    zip: draft.zip.trim() || null,
    city: draft.city.trim() || null,
    country: draft.country.trim().toUpperCase() || null,
    lat: null,
    long: null,
  }
}

function draftIsComplete(id: string) {
  return completeMarketMappingSchema.safeParse(draftToMarketData(id)).success
}

function useHeaderAsStartingPoint(id: string, excerpt: string) {
  const parsed = parseMarketAddressString(excerpt)
  drafts.value[id] = {
    name: parsed.name,
    street: parsed.street || '',
    houseNumber: parsed.houseNumber || '',
    zip: parsed.zip || '',
    city: parsed.city || '',
    country: parsed.country || 'DE',
  }
}

function save(id: string) {
  const result = saveContributionDraft(id, draftToMarketData(id))
  if (!result.ok) {
    saveError.value[id] = result.message
    return
  }
  storedDrafts.value = getStoredContributionDrafts()
  savedId.value = id
  window.setTimeout(() => { if (savedId.value === id) savedId.value = null }, 2500)
}

function reset(id: string) {
  removeContributionDraft(id)
  storedDrafts.value = getStoredContributionDrafts()
  delete drafts.value[id]
  delete saveError.value[id]
}

const contributions = computed<MarketContribution[]>(() => missingMarkets.value.flatMap((market) => {
  const mapping = storedDrafts.value[market.id] || null
  const evidence = includeHeaderEvidence.value[market.id] && market.headerExcerpts.length
    ? { headerExcerpts: market.headerExcerpts, personalDataReviewed: true as const }
    : null
  if (!mapping && !evidence) return []
  return [{ retailer: 'rewe' as const, marketId: market.id, mapping, evidence }]
}))

const contributionFile = computed(() => contributions.value.length
  ? createMarketContributionFile(dataset.datasetVersion, contributions.value)
  : null)
const contributionJson = computed(() => contributionFile.value ? serializeMarketContribution(contributionFile.value) : '')
const hasContributions = computed(() => Boolean(contributionFile.value))
const mailtoLink = computed(() => {
  const body = `${t('contributionEmailIntro')}\n\n${contributionJson.value}`
  return `mailto:bonbon@cheesecaketree.de?subject=${encodeURIComponent(t('contributionEmailSubject'))}&body=${encodeURIComponent(body)}`
})

async function copyContribution() {
  try {
    await navigator.clipboard.writeText(contributionJson.value)
    copied.value = true
    window.setTimeout(() => { copied.value = false }, 2500)
  } catch {
    window.prompt(t('copyJson'), contributionJson.value)
  }
}

function downloadContribution() {
  const blob = new Blob([contributionJson.value], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bonbon-market-contribution-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <section class="market-help-page">
    <button class="back-link" type="button" @click="$emit('navigate')">← {{ t('backToDashboard') }}</button>
    <header class="market-help-header">
      <p class="eyebrow">BONBON · COMMUNITY</p>
      <h1>{{ t('marketHelpTitle') }}</h1>
      <p>{{ t('marketHelpIntro') }}</p>
    </header>
    <aside class="market-data-explainer">
      <div><span class="market-data-icon" aria-hidden="true">?</span><div><h2>{{ t('marketDataWhyTitle') }}</h2><p>{{ t('marketDataWhyCopy') }}</p></div></div>
      <p class="market-data-boundary">{{ t('marketDataBoundary') }}</p>
    </aside>

    <div v-if="!receipts.length" class="market-help-empty"><h2>{{ t('marketHelpNoReceiptsTitle') }}</h2><p>{{ t('marketHelpNoReceiptsCopy') }}</p></div>
    <div v-else-if="!missingMarkets.length" class="market-help-empty"><h2>{{ t('marketHelpCompleteTitle') }}</h2><p>{{ t('marketHelpCompleteCopy') }}</p></div>
    <div v-else class="market-help-list">
      <p class="market-missing-summary" role="status">{{ t('marketDatasetSummary', { count: missingMarkets.length, total: receiptMarkets.length }) }}</p>
      <article v-for="market in missingMarkets" :key="market.id" class="market-help-card">
        <div class="market-help-card-heading"><div><span class="market-id-badge">#{{ market.id }}</span><h2>{{ t('market') }} {{ market.id }}</h2></div><span class="dataset-status missing">{{ t('missingFromDataset') }}</span></div>
        <p class="receipt-count-line">{{ t('marketSeenOnReceipts', { count: market.count }) }}</p>
        <p class="local-save-status" :class="{ saved: storedDrafts[market.id] }"><span aria-hidden="true">{{ storedDrafts[market.id] ? '✓' : '○' }}</span> {{ storedDrafts[market.id] ? t('contributionDraftSaved') : t('contributionDraftNotSaved') }}</p>

        <section v-if="market.headerExcerpts.length" class="raw-contribution-option">
          <div class="raw-contribution-heading"><div><strong>{{ t('rawContributionTitle') }}</strong><span>{{ t('unverifiedEvidence') }}</span></div><p>{{ t('rawContributionCopy') }}</p></div>
          <div v-for="(excerpt, index) in market.headerExcerpts" :key="excerpt">
            <pre>{{ excerpt }}</pre>
            <button v-if="index === 0" class="text-button" type="button" @click="useHeaderAsStartingPoint(market.id, excerpt)">{{ t('useAsStartingPoint') }}</button>
          </div>
          <label class="raw-opt-in" :for="`include-raw-${market.id}`"><input :id="`include-raw-${market.id}`" v-model="includeHeaderEvidence[market.id]" type="checkbox" /><span><strong>{{ t('includeRawExtraction') }}</strong><small>{{ t('includeRawExtractionPrivacy') }}</small></span></label>
        </section>

        <fieldset class="market-address-form">
          <legend>{{ t('marketDetailsLabel') }}</legend>
          <p>{{ t('marketDetailsFormCopy') }}</p>
          <label :for="`market-name-${market.id}`">{{ t('fieldName') }}</label>
          <input :id="`market-name-${market.id}`" :value="getDraft(market.id).name" required autocomplete="organization" @input="updateDraft(market.id, 'name', ($event.target as HTMLInputElement).value)" />
          <div class="market-form-row street">
            <div><label :for="`market-street-${market.id}`">{{ t('fieldStreet') }}</label><input :id="`market-street-${market.id}`" :value="getDraft(market.id).street" required autocomplete="address-line1" @input="updateDraft(market.id, 'street', ($event.target as HTMLInputElement).value)" /></div>
            <div><label :for="`market-house-${market.id}`">{{ t('fieldHouseNumber') }}</label><input :id="`market-house-${market.id}`" :value="getDraft(market.id).houseNumber" required @input="updateDraft(market.id, 'houseNumber', ($event.target as HTMLInputElement).value)" /></div>
          </div>
          <div class="market-form-row city">
            <div><label :for="`market-zip-${market.id}`">{{ t('fieldZip') }}</label><input :id="`market-zip-${market.id}`" :value="getDraft(market.id).zip" required inputmode="numeric" pattern="[0-9]{5}" autocomplete="postal-code" @input="updateDraft(market.id, 'zip', ($event.target as HTMLInputElement).value)" /></div>
            <div><label :for="`market-city-${market.id}`">{{ t('fieldCity') }}</label><input :id="`market-city-${market.id}`" :value="getDraft(market.id).city" required autocomplete="address-level2" @input="updateDraft(market.id, 'city', ($event.target as HTMLInputElement).value)" /></div>
            <div><label :for="`market-country-${market.id}`">{{ t('fieldCountry') }}</label><input :id="`market-country-${market.id}`" :value="getDraft(market.id).country" required minlength="2" maxlength="2" autocomplete="country" @input="updateDraft(market.id, 'country', ($event.target as HTMLInputElement).value)" /></div>
          </div>
        </fieldset>
        <div class="market-help-actions">
          <button class="button primary" type="button" :disabled="!draftIsComplete(market.id)" @click="save(market.id)">{{ t('saveContributionDraft') }}</button>
          <button v-if="storedDrafts[market.id]" class="text-button" type="button" @click="reset(market.id)">{{ t('deleteContributionDraft') }}</button>
          <span v-if="savedId === market.id" role="status">{{ t('savedInline') }}</span>
          <span v-if="saveError[market.id]" role="alert">{{ saveError[market.id] }}</span>
        </div>
      </article>
    </div>

    <details v-if="hasContributions" class="contribution-details" open>
      <summary>{{ t('optionalContribution') }}</summary><p>{{ t('optionalContributionCopy') }}</p>
      <div class="contribution-legend"><p><strong>{{ t('structuredContributionLabel') }}</strong>{{ t('structuredContributionExplanation') }}</p><p><strong>{{ t('rawContributionLabel') }}</strong>{{ t('rawContributionExplanation') }}</p></div>
      <div class="contribution-actions"><button class="button primary" type="button" @click="downloadContribution">{{ t('downloadContribution') }}</button><button class="text-button" type="button" @click="copyContribution">{{ copied ? t('copied') : t('copyContribution') }}</button><a class="text-button" :href="mailtoLink">{{ t('contributeByEmail') }}</a></div>
      <p>{{ t('contributionValidationCopy', { version: dataset.datasetVersion }) }}</p>
    </details>
  </section>
</template>
