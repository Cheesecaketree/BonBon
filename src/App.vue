<script setup lang="ts">
import { computed, defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ImportStatus, Receipt } from './domain/receipts/types'
import { parseReweReceipt, receiptId } from './domain/receipts/parser'
import { mergeReceiptEnrichment } from './domain/receipts/enrichment'
import { isKnownMarket } from './domain/receipts/markets'
import { canonicalizeMarketId } from './domain/receipts/marketSchema'
import { clearLocalMarketMatches } from './domain/receipts/marketContributions'
import { clearPersistedData, loadPdfFiles, loadReceipts, savePdfFiles, saveReceipts } from './services/storage/database'
import { downloadReceiptExport, parseReceiptExport } from './services/storage/interchange'
import ImportPanel from './features/import/ImportPanel.vue'
import AppFooter from './features/common/AppFooter.vue'
import packageInfo from '../package.json'
const Dashboard = defineAsyncComponent(() => import('./features/dashboard/Dashboard.vue'))
const MarketHelp = defineAsyncComponent(() => import('./features/markets/MarketHelp.vue'))
const AboutView = defineAsyncComponent(() => import('./features/about/AboutView.vue'))

const { t, locale } = useI18n()
const receipts = ref<Receipt[]>([])
const report = ref<ImportStatus[]>([])
let reportDismissTimer: number | undefined
const processing = ref(false)
const processed = ref(0)
const processingTotal = ref(0)
const jsonInput = ref<HTMLInputElement>()
const persistenceEnabled = ref(localStorage.getItem('bonbon-persistence-enabled') === 'true')
const notice = ref('')
const unknownMarketPromptCount = ref(0)
const activeLocale = computed(() => locale.value === 'en' ? 'en' as const : 'de' as const)
const appVersion = packageInfo.version.replace(/\.0$/, '')
type AppView = 'dashboard' | 'market-help' | 'about'
const currentView = ref<AppView>('dashboard')
const aboutTab = ref<'about' | 'privacy'>('about')
const sessionFiles = ref<Map<string, File>>(new Map())

function normalizeReceiptMarketId(receipt: Receipt & { marketHeaderExcerpt?: string; marketName?: string }): Receipt {
  const marketId = canonicalizeMarketId(receipt.marketId) || receipt.marketId
  const { marketName: _legacyMarketName, marketHeaderExcerpt: _legacyHeaderExcerpt, ...rest } = receipt
  return {
    ...rest,
    marketId,
    id: receiptId(receipt.localTimestamp, marketId, receipt.receiptNumber),
  }
}

function updateUnknownMarketPrompt(nextReceipts: Receipt[]) {
  unknownMarketPromptCount.value = new Set(nextReceipts.filter((receipt) => !isKnownMarket(receipt.marketId)).map((receipt) => receipt.marketId)).size
}

function syncRoute() {
  const hash = window.location.hash
  if (hash === '#/help/markets') {
    currentView.value = 'market-help'
  } else if (hash === '#/about') {
    currentView.value = 'about'
    aboutTab.value = 'about'
  } else if (hash === '#/privacy') {
    currentView.value = 'about'
    aboutTab.value = 'privacy'
  } else {
    currentView.value = 'dashboard'
  }
}

