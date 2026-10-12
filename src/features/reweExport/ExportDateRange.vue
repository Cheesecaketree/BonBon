<script setup lang="ts">
import { computed, nextTick, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { exportDatePreset, localDate, normalizeExportRange, type ExportDatePreset, type ExportDateRange } from '../../domain/receipts/reweExport/dateRange'

const props = defineProps<{ modelValue: ExportDateRange; dataDates: string[]; metadataDates?: string[]; dataLabel?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: ExportDateRange] }>()
const { t, locale } = useI18n()
const id = useId()
const pendingStart = ref('')
const viewMonth = ref('')
const start = ref(props.modelValue.start)
const end = ref(props.modelValue.end)
const presets: ExportDatePreset[] = ['all', 'thisMonth', 'lastMonth', 'thisYear', 'lastYear', 'last90Days']
function matchingPreset(value: ExportDateRange): ExportDatePreset | '' {
  return presets.find((preset) => {
    const range = exportDatePreset(preset)
    return range.start === value.start && range.end === value.end
  }) ?? ''
}
const selectedPreset = ref<ExportDatePreset | ''>(matchingPreset(props.modelValue))
const dataDates = computed(() => new Set(props.dataDates))
const metadataDates = computed(() => new Set(props.metadataDates ?? []))
const dateFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
const monthFormat = computed(() => new Intl.DateTimeFormat(locale.value === 'de' ? 'de-DE' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
const weekdays = computed(() => locale.value === 'de' ? ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])

function monthDate(value: string, offset = 0) {
  const [year, month] = (value || localDate().slice(0, 7)).split('-').map(Number)
  return new Date(Date.UTC(year!, month! - 1 + offset, 1))
}
function focusLatest() {
  const latest = [...props.dataDates, ...(props.metadataDates ?? [])].sort().at(-1) ?? localDate()
  viewMonth.value = monthDate(latest.slice(0, 7), -1).toISOString().slice(0, 7)
}
focusLatest()
watch(() => props.modelValue, (value) => {
  start.value = value.start
  end.value = value.end
  selectedPreset.value = matchingPreset(value)
})
watch(() => props.dataDates, () => { if (!props.modelValue.start && !props.modelValue.end) focusLatest() })

const months = computed(() => [0, 1].map((offset) => {
  const first = monthDate(viewMonth.value, offset)
  const cells: (string | null)[] = Array((first.getUTCDay() + 6) % 7).fill(null)
  const cursor = new Date(first)
  while (cursor.getUTCMonth() === first.getUTCMonth()) {
    cells.push(cursor.toISOString().slice(0, 10))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }
  while (cells.length % 7) cells.push(null)
  return { key: first.toISOString().slice(0, 7), label: monthFormat.value.format(first), cells }
}))
const rangeLabel = computed(() => {
  if (!props.modelValue.start && !props.modelValue.end) return t('reweExport.rangeAll')
  const format = (date: string) => date ? dateFormat.value.format(new Date(`${date}T00:00:00Z`)) : '…'
  return `${format(props.modelValue.start)} – ${format(props.modelValue.end)}`
})

function applyInputs() {
  pendingStart.value = ''
  selectedPreset.value = ''
  const range = normalizeExportRange(start.value, end.value)
  if (range.start) viewMonth.value = range.start.slice(0, 7)
  emit('update:modelValue', range)
}
function chooseDate(date: string) {
  selectedPreset.value = ''
  if (!pendingStart.value) {
    pendingStart.value = date
    emit('update:modelValue', { start: date, end: date })
  } else {
    emit('update:modelValue', normalizeExportRange(pendingStart.value, date))
    pendingStart.value = ''
  }
}
function applyPreset(preset: ExportDatePreset) {
  pendingStart.value = ''
  selectedPreset.value = preset
  const range = exportDatePreset(preset)
  emit('update:modelValue', range)
  if (preset === 'all') focusLatest()
  else viewMonth.value = monthDate(range.end.slice(0, 7), -1).toISOString().slice(0, 7)
}
function selected(date: string) {
  return Boolean(props.modelValue.start && props.modelValue.end && date >= props.modelValue.start && date <= props.modelValue.end)
}
function dayLabel(date: string) {
  const status = dataDates.value.has(date) ? (props.dataLabel ?? t('reweExport.calendarPurchases')) : metadataDates.value.has(date) ? t('reweExport.calendarMetadata') : t('reweExport.calendarNoData')
  return `${dateFormat.value.format(new Date(`${date}T00:00:00Z`))} · ${status}`
}
function navigate(offset: number) { viewMonth.value = monthDate(viewMonth.value, offset).toISOString().slice(0, 7) }
function dayKeys(event: KeyboardEvent, date: string) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
  if (!(event.key in offsets)) return
  event.preventDefault()
  const target = new Date(`${date}T00:00:00Z`)
  target.setUTCDate(target.getUTCDate() + offsets[event.key]!)
  const iso = target.toISOString().slice(0, 10)
  if (!months.value.some((month) => month.key === iso.slice(0, 7))) viewMonth.value = iso.slice(0, 7)
  void nextTick(() => document.getElementById(`${id}-${iso}`)?.focus())
}
</script>

