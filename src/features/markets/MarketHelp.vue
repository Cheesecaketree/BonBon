<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import packageInfo from '../../../package.json'
import { extractMarketReference } from '../../domain/receipts/parser'
import { formatMarketFullName, getMarketData, isKnownMarket, marketReferenceIsRedundant, parseMarketReference, sanitizeMarketReference } from '../../domain/receipts/markets'
import {
  MARKET_OBSERVATION_CONSENT_VERSION,
  MARKET_OBSERVATION_SCHEMA_VERSION,
  marketObservationDetailsSchema,
  marketObservationSubmissionSchema,
  normalizeMarketObservation,
  type MarketObservationDetails,
  type MarketObservationSubmission,
} from '../../domain/receipts/marketObservationSchema'
import { deleteLocalMarketMatch, getStoredLocalMarketMatches, saveLocalMarketMatch } from '../../domain/receipts/marketContributions'
import { completeMarketMappingSchema, type MarketData } from '../../domain/receipts/marketSchema'
import type { Receipt } from '../../domain/receipts/types'
import { submitMarketObservations } from '../../services/marketContributions'

const props = defineProps<{ receipts: Receipt[]; pdfFiles?: Map<string, File> }>()
defineEmits<{ navigate: []; uploadReceipts: [] }>()
const { t, locale } = useI18n()
const endpoint = import.meta.env.VITE_MARKET_CONTRIBUTION_API_URL?.trim() || ''

type PageMode = 'simple' | 'advanced'
type ObservationDraft = { key: string; text: string; filename: string; included: boolean }
type DetailsDraft = { name: string; street: string; houseNumber: string; zip: string; city: string; country: string }

const mode = ref<PageMode>('simple')
const observationDrafts = ref<Record<string, ObservationDraft[]>>({})
const detailsDrafts = ref<Record<string, DetailsDraft>>({})
const storedMatches = ref(getStoredLocalMarketMatches())
const referencesLoading = ref(false)
const consent = ref(false)
const submitting = ref(false)
const submissionError = ref('')
const submittedId = ref('')
const submissionClientId = ref(crypto.randomUUID())
const viewer = ref<{ marketId: string; filename: string; url: string } | null>(null)
let referenceLoadVersion = 0

const receiptMarkets = computed(() => {
  const grouped = new Map<string, Receipt[]>()
  for (const receipt of props.receipts) grouped.set(receipt.marketId, [...(grouped.get(receipt.marketId) || []), receipt])
  return [...grouped].map(([id, receipts]) => ({ id, receipts, known: isKnownMarket(id), bundled: getMarketData(id) }))
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }))
})

watch(
  () => [props.receipts, props.pdfFiles] as const,
  async () => {
    const version = ++referenceLoadVersion
    const files = props.pdfFiles
    observationDrafts.value = {}
    consent.value = false
    submittedId.value = ''
    if (!files?.size || !receiptMarkets.value.length) {
      referencesLoading.value = false
      return
    }
    referencesLoading.value = true
    const next: Record<string, ObservationDraft[]> = {}
    const { extractPdfText } = await import('../../services/pdf/extractText')
    await Promise.all(receiptMarkets.value.map(async (market) => {
      const distinct = new Map<string, ObservationDraft>()
      for (const receipt of market.receipts) {
        const file = files.get(receipt.filename)
        if (!file) continue
        try {
          const text = extractMarketReference(await extractPdfText(file))
          if (!text) continue
          const normalized = normalizeMarketObservation(text)
          if (!distinct.has(normalized)) {
            distinct.set(normalized, { key: `${market.id}-${distinct.size}`, text, filename: receipt.filename, included: true })
          }
        } catch {
          // One unreadable PDF must not prevent observations from other receipts.
        }
      }
      if (distinct.size) next[market.id] = [...distinct.values()]
    }))
    if (version === referenceLoadVersion) {
      observationDrafts.value = next
      referencesLoading.value = false
    }
  },
  { immediate: true },
)

function availableReceipts(receipts: Receipt[]) {
  if (!props.pdfFiles) return []
  return [...new Map(receipts.filter((receipt) => props.pdfFiles?.has(receipt.filename)).map((receipt) => [receipt.filename, receipt])).values()]
}

