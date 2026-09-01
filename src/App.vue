<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ImportStatus, Receipt } from './domain/receipts/types'
import { parseReweReceipt, receiptId } from './domain/receipts/parser'
import { isKnownMarket } from './domain/receipts/markets'
import { canonicalizeMarketId } from './domain/receipts/marketSchema'
import { clearContributionDrafts } from './domain/receipts/marketContributions'
import { clearPersistedData, loadPdfFiles, loadReceipts, savePdfFiles, saveReceipts } from './services/storage/database'
import { downloadReceiptExport, parseReceiptExport } from './services/storage/interchange'
import ImportPanel from './features/import/ImportPanel.vue'
const Dashboard = defineAsyncComponent(() => import('./features/dashboard/Dashboard.vue'))
const MarketHelp = defineAsyncComponent(() => import('./features/markets/MarketHelp.vue'))

const { t, locale } = useI18n()
const receipts = ref<Receipt[]>([])
const report = ref<ImportStatus[]>([])
const processing = ref(false)
const processed = ref(0)
const processingTotal = ref(0)
const jsonInput = ref<HTMLInputElement>()
const persistenceEnabled = ref(localStorage.getItem('bonbon-persistence-enabled') === 'true')
const notice = ref('')
const unknownMarketPromptCount = ref(0)
const activeLocale = computed(() => locale.value === 'en' ? 'en' as const : 'de' as const)
type AppView = 'dashboard' | 'market-help'
const currentView = ref<AppView>('dashboard')
const sessionFiles = ref<Map<string, File>>(new Map())

function normalizeReceiptMarketId(receipt: Receipt): Receipt {
  const marketId = canonicalizeMarketId(receipt.marketId) || receipt.marketId
  const marketHeaderExcerpt = receipt.marketHeaderExcerpt || receipt.marketName
  const { marketName: _legacyMarketName, ...rest } = receipt
  return {
    ...rest,
    marketId,
    id: receiptId(receipt.localTimestamp, marketId, receipt.receiptNumber),
    ...(marketHeaderExcerpt ? { marketHeaderExcerpt } : {}),
  }
}

function updateUnknownMarketPrompt(nextReceipts: Receipt[]) {
  unknownMarketPromptCount.value = new Set(nextReceipts.filter((receipt) => !isKnownMarket(receipt.marketId)).map((receipt) => receipt.marketId)).size
}

function syncRoute() {
  const hash = window.location.hash
  if (hash === '#/help/markets') {
    currentView.value = 'market-help'
  } else {
    currentView.value = 'dashboard'
  }
}

function setView(view: AppView) {
  currentView.value = view
  window.location.hash = view === 'market-help' ? '#/help/markets' : '#/'
}

onMounted(async () => {
  syncRoute()
  window.addEventListener('hashchange', syncRoute)
  document.documentElement.lang = activeLocale.value
  if (persistenceEnabled.value) {
    try {
      const [persistedReceipts, persistedPdfs] = await Promise.all([
        loadReceipts(),
        loadPdfFiles(),
      ])
      if (persistedReceipts.length) {
        receipts.value = persistedReceipts.map(normalizeReceiptMarketId).sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
        updateUnknownMarketPrompt(receipts.value)
      }
      if (persistedPdfs.size) {
        sessionFiles.value = persistedPdfs
      }
    } catch (error) {
      console.error('Failed to load persisted data from IndexedDB:', error)
    }
  }
})

watch(receipts, async (value) => {
  if (persistenceEnabled.value) {
    await saveReceipts(value)
  }
}, { deep: true })

function setLocale(next: 'de' | 'en') {
  locale.value = next
  localStorage.setItem('bonbon-locale', next)
  document.documentElement.lang = next
}