function setView(view: AppView, tab?: 'about' | 'privacy') {
  currentView.value = view
  if (view === 'market-help') {
    window.location.hash = '#/help/markets'
  } else if (view === 'about') {
    if (tab) aboutTab.value = tab
    window.location.hash = (tab || aboutTab.value) === 'privacy' ? '#/privacy' : '#/about'
  } else {
    window.location.hash = '#/'
  }
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

watch(processing, (active) => {
  window.clearTimeout(reportDismissTimer)
  reportDismissTimer = undefined
  if (!active && report.value.length) {
    reportDismissTimer = window.setTimeout(() => {
      report.value = []
      reportDismissTimer = undefined
    }, 6000)
  }
})

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
  type FileOutcome =
    | { status: 'parsed'; receipt: Receipt }
    | { status: 'incomplete'; missing: string[] }
    | { status: 'failed'; message: string }
  const outcomes = new Array<FileOutcome>(files.length)
  let index = 0

  async function worker() {
    while (index < files.length) {
      const fileIndex = index++
      const file = files[fileIndex]
      if (!file.name.toLowerCase().endsWith('.pdf') && file.type !== 'application/pdf') {
        outcomes[fileIndex] = { status: 'failed', message: t('notPdf') }
        processed.value += 1
        continue
      }
      try {
        const text = await extractPdfText(file)
        const result = parseReweReceipt(text, file.name)
        if (!result.ok) {
          outcomes[fileIndex] = { status: 'incomplete', missing: result.missing }
        } else {
          outcomes[fileIndex] = { status: 'parsed', receipt: result.receipt }
        }
      } catch (error) {
        const message = error instanceof Error && error.message === 'no-text' ? t('noText') : (error instanceof Error ? error.message : String(error))
        outcomes[fileIndex] = { status: 'failed', message }
      } finally {
        processed.value += 1
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(4, files.length) }, worker))
  const nextReceipts = [...receipts.value]
  const receiptIndexes = new Map(nextReceipts.map((receipt, receiptIndex) => [receipt.id, receiptIndex]))
  let importedCount = 0
  report.value = outcomes.map((outcome, fileIndex) => {
    const filename = files[fileIndex].name
    if (outcome.status === 'failed') return { filename, status: 'failed', message: outcome.message }
    if (outcome.status === 'incomplete') {
      return { filename, status: 'incomplete', message: t('missing', { fields: outcome.missing.join(', ') }) }
    }
    const existingIndex = receiptIndexes.get(outcome.receipt.id)
    if (existingIndex !== undefined) {
      nextReceipts[existingIndex] = mergeReceiptEnrichment(nextReceipts[existingIndex], outcome.receipt)
      return { filename, status: 'duplicate' }
    }
    receiptIndexes.set(outcome.receipt.id, nextReceipts.length)
    nextReceipts.push(outcome.receipt)
    importedCount += 1
    return { filename, status: 'imported' }
  })
  receipts.value = nextReceipts.sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
  if (importedCount) updateUnknownMarketPrompt(receipts.value)
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
  clearLocalMarketMatches()
  await clearPersistedData()
}

async function importJson(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const incoming = parseReceiptExport(await file.text()).map(normalizeReceiptMarketId)
    const nextReceipts = [...receipts.value]
    const receiptIndexes = new Map(nextReceipts.map((receipt, index) => [receipt.id, index]))
    let additionsCount = 0
    let updatedCount = 0
    for (const receipt of incoming) {
      const existingIndex = receiptIndexes.get(receipt.id)
      if (existingIndex !== undefined) {
        const existing = nextReceipts[existingIndex]
        const merged = mergeReceiptEnrichment(existing, receipt)
        const changed = merged.items !== existing.items
          || merged.vatBreakdown !== existing.vatBreakdown
          || merged.loyalty !== existing.loyalty
          || merged.payback !== existing.payback
        if (changed) {
          nextReceipts[existingIndex] = merged
          updatedCount += 1
        }
      } else {
        receiptIndexes.set(receipt.id, nextReceipts.length)
        nextReceipts.push(receipt)
        additionsCount += 1
      }
    }
    receipts.value = nextReceipts.sort((a, b) => a.localTimestamp.localeCompare(b.localTimestamp))
    if (additionsCount) updateUnknownMarketPrompt(receipts.value)
    notice.value = t('jsonImported', { count: additionsCount + updatedCount })
  } catch {
    notice.value = t('jsonInvalid')
  }
}

function statusLabel(status: ImportStatus['status']) { return t(status) }

const showAddModal = ref(false)
const addModalRef = ref<HTMLElement>()
const addCloseRef = ref<HTMLButtonElement>()
const addModalTrigger = ref<HTMLElement>()

function openAddModal(event?: Event) {
  addModalTrigger.value = (event?.currentTarget || document.activeElement) as HTMLElement
  showAddModal.value = true
}

function closeAddModal() {
  showAddModal.value = false
}

function handleAddModalKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeAddModal()
    return
  }
  if (event.key !== 'Tab' || !addModalRef.value) return
  const focusable = [...addModalRef.value.querySelectorAll<HTMLElement>('button, [href], input:not([tabindex="-1"]), select, textarea, [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

watch(showAddModal, async (open) => {
  document.body.classList.toggle('dialog-open', open)
  if (open) {
    await nextTick()
    addCloseRef.value?.focus()
  } else {
    addModalTrigger.value?.focus()
  }
})

onBeforeUnmount(() => {
  document.body.classList.remove('dialog-open')
  window.clearTimeout(reportDismissTimer)
})

function onModalFiles(files: File[]) {
  processFiles(files)
  closeAddModal()
}
</script>

<template>
  <main class="app-shell" :class="{ populated: receipts.length }">
    <header class="topbar">
      <div class="topbar-brand-group">
        <a class="wordmark" href="#/" aria-label="BonBon Startseite" @click.prevent="setView('dashboard')">
          <span>Bon</span><span>Bon</span><small class="version-pill" aria-hidden="true">v{{ appVersion }}</small>
        </a>
      </div>
      <div class="topbar-actions">
        <template v-if="receipts.length">
          <div class="topbar-data-actions">
            <button class="topbar-btn primary" type="button" @click="openAddModal">
              <span class="plus-icon">+</span> {{ t('importMore') }}
            </button>
            <button class="topbar-btn danger-ghost" type="button" :title="t('clear')" @click="clearAll">
              {{ t('clear') }}
            </button>
          </div>
        </template>
        <button
          class="topbar-nav-link"
          :class="{ active: currentView === 'about' }"
          type="button"
          @click="setView('about', 'about')"
        >
          {{ t('about') }}
        </button>
        <a
          class="topbar-github-link"
          href="https://github.com/Cheesecaketree/BonBon"
          target="_blank"
          rel="noopener noreferrer"
          :title="t('githubRepo')"
          :aria-label="t('githubRepo')"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
          </svg>
        </a>
        <div class="language-switch" role="group" aria-label="Sprache / Language"><button :class="{ active: locale === 'de' }" :aria-pressed="locale === 'de'" @click="setLocale('de')">DE</button><button :class="{ active: locale === 'en' }" :aria-pressed="locale === 'en'" @click="setLocale('en')">EN</button></div>
      </div>
    </header>

    <template v-if="currentView === 'market-help'">
      <MarketHelp :receipts="receipts" :pdf-files="sessionFiles" @navigate="setView('dashboard')" @upload-receipts="openAddModal" />
    </template>

    <template v-else-if="currentView === 'about'">
      <AboutView :initial-tab="aboutTab" :has-receipts="receipts.length > 0" @navigate="setView('dashboard')" />
    </template>

    <template v-else-if="!receipts.length">
      <section class="hero-grid">
        <div class="hero-copy">
          <h1>{{ t('tagline') }}</h1><p class="lede">{{ t('intro') }}</p>
          <div class="promise-row"><span>{{ t('local') }}</span><span>{{ t('noAccount') }}</span><span>{{ t('noCloud') }}</span></div>
        </div>
        <ImportPanel :processing="processing" @files="processFiles" />
      </section>
      <section class="steps" aria-labelledby="steps-title"><div><p class="eyebrow">{{ t('howLabel') }}</p><h2 id="steps-title">{{ t('howItWorks') }}</h2></div><ol><li><span>01</span>{{ t('stepOne') }}</li><li><span>02</span>{{ t('stepTwo') }}</li><li><span>03</span>{{ t('stepThree') }}</li></ol></section>
    </template>

    <template v-else>
      <Dashboard :receipts="receipts" :locale="activeLocale" @add-receipts="openAddModal" @improve-markets="setView('market-help')" />
      <section class="utility-section">
        <ImportPanel compact :processing="processing" @files="processFiles" />
        <article class="privacy-card">
          <div><p class="eyebrow">{{ t('dataControls') }}</p><h2>{{ t('localOnlyTitle') }}</h2><p>{{ t('localOnlyCopy') }}</p></div>
          <div class="utility-actions">
            <button class="toggle-control" :class="{ active: persistenceEnabled }" type="button" role="switch" :aria-checked="persistenceEnabled" @click="togglePersistence"><i></i><span>{{ persistenceEnabled ? t('saved') : t('saveDevice') }}</span></button>
            <button class="text-button" type="button" @click="downloadReceiptExport(receipts)">{{ t('export') }}</button>
            <button class="text-button" type="button" @click="jsonInput?.click()">{{ t('importJson') }}</button>
            <button class="text-button danger" type="button" @click="clearAll">{{ t('clear') }}</button>
            <button class="market-help-link" type="button" @click="setView('about', 'privacy')">{{ t('privacy') }} →</button>
            <button class="market-help-link" type="button" @click="setView('market-help')">{{ t('improveMarketData') }} →</button>
          </div>
          <input ref="jsonInput" class="hidden-file" type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="importJson" />
        </article>
      </section>
    </template>

    <AppFooter @navigate="setView" />

    <!-- Add Receipts Modal -->
    <div v-if="showAddModal" class="modal-backdrop" @click.self="closeAddModal">
      <div ref="addModalRef" class="add-modal" role="dialog" aria-modal="true" :aria-label="t('importMore')" @keydown="handleAddModalKeys">
        <button ref="addCloseRef" class="close-button" type="button" @click="closeAddModal" :aria-label="t('close')">×</button>
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
