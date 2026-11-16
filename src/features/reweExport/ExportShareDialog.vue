<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useExportFormat } from './format'
import { exportShareSummary } from '../../domain/receipts/reweExport/shareSummary'
import type { ReweExport } from '../../domain/receipts/reweExport/schema'
import { renderShareCard, type ShareCardModel } from '../../services/share/renderShareCard'

const props = defineProps<{ data: ReweExport }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useI18n()
const { money, roundMoney, short, date, weekday, factValue } = useExportFormat()
const includeStaples = ref(true)
const includeLabels = ref(true)
const imageUrl = ref('')
const blob = ref<Blob | null>(null)
const failed = ref(false)
const dialog = ref<HTMLElement>()
const previousFocus = document.activeElement as HTMLElement | null
const fileName = 'bonbon-rewe-summary.png'

const summary = computed(() => exportShareSummary(props.data))
const model = computed<ShareCardModel | null>(() => {
  const value = summary.value
  if (!value) return null
  const stats = [{ label: t('reweExport.share.tripsPerMonth'), value: short(value.tripsPerMonth) }]
  if (value.tripCents !== null) stats.push({ label: t('reweExport.share.typicalTrip'), value: money(value.tripCents) })
  if (value.favouriteWeekday !== null) stats.push({ label: t('reweExport.share.weekday'), value: weekday(value.favouriteWeekday) })
  return {
    kicker: t('reweExport.share.kicker'),
    title: t('reweExport.share.title'),
    period: `${date(value.firstDate)} – ${date(value.lastDate)}`,
    lead: { label: t('reweExport.share.typicalMonth'), value: roundMoney(value.typicalCents), note: t('reweExport.share.typicalMonthNote', { months: value.months }) },
    stats,
    lists: [
      ...(includeStaples.value ? [{ title: t('reweExport.share.staples'), items: value.staples }] : []),
      ...(includeLabels.value ? [{ title: t('reweExport.share.labels'), items: value.labels.map((card) => factValue(card.fact)) }] : []),
    ],
    footer: t('reweExport.share.footer'),
  }
})
const canShareFiles = computed(() => {
  if (!blob.value || typeof navigator.canShare !== 'function') return false
  try { return navigator.canShare({ files: [new File([blob.value], fileName, { type: 'image/png' })] }) } catch { return false }
})

let generation = 0
async function render() {
  const current = ++generation
  if (!model.value) return
  failed.value = false
  const result = await renderShareCard(model.value)
  if (current !== generation) return
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
  blob.value = result
  imageUrl.value = result ? URL.createObjectURL(result) : ''
  failed.value = !result
}
function download() {
  if (!imageUrl.value) return
  const link = document.createElement('a')
  link.href = imageUrl.value
  link.download = fileName
  link.click()
}
async function share() {
  if (!blob.value) return
  try { await navigator.share({ files: [new File([blob.value], fileName, { type: 'image/png' })], title: t('reweExport.share.title') }) } catch { /* dismissed */ }
}
function close() {
  emit('close')
  void nextTick(() => previousFocus?.focus?.())
}
function keys(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
  if (event.key !== 'Tab' || !dialog.value) return
  const focusable = [...dialog.value.querySelectorAll<HTMLElement>('button, input, a[href]')].filter((element) => !element.hasAttribute('disabled'))
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
watch(model, () => { void render() })
onMounted(() => {
  document.body.classList.add('dialog-open')
  void render()
  void nextTick(() => dialog.value?.querySelector<HTMLElement>('button')?.focus())
})
onBeforeUnmount(() => {
  document.body.classList.remove('dialog-open')
  if (imageUrl.value) URL.revokeObjectURL(imageUrl.value)
})
</script>

<template>
  <div class="export-share-backdrop" @click.self="close">
    <div ref="dialog" class="export-share-dialog" role="dialog" aria-modal="true" aria-labelledby="export-share-title" @keydown="keys">
      <header><h2 id="export-share-title">{{ t('reweExport.share.dialogTitle') }}</h2><button class="export-share-close" type="button" :aria-label="t('reweExport.share.close')" @click="close">×</button></header>
      <p>{{ t('reweExport.share.dialogCopy') }}</p>
      <p v-if="!summary">{{ t('reweExport.insights.empty') }}</p>
      <template v-else>
        <div class="export-share-options">
          <label><input v-model="includeStaples" type="checkbox" /> {{ t('reweExport.share.includeStaples') }}</label>
          <label v-if="summary.labels.length"><input v-model="includeLabels" type="checkbox" /> {{ t('reweExport.share.includeLabels') }}</label>
        </div>
        <figure class="export-share-preview">
          <img v-if="imageUrl" :src="imageUrl" :alt="t('reweExport.share.previewAlt', { amount: roundMoney(summary.typicalCents) })" />
          <figcaption v-else>{{ failed ? t('reweExport.share.unavailable') : t('reweExport.share.rendering') }}</figcaption>
        </figure>
        <div class="button-row">
          <button class="button primary" type="button" :disabled="!imageUrl" @click="download">{{ t('reweExport.share.download') }}</button>
          <button v-if="canShareFiles" class="button secondary" type="button" @click="share">{{ t('reweExport.share.share') }}</button>
        </div>
        <p class="fine-print">{{ t('reweExport.share.privacy') }}</p>
      </template>
    </div>
  </div>
</template>