async function processFiles(files: File[]) {
  if (!files.length || processing.value) return
  for (const f of files) {
    sessionFiles.value.set(f.name, f)
  }
  if (persistenceEnabled.value) {
    await savePdfFiles(files)
  }
  processing.value = true
  const { extractPdfText } = await import('./services/pdf/extractText')
  processed.value = 0
  processingTotal.value = files.length
  report.value = []
  notice.value = ''
  const knownIds = new Set(receipts.value.map((receipt) => receipt.id))
  const imported: Receipt[] = []
  let index = 0

  async function worker() {
    while (index < files.length) {
      const file = files[index++]
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        report.value.push({ filename: file.name, status: 'failed', message: t('notPdf') })
        processed.value += 1
        continue
      }
      try {
        const text = await extractPdfText(file)
        const result = parseReweReceipt(text, file.name)
        if (!result.ok) {
          report.value.push({ filename: file.name, status: 'incomplete', message: t('missing', { fields: result.missing.join(', ') }) })
        } else if (knownIds.has(result.receipt.id)) {
          report.value.push({ filename: file.name, status: 'duplicate' })
        } else {
          knownIds.add(result.receipt.id)
          imported.push(result.receipt)
          report.value.push({ filename: file.name, status: 'imported' })
        }
      } catch (error) {
        const message = error instanceof Error && error.message === 'no-text' ? t('noText') : (error instanceof Error ? error.message : String(error))
        report.value.push({ filename: file.name, status: 'failed', message })
      } finally {
        processed.value += 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker))
  receipts.value = [...receipts.value, ...imported].sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
  if (imported.length) updateUnknownMarketPrompt(receipts.value)
  processing.value = false
}

async function togglePersistence() {
  if (!persistenceEnabled.value) {
    persistenceEnabled.value = true
    localStorage.setItem('bonbon-persistence-enabled', 'true')
    await Promise.all([
      saveReceipts(receipts.value),
      savePdfFiles(sessionFiles.value),
    ])
    return
  }
  if (!window.confirm(t('disableSaveConfirm'))) return
  persistenceEnabled.value = false
  localStorage.setItem('bonbon-persistence-enabled', 'false')
  await clearPersistedData()
}

async function clearAll() {
  if (!window.confirm(t('clearConfirm'))) return
  receipts.value = []
  sessionFiles.value = new Map()
  report.value = []
  notice.value = ''
  unknownMarketPromptCount.value = 0
  clearContributionDrafts()
  await clearPersistedData()
}

async function importJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const incoming = parseReceiptExport(await file.text()).map(normalizeReceiptMarketId)
    const known = new Set(receipts.value.map((receipt) => receipt.id))
    const additions = incoming.filter((receipt) => !known.has(receipt.id) && known.add(receipt.id))
    receipts.value = [...receipts.value, ...additions].sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
    if (additions.length) updateUnknownMarketPrompt(receipts.value)
    notice.value = t('jsonImported', { count: additions.length })
  } catch {
    notice.value = t('jsonInvalid')
  }
}

function statusLabel(status: ImportStatus['status']) { return t(status) }

const showAddModal = ref(false)

function onModalFiles(files: File[]) {
  processFiles(files)
  showAddModal.value = false
}
</script>