function detailsFor(marketId: string): DetailsDraft {
  if (detailsDrafts.value[marketId]) return detailsDrafts.value[marketId]
  const stored = storedMatches.value[marketId]
  const bundled = getMarketData(marketId)
  const firstObservation = observationDrafts.value[marketId]?.[0]?.text
  const parsed = stored || bundled || (firstObservation ? parseMarketReference(firstObservation) : undefined)
  return {
    name: parsed?.name || '',
    street: parsed?.street || '',
    houseNumber: parsed?.houseNumber || '',
    zip: parsed?.zip || '',
    city: parsed?.city || '',
    country: parsed?.country || 'DE',
  }
}

function updateDetails(marketId: string, field: keyof DetailsDraft, value: string) {
  detailsDrafts.value[marketId] = { ...detailsFor(marketId), [field]: value }
  submittedId.value = ''
}

function updateObservation(marketId: string, key: string, value: string) {
  const current = observationDrafts.value[marketId]?.find((item) => item.key === key)
  if (current && current.text === value) return
  observationDrafts.value[marketId] = (observationDrafts.value[marketId] || []).map((item) => item.key === key ? { ...item, text: value } : item)
  consent.value = false
  submittedId.value = ''
}

function sanitizeObservation(marketId: string, key: string) {
  const observation = observationDrafts.value[marketId]?.find((item) => item.key === key)
  if (!observation) return
  const sanitized = sanitizeMarketReference(observation.text)
  if (sanitized !== observation.text) {
    updateObservation(marketId, key, sanitized)
  }
}

function toggleObservation(marketId: string, key: string) {
  observationDrafts.value[marketId] = (observationDrafts.value[marketId] || []).map((item) => item.key === key ? { ...item, included: !item.included } : item)
  consent.value = false
  submittedId.value = ''
}

function detailsPayload(marketId: string): MarketObservationDetails | undefined {
  if (mode.value !== 'advanced') return undefined
  const draft = detailsDrafts.value[marketId]
  if (!draft) return undefined
  const values = Object.fromEntries(Object.entries(draft).map(([key, value]) => [key, value.trim()]).filter(([, value]) => value))
  if (!Object.keys(values).length) return undefined
  const parsed = marketObservationDetailsSchema.safeParse(values)
  return parsed.success ? parsed.data : undefined
}

function detailsDifferFromBundled(details: MarketObservationDetails | undefined, bundled: MarketData | undefined) {
  if (!details || !bundled) return false
  return Object.entries(details).some(([field, value]) => (
    normalizeMarketObservation(value) !== normalizeMarketObservation(String(bundled[field as keyof MarketObservationDetails] || ''))
  ))
}

function includedTexts(marketId: string, retainExactMatches = false) {
  const distinct = new Map<string, string>()
  const bundled = getMarketData(marketId)
  for (const observation of observationDrafts.value[marketId] || []) {
    const text = sanitizeMarketReference(observation.text)
    if (!observation.included || text.length < 2) continue
    if (!retainExactMatches && bundled && marketReferenceIsRedundant(text, bundled)) continue
    const normalized = normalizeMarketObservation(text)
    if (!distinct.has(normalized)) distinct.set(normalized, text)
  }
  return [...distinct.values()]
}

function observationIsRedundant(marketId: string, text: string) {
  const bundled = getMarketData(marketId)
  return Boolean(bundled && marketReferenceIsRedundant(text, bundled))
}

function visibleObservations(marketId: string) {
  const observations = observationDrafts.value[marketId] || []
  if (mode.value === 'advanced') return observations
  return observations.filter((observation) => !observationIsRedundant(marketId, observation.text))
}

const visibleMarkets = computed(() => receiptMarkets.value.filter((market) => (
  mode.value === 'advanced' || !market.known || visibleObservations(market.id).length > 0 || viewer.value?.marketId === market.id
)))

const preparedSubmission = computed<MarketObservationSubmission | null>(() => {
  const markets = receiptMarkets.value.flatMap((market) => {
    const details = detailsPayload(market.id)
    const texts = includedTexts(market.id, detailsDifferFromBundled(details, market.bundled))
    if (!texts.length) return []
    return [{
      retailer: 'rewe' as const,
      marketId: market.id,
      observations: texts.slice(0, 20).map((text) => ({ text })),
      ...(details ? { details } : {}),
    }]
  }).slice(0, 50)
  if (!markets.length) return null
  const parsed = marketObservationSubmissionSchema.safeParse({
    schemaVersion: MARKET_OBSERVATION_SCHEMA_VERSION,
    clientSubmissionId: submissionClientId.value,
    appVersion: packageInfo.version,
    locale: locale.value === 'en' ? 'en' : 'de',
    consent: { confirmed: true, version: MARKET_OBSERVATION_CONSENT_VERSION },
    markets,
  })
  return parsed.success ? parsed.data : null
})

