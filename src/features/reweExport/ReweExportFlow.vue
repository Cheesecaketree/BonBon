<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { parseReweExportBackup, type ReweExport } from '../../domain/receipts/reweExport/schema'
import { importExportFiles } from '../../services/reweExport/importHtml'
import { clearAccountExport, downloadAccountExport, loadAccountExport, saveAccountExport } from '../../services/reweExport/storage'
import { filesFromDataTransfer } from '../../services/pdf/collectFiles'
import ExportDashboard from './ExportDashboard.vue'
import { useExportRoute } from './navigation'

const { t } = useI18n()
const data = ref<ReweExport | null>(null)
const { reset: resetRoute } = useExportRoute()
const processing = ref(false)
const loading = ref(true)
const done = ref(0)
const total = ref(0)
const dragging = ref(false)
const replacing = ref(false)
const error = ref('')
const folderInput = ref<HTMLInputElement>()
const backupInput = ref<HTMLInputElement>()
const persistenceKey = 'bonbon-rewe-export-persistence'
const saved = ref(localStorage.getItem(persistenceKey) === 'true')
const busy = computed(() => processing.value || loading.value)

onMounted(async () => {
  try {
    if (saved.value) data.value = await loadAccountExport()
  } catch { error.value = t('reweExport.storageError') }
  finally { loading.value = false }
})

async function acceptSnapshot(snapshot: ReweExport) {
  data.value = snapshot
  replacing.value = false
  resetRoute()
  if (saved.value) {
    try { await saveAccountExport(snapshot) }
    catch {
      saved.value = false
      localStorage.removeItem(persistenceKey)
      error.value = t('reweExport.storageError')
    }
  }
}

async function importFiles(files: File[]) {
  if (busy.value || !files.length) return
  processing.value = true
  error.value = ''
  done.value = 0
  total.value = files.filter((file) => /\.html?$/i.test(file.name)).length
  try {
    const snapshot = await importExportFiles(files, (current, count) => {
      done.value = current
      total.value = count
    })
    await acceptSnapshot(snapshot)
  } catch { error.value = t('reweExport.invalid') }
  finally { processing.value = false }
}

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  const files = [...(input.files ?? [])]
  input.value = ''
  void importFiles(files)
}

async function drop(event: DragEvent) {
  dragging.value = false
  if (busy.value || !event.dataTransfer) return
  try { await importFiles(await filesFromDataTransfer(event.dataTransfer)) }
  catch { error.value = t('reweExport.invalid') }
}

async function openBackup(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || busy.value) return
  processing.value = true
  error.value = ''
  try {
    if (file.size > 100 * 1024 * 1024) throw new Error('too-large')
    await acceptSnapshot(parseReweExportBackup(await file.text()))
  } catch { error.value = t('reweExport.backupInvalid') }
  finally { processing.value = false }
}

async function toggleSave() {
  if (!data.value || busy.value) return
  if (saved.value && !window.confirm(t('reweExport.disableConfirm'))) return
  processing.value = true
  error.value = ''
  try {
    if (saved.value) {
      await clearAccountExport()
      saved.value = false
      localStorage.removeItem(persistenceKey)
    } else {
      await saveAccountExport(data.value)
      saved.value = true
      localStorage.setItem(persistenceKey, 'true')
    }
  } catch { error.value = t('reweExport.storageError') }
  finally { processing.value = false }
}

async function clearSnapshot() {
  if (busy.value || !window.confirm(t('reweExport.clearConfirm'))) return
  processing.value = true
  error.value = ''
  try {
    await clearAccountExport()
    data.value = null
    saved.value = false
    replacing.value = false
    localStorage.removeItem(persistenceKey)
  } catch { error.value = t('reweExport.storageError') }
  finally { processing.value = false }
}
</script>

<template>
  <section class="rewe-export-flow" :aria-busy="busy">
    <p v-if="loading" class="export-message" role="status">{{ t('reweExport.loading') }}</p>
    <p v-if="error" class="export-message export-error" role="alert">{{ error }}</p>
    <template v-if="!data || replacing">
      <section class="hero-grid export-hero">
        <div class="hero-copy">
          <p class="eyebrow">{{ t('reweExport.kicker') }}</p>
          <h1>{{ t('reweExport.title') }}</h1>
          <p class="lede">{{ t('reweExport.intro') }}</p>
          <p class="export-source-note">{{ t('reweExport.separate') }}</p>
        </div>
        <section class="import-panel" :class="{ dragging }" @dragenter.prevent="dragging = true" @dragover.prevent @dragleave.prevent.self="dragging = false" @drop.prevent="drop">
          <div class="receipt-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="import-copy"><h2>{{ t('reweExport.dropTitle') }}</h2><p>{{ data ? t('reweExport.replaceCopy') : t('reweExport.dropCopy') }}</p></div>
          <div class="button-row">
            <button class="button primary" type="button" :disabled="busy" @click="folderInput?.click()">{{ t('reweExport.folder') }}</button>
          </div>
          <a class="export-guide-link" href="#/rewe-guide" data-export-guide-link>{{ t('reweExport.guideLink') }} →</a>
          <button v-if="data" class="export-inline-button" type="button" :disabled="busy" @click="replacing = false">{{ t('back') }}</button>        </section>
      </section>
    </template>
    <template v-else>
      <ExportDashboard :key="data.importedAt" :data="data" />
      <section class="export-controls privacy-card">
        <div><h2>{{ t('reweExport.dataControls') }}</h2><p>{{ t('reweExport.controlsCopy') }}</p></div>
        <div class="utility-actions">
          <button class="toggle-control" :class="{ active: saved }" type="button" role="switch" :aria-checked="saved" :disabled="busy" @click="toggleSave"><i></i><span>{{ t(saved ? 'reweExport.saved' : 'reweExport.save') }}</span></button>
          <button class="text-button" type="button" :disabled="busy" @click="replacing = true">{{ t('reweExport.replace') }}</button>
          <button class="text-button" type="button" :disabled="busy" @click="downloadAccountExport(data)">{{ t('reweExport.exportJson') }}</button>
          <button class="text-button" type="button" :disabled="busy" @click="backupInput?.click()">{{ t('reweExport.importJson') }}</button>
          <button class="text-button danger" type="button" :disabled="busy" @click="clearSnapshot">{{ t('reweExport.clear') }}</button>
        </div>
      </section>
    </template>
    <p v-if="processing" class="export-message" role="status">{{ t('reweExport.processing', { done, total }) }} <progress :value="done" :max="total || 1" /></p>
    <input ref="folderInput" class="hidden-file" data-export-folder type="file" accept="text/html,.html,.htm" multiple webkitdirectory tabindex="-1" aria-hidden="true" @change="selectFiles" />
    <input ref="backupInput" class="hidden-file" data-export-backup type="file" accept="application/json,.json" tabindex="-1" aria-hidden="true" @change="openBackup" />
  </section>
</template>