<template>
  <main class="app-shell" :class="{ populated: receipts.length }">
    <header class="topbar">
      <div class="topbar-brand-group">
        <a class="wordmark" href="#/" aria-label="BonBon Startseite" @click.prevent="setView('dashboard')">
          <span>Bon</span><span>Bon</span><i aria-hidden="true"></i>
        </a>
      </div>
      <div class="topbar-actions">
        <template v-if="receipts.length">
          <div class="topbar-data-actions">
            <button class="topbar-btn primary" type="button" @click="showAddModal = true">
              <span class="plus-icon">+</span> {{ t('importMore') }}
            </button>
            <button class="topbar-btn danger-ghost" type="button" :title="t('clear')" @click="clearAll">
              {{ t('clear') }}
            </button>
          </div>
        </template>
        <span class="privacy-pill"><i aria-hidden="true"></i>{{ t('privacy') }}</span>
        <div class="language-switch" aria-label="Sprache / Language"><button :class="{ active: locale === 'de' }" @click="setLocale('de')">DE</button><button :class="{ active: locale === 'en' }" @click="setLocale('en')">EN</button></div>
      </div>
    </header>

    <template v-if="currentView === 'market-help'">
      <MarketHelp :receipts="receipts" @navigate="setView('dashboard')" />
    </template>

    <template v-else-if="!receipts.length">
      <section class="hero-grid">
        <div class="hero-copy">
          <p class="eyebrow">RECEIPT EXPLORER · PHASE 1</p><h1>{{ t('tagline') }}</h1><p class="lede">{{ t('intro') }}</p>
          <div class="promise-row"><span>{{ t('local') }}</span><span>{{ t('noAccount') }}</span><span>{{ t('noCloud') }}</span></div>
        </div>
        <ImportPanel :processing="processing" @files="processFiles" />
      </section>
      <section class="steps" aria-labelledby="steps-title"><div><p class="eyebrow">{{ t('howLabel') }}</p><h2 id="steps-title">{{ t('howItWorks') }}</h2></div><ol><li><span>01</span>{{ t('stepOne') }}</li><li><span>02</span>{{ t('stepTwo') }}</li><li><span>03</span>{{ t('stepThree') }}</li></ol></section>
    </template>

    <template v-else>
      <Dashboard :receipts="receipts" :locale="activeLocale" @add-receipts="showAddModal = true" />
      <section class="utility-section">
        <ImportPanel compact :processing="processing" @files="processFiles" />
        <article class="privacy-card">
          <div><p class="eyebrow">{{ t('dataControls') }}</p><h2>{{ t('localOnlyTitle') }}</h2><p>{{ t('localOnlyCopy') }}</p></div>
          <div class="utility-actions">
            <button class="toggle-control" :class="{ active: persistenceEnabled }" type="button" role="switch" :aria-checked="persistenceEnabled" @click="togglePersistence"><i></i><span>{{ persistenceEnabled ? t('saved') : t('saveDevice') }}</span></button>
            <button class="text-button" type="button" @click="downloadReceiptExport(receipts)">{{ t('export') }}</button>
            <button class="text-button" type="button" @click="jsonInput?.click()">{{ t('importJson') }}</button>
            <button class="text-button danger" type="button" @click="clearAll">{{ t('clear') }}</button>
            <button class="market-help-link" type="button" @click="setView('market-help')">{{ t('improveMarketData') }} →</button>
          </div>
          <input ref="jsonInput" class="hidden-file" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="importJson" />
        </article>
      </section>
    </template>

    <!-- Add Receipts Modal -->
    <div v-if="showAddModal" class="modal-backdrop" @click.self="showAddModal = false">
      <div class="add-modal" role="dialog" aria-modal="true" :aria-label="t('importMore')">
        <button class="close-button" type="button" @click="showAddModal = false" :aria-label="t('close')">×</button>
        <div class="add-modal-header">
          <p class="eyebrow">{{ t('importMore') }}</p>
          <h2>{{ t('dropTitle') }}</h2>
          <p class="modal-intro">{{ t('dropCopy') }}</p>
        </div>
        <ImportPanel :processing="processing" @files="onModalFiles" />
      </div>
    </div>

    <section v-if="processing || report.length" class="import-report" aria-live="polite">
      <header><div><p class="eyebrow">{{ processing ? t('importing') : t('importReport') }}</p><strong>{{ t('filesProcessed', { done: processed, total: processingTotal }) }}</strong></div><progress :value="processed" :max="processingTotal"></progress><button v-if="!processing" class="report-close" type="button" :aria-label="t('close')" @click="report = []">×</button></header>
      <details v-if="!processing"><summary>{{ t('importReport') }}</summary><ul><li v-for="item in report" :key="`${item.filename}-${item.status}`"><span class="status-dot" :class="item.status"></span><span>{{ item.filename }}</span><strong>{{ statusLabel(item.status) }}</strong><small v-if="item.message">{{ item.message }}</small></li></ul></details>
    </section>
    <p v-if="notice" class="toast" role="status">{{ notice }}</p>
    <aside v-if="unknownMarketPromptCount" class="unknown-market-toast" role="status">
      <div><strong>{{ t('unknownMarketToastTitle', { count: unknownMarketPromptCount }) }}</strong><p>{{ t('unknownMarketToastCopy') }}</p></div>
      <button class="button primary" type="button" @click="setView('market-help'); unknownMarketPromptCount = 0">{{ t('identifyMarkets') }}</button>
      <button class="toast-dismiss" type="button" :aria-label="t('close')" @click="unknownMarketPromptCount = 0">×</button>
    </aside>
  </main>
</template>