const preparedCount = computed(() => preparedSubmission.value?.markets.reduce((sum, market) => sum + market.observations.length, 0) || 0)
const preparedMarketCount = computed(() => preparedSubmission.value?.markets.length || 0)

function marketDataFromDraft(marketId: string): MarketData {
  const draft = detailsFor(marketId)
  return {
    name: draft.name.trim() || 'REWE', street: draft.street.trim() || null, houseNumber: draft.houseNumber.trim() || null,
    zip: draft.zip.trim() || null, city: draft.city.trim() || null, country: draft.country.trim().toUpperCase() || null,
    lat: null, long: null,
  }
}

function canSaveLocal(marketId: string) {
  return !isKnownMarket(marketId) && completeMarketMappingSchema.safeParse(marketDataFromDraft(marketId)).success
}

function saveLocal(marketId: string) {
  if (!canSaveLocal(marketId)) return
  const result = saveLocalMarketMatch(marketId, marketDataFromDraft(marketId))
  if (result.ok) storedMatches.value = getStoredLocalMarketMatches()
}

function resetLocal(marketId: string) {
  deleteLocalMarketMatch(marketId)
  storedMatches.value = getStoredLocalMarketMatches()
  delete detailsDrafts.value[marketId]
}

function submissionJson() { return preparedSubmission.value ? JSON.stringify(preparedSubmission.value, null, 2) : '' }