<template>
  <div class="export-range-field">
    <span :id="`${id}-label`" class="export-range-label">{{ t('reweExport.dateRange') }}</span>
    <details class="export-range-picker">
      <summary :aria-labelledby="`${id}-label ${id}-value`"><strong :id="`${id}-value`">{{ rangeLabel }}</strong><span aria-hidden="true">⌄</span></summary>
      <div class="export-range-body">
        <div class="export-range-presets" :aria-label="t('reweExport.rangePresets')"><button v-for="preset in presets" :key="preset" type="button" :aria-pressed="selectedPreset === preset" @click="applyPreset(preset)">{{ t(`reweExport.datePresets.${preset}`) }}</button></div>
        <div class="export-range-inputs"><label>{{ t('reweExport.rangeStart') }}<input v-model="start" type="date" @change="applyInputs" /></label><label>{{ t('reweExport.rangeEnd') }}<input v-model="end" type="date" @change="applyInputs" /></label></div>
        <p class="export-range-instruction" role="status">{{ t(pendingStart ? 'reweExport.chooseRangeEnd' : 'reweExport.chooseRangeStart') }}</p>
        <div class="export-calendar-nav"><button type="button" :aria-label="t('reweExport.previousMonth')" @click="navigate(-1)">←</button><label><span class="sr-only">{{ t('reweExport.calendarMonth') }}</span><input v-model.lazy="viewMonth" type="month" :required="true" @change="viewMonth ||= localDate().slice(0, 7)" /></label><button type="button" :aria-label="t('reweExport.nextMonth')" @click="navigate(1)">→</button></div>
        <div class="export-range-calendars">
          <section v-for="month in months" :key="month.key" class="export-month" :aria-label="month.label">
            <h3>{{ month.label }}</h3><div class="export-weekdays" aria-hidden="true"><span v-for="weekday in weekdays" :key="weekday">{{ weekday }}</span></div>
            <div class="export-month-grid"><template v-for="(date, index) in month.cells" :key="date ?? index"><span v-if="!date" /><button v-else :id="`${id}-${date}`" type="button" :data-date="date" :aria-label="dayLabel(date)" :aria-pressed="selected(date)" :class="{ 'has-purchases': dataDates.has(date), 'has-metadata': !dataDates.has(date) && metadataDates.has(date), 'in-range': selected(date), 'range-edge': date === modelValue.start || date === modelValue.end }" @click="chooseDate(date)" @keydown="dayKeys($event, date)">{{ Number(date.slice(8)) }}<i v-if="dataDates.has(date) || metadataDates.has(date)" aria-hidden="true" /></button></template></div>
          </section>
        </div>
        <div class="export-calendar-legend"><span><i class="purchase-dot" />{{ dataLabel ?? t('reweExport.calendarPurchases') }}</span><span v-if="metadataDates.size"><i class="metadata-dot" />{{ t('reweExport.calendarMetadata') }}</span></div>
      </div>
    </details>
  </div>
</template>
