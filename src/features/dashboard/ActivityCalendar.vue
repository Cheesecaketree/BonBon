<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import type { DayAggregate } from '../../domain/receipts/types'
import { getMarketShortName } from '../../domain/receipts/markets'

const props = defineProps<{
  year: number
  days: Map<string, DayAggregate>
  locale: 'de' | 'en'
  mode: 'spend' | 'trips' | 'average'
  isAccumulated?: boolean
}>()
const emit = defineEmits<{ select: [day: DayAggregate] }>()
const { t } = useI18n()

function metric(day: DayAggregate) {
  if (props.mode === 'trips') return day.trips
  if (props.mode === 'average') return day.averageCents
  return day.totalCents
}

const cells = computed(() => {
  const first = new Date(Date.UTC(props.year, 0, 1))
  const offset = (first.getUTCDay() + 6) % 7
  const result: Array<{ date: string; day?: DayAggregate } | null> = Array(offset).fill(null)
  const current = new Date(first)
  while (current.getUTCFullYear() === props.year) {
    const date = current.toISOString().slice(0, 10)
    result.push({ date, day: props.days.get(date) })
    current.setUTCDate(current.getUTCDate() + 1)
  }
  while (result.length % 7) result.push(null)
  return result
})

const maxTrips = computed(() => Math.max(1, ...[...props.days.values()].map((day) => day.trips)))
const maxMetric = computed(() => Math.max(1, ...[...props.days.values()].map(metric)))
const calendarLabels = computed(() => props.locale === 'de' ? ['Mo', 'Mi', 'Fr'] : ['Mon', 'Wed', 'Fri'])

function dotStyle(day?: DayAggregate) {
  if (!day) return {}
  const size = 4 + Math.sqrt(metric(day) / maxMetric.value) * 10
  const alpha = .42 + (day.trips / maxTrips.value) * .58
  return { width: `${size}px`, height: `${size}px`, backgroundColor: `rgba(155, 40, 72, ${alpha})` }
}

const currency = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }))

function money(cents: number) {
  return currency.value.format(cents / 100)
}

function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  if (props.isAccumulated) {
    return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
  }
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}

function formatHoverDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  if (props.isAccumulated) {
    return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', {
      day: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(Date.UTC(year, month - 1, day)))
  }
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)))
}

function tripsLabel(count: number) {
  return count === 1 ? `1 ${t('trip')}` : `${count} ${t('tripsMode').toLowerCase()}`
}

function label(cell: { date: string; day?: DayAggregate }) {
  if (!cell.day) return formatDate(cell.date)
  return `${formatDate(cell.date)}: ${money(cell.day.totalCents)}, ${cell.day.trips}`
}

const containerRef = ref<HTMLElement>()
const hovered = ref<{ day: DayAggregate; left: number; top: number } | null>(null)

function showTooltip(day: DayAggregate, event: MouseEvent | FocusEvent) {
  const target = event.currentTarget as HTMLElement
  const container = containerRef.value
  if (!target || !container) return
  const targetRect = target.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  const rawLeft = targetRect.left - containerRect.left + targetRect.width / 2
  const left = Math.max(90, Math.min(containerRect.width - 90, rawLeft))
  const top = targetRect.top - containerRect.top

  hovered.value = { day, left, top }
}

function hideTooltip() {
  hovered.value = null
}
</script>

<template>
  <div ref="containerRef" class="calendar-wrapper">
    <div class="calendar-scroll" @scroll="hideTooltip">
      <div class="calendar-labels" aria-hidden="true"><span v-for="item in calendarLabels" :key="item">{{ item }}</span></div>
      <div class="activity-calendar" role="grid" :aria-label="String(year)">
        <template v-for="(cell, index) in cells" :key="cell?.date ?? `blank-${index}`">
          <span v-if="!cell" class="calendar-cell blank" />
          <span v-else-if="!cell.day" class="calendar-cell" />
          <button
            v-else
            class="calendar-cell active"
            type="button"
            :aria-label="label(cell)"
            @mouseenter="showTooltip(cell.day, $event)"
            @mouseleave="hideTooltip"
            @focus="showTooltip(cell.day, $event)"
            @blur="hideTooltip"
            @click="emit('select', cell.day)"
          >
            <i :style="dotStyle(cell.day)" />
          </button>
        </template>
      </div>
    </div>

    <div
      v-if="hovered"
      class="calendar-hover-card"
      role="tooltip"
      :style="{ left: `${hovered.left}px`, top: `${hovered.top}px` }"
    >
      <div class="hover-card-header">
        <span class="hover-card-date">{{ formatHoverDate(hovered.day.date) }}</span>
      </div>
      <div class="hover-card-body">
        <strong class="hover-card-spend">{{ money(hovered.day.totalCents) }}</strong>
        <span class="hover-card-pill">{{ tripsLabel(hovered.day.trips) }}</span>
      </div>
      <div v-if="hovered.day.trips > 1" class="hover-card-average">
        {{ t('average') }}: <span>{{ money(hovered.day.averageCents) }}</span>
      </div>
      <div v-if="hovered.day.receipts?.length" class="hover-card-receipts">
        <span v-for="receipt in hovered.day.receipts.slice(0, 3)" :key="receipt.id" class="hover-card-tag">
          {{ isAccumulated ? `${receipt.localTimestamp.slice(0, 4)} · ` : '' }}{{ receipt.localTimestamp.slice(11, 16) }} · {{ getMarketShortName(receipt.marketId, t('market')) }}
        </span>
        <span v-if="hovered.day.receipts.length > 3" class="hover-card-more">
          +{{ hovered.day.receipts.length - 3 }}
        </span>
      </div>
    </div>
  </div>
</template>