function downloadSubmission() {
  const blob = new Blob([submissionJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `bonbon-market-observations-${new Date().toISOString().slice(0, 10)}.json`
  link.click()
  URL.revokeObjectURL(url)
}

async function submit() {
  if (!endpoint || !consent.value || !preparedSubmission.value || submitting.value) return
  submitting.value = true
  submissionError.value = ''
  try {
    const result = await submitMarketObservations(endpoint, preparedSubmission.value)
    submittedId.value = result.submissionId
    submissionClientId.value = crypto.randomUUID()
    consent.value = false
  } catch (error) {
    submissionError.value = error instanceof Error ? error.message : String(error)
  } finally {
    submitting.value = false
  }
}

function openReceipt(marketId: string, receipt: Receipt | undefined) {
  if (!receipt) return
  const file = props.pdfFiles?.get(receipt.filename)
  if (!file) return
  closeReceipt()
  viewer.value = { marketId, filename: receipt.filename, url: URL.createObjectURL(file) }
}

function closeReceipt() {
  if (!viewer.value) return
  URL.revokeObjectURL(viewer.value.url)
  viewer.value = null
}

onBeforeUnmount(() => { referenceLoadVersion += 1; closeReceipt() })
</script>

<template>
  <section class="market-help-page" :class="[`market-mode-${mode}`, { 'has-receipt-viewer': viewer }]">
    <div class="market-help-content">
    <button class="back-link" type="button" @click="$emit('navigate')">← {{ t('backToDashboard') }}</button>
    <header class="market-help-header market-observation-header">
      <div><p class="eyebrow">BONBON · COMMUNITY</p><h1>{{ t('marketObservationTitle') }}</h1><p>{{ t('marketObservationIntro') }}</p></div>
      <div class="market-mode-toggle" :aria-label="t('marketModeLabel')">
        <button type="button" :class="{ active: mode === 'simple' }" :aria-pressed="mode === 'simple'" @click="mode = 'simple'">{{ t('simpleMode') }}</button>
        <button type="button" :class="{ active: mode === 'advanced' }" :aria-pressed="mode === 'advanced'" @click="mode = 'advanced'">{{ t('advancedMode') }}</button>
      </div>
    </header>
    <aside class="market-data-explainer review-guide"><div><span class="market-data-icon" aria-hidden="true">1</span><div><h2>{{ t('observationGuideTitle') }}</h2><p>{{ t('observationGuideCopy') }}</p></div></div></aside>
    <aside class="market-data-explainer"><div><span class="market-data-icon" aria-hidden="true">i</span><div><h2>{{ t('observationPrivacyTitle') }}</h2><p>{{ t('observationPrivacyCopy') }}</p></div></div></aside>

    <div v-if="!receipts.length" class="market-help-empty"><h2>{{ t('marketHelpNoReceiptsTitle') }}</h2><p>{{ t('marketHelpNoReceiptsCopy') }}</p></div>
    <div v-else-if="referencesLoading" class="market-help-empty"><h2>{{ t('extractingMarketsTitle') }}</h2><p>{{ t('extractingReference') }}</p></div>
    <div v-else-if="mode === 'simple' && !visibleMarkets.length" class="market-help-empty market-help-complete"><h2>{{ t('noMarketReviewNeededTitle') }}</h2><p>{{ t('noMarketReviewNeededCopy') }}</p></div>
    <div v-else class="market-help-list">
      <p class="market-missing-summary" role="status">{{ t('observationSummary', { markets: preparedMarketCount, observations: preparedCount }) }}</p>
      <p v-if="mode === 'advanced'" class="advanced-mode-explanation">{{ t('advancedModeExplanation') }}</p>
      <div v-for="market in visibleMarkets" :key="market.id" class="market-review-row" :class="{ 'viewer-open': viewer?.marketId === market.id }">
      <article class="market-help-card observation-market-card">
        <div class="market-help-card-heading">
          <div><h2 class="market-card-title">{{ t('market') }} {{ market.id }}</h2><p>{{ t('marketSeenOnReceipts', { count: market.receipts.length }) }}</p></div>
          <span class="dataset-status" :class="market.known ? 'known' : 'missing'">{{ t(market.known ? 'knownInDataset' : 'missingFromDataset') }}</span>
        </div>
        <p v-if="viewer?.marketId === market.id" class="receipt-open-indicator">↗ {{ t('receiptOpenIndicator') }}</p>
        <p v-if="market.bundled" class="bundled-market-reference"><strong>{{ t('bundledMapping') }}:</strong> {{ formatMarketFullName(market.bundled) }}</p>
        <p class="market-action-help">{{ t(market.known ? 'knownDifferenceHelp' : 'unknownObservationHelp') }}</p>
        <p v-if="referencesLoading && !observationDrafts[market.id]?.length" class="receipt-reference-state">{{ t('extractingReference') }}</p>
        <section v-for="observation in visibleObservations(market.id)" :key="observation.key" class="observation-editor" :class="{ excluded: !observation.included, redundant: observationIsRedundant(market.id, observation.text), 'receipt-open': viewer?.marketId === market.id && viewer.filename === observation.filename }">
          <div class="observation-editor-heading"><div><label :for="`observation-${observation.key}`">{{ t('extractedObservation') }}</label><small>{{ t('extractedObservationCopy') }}</small></div><span v-if="observationIsRedundant(market.id, observation.text)" class="observation-match-badge">✓ {{ t('alreadyMatchesDataset') }}</span><button v-else class="text-button" type="button" @click="toggleObservation(market.id, observation.key)">{{ t(observation.included ? 'excludeObservation' : 'includeObservation') }}</button></div>
          <textarea :id="`observation-${observation.key}`" :value="observation.text" rows="3" :disabled="!observation.included" maxlength="500" @input="updateObservation(market.id, observation.key, ($event.target as HTMLTextAreaElement).value)" @blur="sanitizeObservation(market.id, observation.key)" />
          <button class="text-button open-observation-receipt" type="button" :aria-pressed="viewer?.marketId === market.id && viewer.filename === observation.filename" @click="openReceipt(market.id, market.receipts.find((receipt) => receipt.filename === observation.filename))">{{ t(viewer?.marketId === market.id && viewer.filename === observation.filename ? 'receiptShownBeside' : 'openReceiptPdf') }}</button>
        </section>
        <div v-if="!referencesLoading && !observationDrafts[market.id]?.length" class="receipt-reference-state">
          <template v-if="availableReceipts(market.receipts).length"><p>{{ t('referenceNotFound') }}</p><button v-for="receipt in availableReceipts(market.receipts)" :key="receipt.filename" class="text-button" type="button" @click="openReceipt(market.id, receipt)">{{ t('openReceiptPdfNamed', { filename: receipt.filename }) }}</button></template>
          <template v-else><p>{{ t('receiptUnavailableCopy') }}</p><button class="button secondary" type="button" @click="$emit('uploadReceipts')">{{ t('reuploadReceipts') }}</button></template>
        </div>

        <fieldset v-if="mode === 'advanced'" class="market-address-form advanced-market-fields">
          <legend>{{ t('marketDetailsLabel') }}</legend>
          <label :for="`market-name-${market.id}`">{{ t('fieldName') }}</label><input :id="`market-name-${market.id}`" :value="detailsFor(market.id).name" @input="updateDetails(market.id, 'name', ($event.target as HTMLInputElement).value)" />
          <div class="market-form-row street"><div><label :for="`market-street-${market.id}`">{{ t('fieldStreet') }}</label><input :id="`market-street-${market.id}`" :value="detailsFor(market.id).street" @input="updateDetails(market.id, 'street', ($event.target as HTMLInputElement).value)" /></div><div><label :for="`market-house-${market.id}`">{{ t('fieldHouseNumber') }}</label><input :id="`market-house-${market.id}`" :value="detailsFor(market.id).houseNumber" @input="updateDetails(market.id, 'houseNumber', ($event.target as HTMLInputElement).value)" /></div></div>
          <div class="market-form-row city"><div><label :for="`market-zip-${market.id}`">{{ t('fieldZip') }}</label><input :id="`market-zip-${market.id}`" inputmode="numeric" :value="detailsFor(market.id).zip" @input="updateDetails(market.id, 'zip', ($event.target as HTMLInputElement).value)" /></div><div><label :for="`market-city-${market.id}`">{{ t('fieldCity') }}</label><input :id="`market-city-${market.id}`" :value="detailsFor(market.id).city" @input="updateDetails(market.id, 'city', ($event.target as HTMLInputElement).value)" /></div><div><label :for="`market-country-${market.id}`">{{ t('fieldCountry') }}</label><input :id="`market-country-${market.id}`" maxlength="2" :value="detailsFor(market.id).country" @input="updateDetails(market.id, 'country', ($event.target as HTMLInputElement).value)" /></div></div>
          <div v-if="!market.known" class="market-help-actions"><button class="button secondary" type="button" :disabled="!canSaveLocal(market.id)" @click="saveLocal(market.id)">{{ t(storedMatches[market.id] ? 'updateLocalMatch' : 'saveLocalMatch') }}</button><button v-if="storedMatches[market.id]" class="button delete-local-match" type="button" @click="resetLocal(market.id)">{{ t('deleteLocalMatch') }}</button><span v-if="storedMatches[market.id]" class="local-save-status saved">✓ {{ t('localMatchSaved') }}</span></div>
        </fieldset>
      </article>
      <aside v-if="viewer?.marketId === market.id" class="receipt-comparison-panel" role="region" :aria-label="t('receiptViewerLabel', { filename: viewer.filename })"><header><div><p class="eyebrow">{{ t('receiptViewerEyebrow') }} · {{ t('market') }} {{ viewer.marketId }}</p><h2>{{ viewer.filename }}</h2><p>{{ t('receiptComparisonCopy') }}</p></div><button class="close-button" type="button" :aria-label="t('close')" @click="closeReceipt">×</button></header><iframe :src="viewer.url" :title="t('receiptViewerLabel', { filename: viewer.filename })"></iframe></aside>
      </div>

      <section v-if="preparedSubmission" class="contribution-details observation-submit-panel">
        <h2>{{ t('submitObservations') }}</h2><p>{{ t('submitObservationPreview', { markets: preparedSubmission.markets.length, observations: preparedCount }) }}</p>
        <label class="observation-consent"><input v-model="consent" type="checkbox" /> <span>{{ t('observationConsent') }}</span></label>
        <div class="contribution-actions"><button v-if="endpoint" class="button primary" type="button" :disabled="!consent || submitting" @click="submit">{{ submitting ? t('submittingObservations') : t('submitObservations') }}</button><button class="text-button" type="button" :disabled="!consent" @click="downloadSubmission">{{ t('downloadSubmission') }}</button></div>
        <p v-if="!endpoint" class="submission-note">{{ t('submissionApiUnavailable') }}</p>
        <p v-if="submissionError" role="alert">{{ t('submissionFailed') }} {{ submissionError }} {{ t('downloadFallback') }}</p>
        <p v-if="submittedId" role="status">{{ t('submissionSucceeded') }} <code>{{ submittedId }}</code></p>
      </section>
    </div>

    </div>

  </section>
</template>
