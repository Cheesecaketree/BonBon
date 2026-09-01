<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { EChartsOption } from 'echarts'
import type { DayAggregate, Receipt } from '../../domain/receipts/types'
import {
  WEEKDAYS_DE, WEEKDAYS_EN, aggregateAccumulatedDays, aggregateDays,
  filterReceipts, hourlyTrips, monthlySpend, receiptYear, scatterData,
  summaryStats, weekdayHourMatrix, weekdaySeries, weeklyTrips,
} from '../../domain/receipts/analytics'
import {
  getMarketDisplayName,
  getMarketSource,
  getMarketShortName,
} from '../../domain/receipts/markets'
import { getStoredLocalMarketMatches } from '../../domain/receipts/marketContributions'
import ActivityCalendar from './ActivityCalendar.vue'
import ChartCard from './ChartCard.vue'

const props = defineProps<{ receipts: Receipt[]; locale: 'de' | 'en' }>()
const emit = defineEmits<{ addReceipts: []; improveMarkets: [] }>()
const { t } = useI18n()
const years = computed(() => [...new Set(props.receipts.map((receipt) => Number(receipt.localTimestamp.slice(0, 4))))].sort((a, b) => b - a))
const markets = computed(() => [...new Set(props.receipts.map((receipt) => receipt.marketId))].sort())
const selectedYear = ref<number | 'all'>(Math.max(...years.value))
const selectedMarkets = ref(new Set(markets.value))
const selectedDay = ref<DayAggregate>()
const dayPanelRef = ref<HTMLElement>()
const dayCloseRef = ref<HTMLButtonElement>()
const dayTrigger = ref<HTMLElement>()
const isMobile = ref(false)
const localMarketMatches = getStoredLocalMarketMatches()

let mobileQuery: MediaQueryList | undefined
function updateMobile(event?: MediaQueryListEvent) {
  isMobile.value = event ? event.matches : Boolean(mobileQuery?.matches)
}

onMounted(() => {
  mobileQuery = window.matchMedia('(max-width: 720px)')
  updateMobile()
  mobileQuery.addEventListener('change', updateMobile)
})

onBeforeUnmount(() => mobileQuery?.removeEventListener('change', updateMobile))

function marketDisplayName(marketId: string) {
  return getMarketDisplayName(marketId, t('market'), localMarketMatches)
}

function marketShortName(marketId: string) {
  return getMarketShortName(marketId, t('market'), localMarketMatches)
}

function isLocalMarket(marketId: string) {
  return getMarketSource(marketId, localMarketMatches) === 'local'
}

watch(years, (values) => {
  if (selectedYear.value !== 'all' && !values.includes(selectedYear.value)) selectedYear.value = Math.max(...values)
})
watch(markets, (values, oldValues) => {
  if (!oldValues?.length || selectedMarkets.value.size === oldValues.length) selectedMarkets.value = new Set(values)
})

const isAllYears = computed(() => selectedYear.value === 'all')
const filtered = computed(() => filterReceipts(props.receipts, selectedYear.value, selectedMarkets.value))
const availableYears = computed(() => {
  const y = [...new Set(filtered.value.map(receiptYear))].sort((a, b) => b - a)
  return y.length ? y : years.value
})
const hasMultipleYears = computed(() => availableYears.value.length > 1)

const stats = computed(() => summaryStats(filtered.value))
const days = computed(() => {
  if (isAllYears.value) {
    return aggregateAccumulatedDays(filtered.value, 2024)
  }
  return aggregateDays(filtered.value)
})
const weekdays = computed(() => props.locale === 'de' ? WEEKDAYS_DE : WEEKDAYS_EN)
const months = computed(() => Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(2024, index, 1)))))

const currency = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { style: 'currency', currency: 'EUR' }))
const integer = computed(() => new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB'))

function money(cents: number) { return currency.value.format(cents / 100) }
function formatDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function formatMonthDay(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: 'short', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function shortDate(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function shortDateWithYear(date: string) {
  const [year, month, day] = date.split('-').map(Number)
  return new Intl.DateTimeFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: 'UTC' }).format(new Date(Date.UTC(year, month - 1, day)))
}
function interval(hours: number | null) {
  if (hours === null) return '–'
  return hours >= 48 ? t('intervalDays', { days: new Intl.NumberFormat(props.locale === 'de' ? 'de-DE' : 'en-GB', { maximumFractionDigits: 1 }).format(hours / 24) }) : t('intervalHours', { hours: Math.round(hours) })
}
function toggleMarket(market: string) {
  const next = new Set(selectedMarkets.value)
  next.has(market) ? next.delete(market) : next.add(market)
  selectedMarkets.value = next
}
function selectAllMarkets() { selectedMarkets.value = new Set(markets.value) }

function openDay(day: DayAggregate) {
  dayTrigger.value = document.activeElement as HTMLElement
  selectedDay.value = day
}

function closeDay() {
  selectedDay.value = undefined
}

function handleDayKeys(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeDay()
    return
  }
  if (event.key !== 'Tab' || !dayPanelRef.value) return
  const focusable = [...dayPanelRef.value.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
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

watch(selectedDay, async (day) => {
  document.body.classList.toggle('dialog-open', Boolean(day))
  if (day) {
    await nextTick()
    dayCloseRef.value?.focus()
  } else {
    dayTrigger.value?.focus()
  }
})

onBeforeUnmount(() => document.body.classList.remove('dialog-open'))

function chartBase() {
  return {
    aria: { enabled: true, decal: { show: false } },
    textStyle: { fontFamily: 'Inter, system-ui, sans-serif', color: '#4f4343', fontSize: isMobile.value ? 10 : 12 },
    grid: { left: isMobile.value ? 38 : 44, right: isMobile.value ? 8 : 18, top: 25, bottom: isMobile.value ? 30 : 38, containLabel: false },
    tooltip: { trigger: 'axis' as const, confine: true, triggerOn: 'mousemove|click|mousewheel' as const, backgroundColor: '#241d1d', borderWidth: 0, textStyle: { color: '#fffaf1' } },
  }
}

const weekdayTripOption = computed<EChartsOption>(() => ({ ...chartBase(), xAxis: { type: 'category', data: weekdays.value, axisLine: { lineStyle: { color: '#cfc1b4' } }, axisTick: { show: false } }, yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e8ddd2' } } }, series: [{ type: 'bar', data: weekdaySeries(filtered.value).trips, itemStyle: { color: '#9b2848', borderRadius: [8, 8, 0, 0] }, barMaxWidth: 34 }] }))
const weekdaySpendOption = computed<EChartsOption>(() => ({ ...chartBase(), xAxis: { type: 'category', data: weekdays.value, axisLine: { lineStyle: { color: '#cfc1b4' } }, axisTick: { show: false } }, yAxis: { type: 'value', axisLabel: { formatter: '€{value}' }, splitLine: { lineStyle: { color: '#e8ddd2' } } }, series: [{ type: 'bar', data: weekdaySeries(filtered.value).spendCents.map((value) => value / 100), itemStyle: { color: '#d98470', borderRadius: [8, 8, 0, 0] }, barMaxWidth: 34 }] }))
const hourlyOption = computed<EChartsOption>(() => ({ ...chartBase(), xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, hour) => `${hour}`), axisLabel: { interval: isMobile.value ? 2 : 0 }, axisLine: { lineStyle: { color: '#cfc1b4' } }, axisTick: { show: false } }, yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e8ddd2' } } }, series: [{ type: 'bar', data: hourlyTrips(filtered.value), itemStyle: { color: '#6f1732', borderRadius: [5, 5, 0, 0] }, barMaxWidth: 18 }] }))

const yearColors = ['#9b2848', '#d98470', '#6f1732', '#c4627a', '#4a1523', '#e29b82', '#823146', '#f0a289']

const monthlyOption = computed<EChartsOption>(() => {
  if (isAllYears.value && hasMultipleYears.value) {
    const yearsList = [...availableYears.value].sort((a, b) => a - b)
    const seriesList = yearsList.map((year, idx) => {
      const yearReceipts = filtered.value.filter((r) => receiptYear(r) === year)
      const spendArray = monthlySpend(yearReceipts)
      return {
        name: String(year),
        type: 'bar' as const,
        stack: 'total',
        emphasis: { focus: 'series' as const },
        data: spendArray.map((value) => value / 100),
        itemStyle: {
          color: yearColors[idx % yearColors.length],
          borderRadius: idx === yearsList.length - 1 ? [6, 6, 0, 0] : 0,
        },
        barMaxWidth: 36,
      }
    })

    return {
      ...chartBase(),
      legend: {
        show: true,
        top: 0,
        right: 16,
        textStyle: { color: '#695d5d', fontSize: 11, fontWeight: 700 },
        data: yearsList.map(String),
      },
      grid: { ...chartBase().grid, top: 35 },
      tooltip: {
        ...chartBase().tooltip,
        formatter: (params: any) => {
          const items = Array.isArray(params) ? params : [params]
          if (!items.length) return ''
          const monthName = items[0].name
          let total = 0
          let rows = ''
          for (const item of items) {
            const val = Number(item.value) || 0
            if (val > 0) {
              total += val
              rows += `<div style="display:flex;justify-content:space-between;gap:14px;font-size:12px;margin-top:2px;"><span>${item.marker} ${item.seriesName}:</span><strong>${currency.value.format(val)}</strong></div>`
            }
          }
          return `<strong>${monthName}</strong> · Total: <strong>${currency.value.format(total)}</strong><hr style="margin:6px 0;border:0;border-top:1px solid rgba(255,255,255,.2);"/>${rows || '0 €'}`
        },
      },
      xAxis: {
        type: 'category',
        data: months.value,
        axisLine: { lineStyle: { color: '#cfc1b4' } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '€{value}' },
        splitLine: { lineStyle: { color: '#e8ddd2' } },
      },
      series: seriesList,
    }
  }

  return {
    ...chartBase(),
    xAxis: {
      type: 'category',
      data: months.value,
      axisLine: { lineStyle: { color: '#cfc1b4' } },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: '€{value}' },
      splitLine: { lineStyle: { color: '#e8ddd2' } },
    },
    series: [
      {
        type: 'bar',
        data: monthlySpend(filtered.value).map((value) => value / 100),
        itemStyle: { color: '#9b2848', borderRadius: [8, 8, 0, 0] },
        barMaxWidth: 35,
      },
    ],
  }
})

const weeklyOption = computed<EChartsOption>(() => {
  const series = weeklyTrips(filtered.value)
  const useYearInDate = isAllYears.value && hasMultipleYears.value
  return {
    ...chartBase(),
    tooltip: {
      ...chartBase().tooltip,
      formatter: (params: any) => {
        const item = Array.isArray(params) ? params[0] : params
        if (!item) return ''
        const dateStr = item.name
        const count = item.value
        const tripsUnit = count === 1 ? t('trip') : t('tripsMode').toLowerCase()
        return `${t('weekStarting', { date: dateStr })}<br><strong>${count} ${tripsUnit}</strong>`
      },
    },
    xAxis: {
      type: 'category',
      data: series.map((item) => useYearInDate ? shortDateWithYear(item.date) : shortDate(item.date)),
      axisLabel: { interval: Math.max(0, Math.floor(series.length / 8) - 1), rotate: useYearInDate && series.length > 18 ? 30 : 0 },
      axisLine: { lineStyle: { color: '#cfc1b4' } },
      axisTick: { show: false },
    },
    yAxis: { type: 'value', minInterval: 1, splitLine: { lineStyle: { color: '#e8ddd2' } } },
    series: [{
      type: 'line',
      name: t('weeklyTrips'),
      data: series.map((item) => item.trips),
      smooth: true,
      symbolSize: series.length > 60 ? 4 : 7,
      lineStyle: { color: '#9b2848', width: 3 },
      itemStyle: { color: '#9b2848' },
      areaStyle: { color: 'rgba(155,40,72,.1)' },
    }],
  }
})

const heatmapOption = computed<EChartsOption>(() => {
  const matrix = weekdayHourMatrix(filtered.value)
  const data = matrix.flatMap((row, day) => row.map((value, hour) => [hour, day, value]))
  const max = Math.max(1, ...data.map((item) => Number(item[2])))
  return {
    ...chartBase(), grid: { left: isMobile.value ? 28 : 54, right: isMobile.value ? 5 : 24, top: 18, bottom: isMobile.value ? 42 : 54 }, tooltip: { trigger: 'item', confine: true, position: 'top' },
    xAxis: { type: 'category', data: Array.from({ length: 24 }, (_, hour) => `${hour}`), axisLabel: { interval: isMobile.value ? 2 : 0 }, splitArea: { show: true }, axisTick: { show: false }, axisLine: { show: false } },
    yAxis: { type: 'category', data: weekdays.value, splitArea: { show: true }, axisTick: { show: false }, axisLine: { show: false } },
    visualMap: { min: 0, max, calculable: false, orient: 'horizontal', left: 'center', bottom: 0, inRange: { color: ['#f5ede3', '#e7b6aa', '#9b2848', '#541125'] }, textStyle: { color: '#695d5d' } },
    series: [{ type: 'heatmap', data, label: { show: false }, itemStyle: { borderColor: '#fffaf1', borderWidth: 2, borderRadius: 3 } }],
  }
})

const scatterOption = computed<EChartsOption>(() => {
  const data = scatterData(filtered.value)
  const dates = [...new Set(data.map((item) => item.date))].sort()
  const useYearInDate = isAllYears.value && hasMultipleYears.value
  return {
    ...chartBase(), tooltip: { trigger: 'item', confine: true, triggerOn: 'mousemove|click|mousewheel', formatter: (params: any) => `${formatDate(params.value[0])}<br>${String(Math.floor(params.value[1])).padStart(2, '0')}:${String(Math.round(params.value[1] % 1 * 60)).padStart(2, '0')} · ${money(params.value[2] * 100)}<br>${marketDisplayName(params.value[3])}` },
    xAxis: { type: 'category', data: dates, axisLabel: { formatter: (value: string) => useYearInDate ? shortDateWithYear(value) : shortDate(value), interval: Math.max(0, Math.floor(dates.length / (isMobile.value ? 4 : 7)) - 1), rotate: isMobile.value ? 40 : 30 }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#cfc1b4' } } },
    yAxis: { type: 'value', min: 0, max: 24, interval: 4, axisLabel: { formatter: (value: number) => `${String(value).padStart(2, '0')}:00` }, splitLine: { lineStyle: { color: '#e8ddd2' } } },
    series: [{ type: 'scatter', data: data.map((item) => [item.date, item.hour, item.totalCents / 100, item.marketId]), symbolSize: (value: number[]) => (isMobile.value ? 6 : 7) + Math.min(isMobile.value ? 10 : 13, Math.sqrt(value[2]) * (isMobile.value ? 1.25 : 1.6)), itemStyle: { color: '#9b2848', opacity: .72 } }],
  }
})
</script>

<template>
  <section class="dashboard">
    <header class="dashboard-heading">
      <div>
        <h1>{{ isAllYears ? t('dashboardAllYears') : t('dashboard') }}</h1>
        <p>{{ isAllYears ? t('dashboardAllYearsIntro') : t('dashboardIntro') }}</p>
      </div>
      <div class="filter-bar">
        <button type="button" class="filter-add-btn" @click="emit('addReceipts')">
          + {{ t('importMore') }}
        </button>
        <label class="filter-field">
          <span class="filter-label">{{ t('year') }}</span>
          <select v-model="selectedYear">
            <option value="all">{{ t('allYears') }}</option>
            <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
          </select>
        </label>
        <div class="filter-field">
          <span class="filter-label">{{ t('markets') }}</span>
          <details class="market-filter">
            <summary><span>{{ t('selected') }}</span><strong>{{ selectedMarkets.size }}/{{ markets.length }}</strong></summary>
            <div class="market-menu">
              <button type="button" class="market-select-all" @click="selectAllMarkets">{{ t('allMarkets') }}</button>
              <div class="market-items-list">
                <div v-for="market in markets" :key="market" class="market-item-row">
                  <label class="market-item-label">
                    <input type="checkbox" :checked="selectedMarkets.has(market)" @change="toggleMarket(market)" />
                    <span class="market-item-name">{{ marketDisplayName(market) }}</span>
                  </label>
                  <button v-if="isLocalMarket(market)" class="local-match-indicator" type="button" :title="t('localMatchInfo')" :aria-label="t('localMatchOpen', { id: market })" @click="emit('improveMarkets')">ⓘ {{ t('localMatchBadge') }} ↗</button>
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </header>

    <template v-if="filtered.length">
      <section class="stat-grid primary-stats" aria-label="Übersicht">
        <article><span>{{ t('totalSpend') }}</span><strong>{{ money(stats.totalCents) }}</strong></article>
        <article><span>{{ t('trips') }}</span><strong>{{ integer.format(stats.trips) }}</strong></article>
        <article><span>{{ t('averageBasket') }}</span><strong>{{ money(stats.averageCents) }}</strong></article>
        <article><span>{{ t('medianBasket') }}</span><strong>{{ money(stats.medianCents) }}</strong></article>
        <article><span>{{ t('marketsVisited') }}</span><strong>{{ stats.marketCount }}</strong></article>
      </section>
      <section class="stat-grid secondary-stats">
        <article><span>{{ t('averageInterval') }}</span><strong>{{ interval(stats.averageIntervalHours) }}</strong></article>
        <article><span>{{ t('medianInterval') }}</span><strong>{{ interval(stats.medianIntervalHours) }}</strong></article>
        <article><span>{{ t('earliest') }}</span><strong>{{ stats.earliestTime }}</strong></article>
        <article><span>{{ t('latest') }}</span><strong>{{ stats.latestTime }}</strong></article>
      </section>

      <article class="calendar-card">
        <header class="card-heading">
          <div>
            <h2>{{ t('calendar') }}</h2>
            <p>{{ isAllYears ? t('calendarAllYearsCopy') : t('calendarCopy') }}</p>
          </div>
        </header>
        <ActivityCalendar
          :year="isAllYears ? 2024 : Number(selectedYear)"
          :days="days"
          :is-accumulated="isAllYears"
          :locale="locale"
          :local-market-matches="localMarketMatches"
          @select="openDay"
        />
      </article>

      <div class="chart-grid">
        <ChartCard class="wide" dense :title="t('weekdayTime')" :copy="t('weekdayTimeCopy')" :option="heatmapOption" tall />
        <ChartCard :title="t('weekdayTrips')" :option="weekdayTripOption" />
        <ChartCard :title="t('weekdaySpend')" :option="weekdaySpendOption" />
        <ChartCard
          :title="isAllYears && hasMultipleYears ? t('monthlySpendStacked') : t('monthlySpend')"
          :copy="isAllYears && hasMultipleYears ? t('monthlySpendStackedCopy') : undefined"
          :option="monthlyOption"
        />
        <ChartCard dense :title="t('hourlyTrips')" :option="hourlyOption" />
        <ChartCard class="wide" dense :title="t('weeklyTrips')" :copy="t('weeklyTripsCopy')" :option="weeklyOption" />
        <ChartCard class="wide" dense :title="t('scatter')" :option="scatterOption" tall />
      </div>
    </template>
    <p v-else class="empty-filtered">{{ t('emptyFiltered') }}</p>

    <div v-if="selectedDay" class="day-backdrop" @click.self="closeDay">
      <aside ref="dayPanelRef" class="day-panel" role="dialog" aria-modal="true" :aria-label="t('dayDetails')" @keydown="handleDayKeys">
        <button ref="dayCloseRef" class="close-button" type="button" @click="closeDay" :aria-label="t('close')">×</button>
        <p class="eyebrow">{{ t('dayDetails') }}</p><h2>{{ isAllYears ? formatMonthDay(selectedDay.date) : formatDate(selectedDay.date) }}</h2>
        <div class="day-total"><strong>{{ money(selectedDay.totalCents) }}</strong><span>{{ selectedDay.trips }} {{ t('trips').toLowerCase() }}</span></div>
        <ul><li v-for="receipt in selectedDay.receipts" :key="receipt.id"><time>{{ isAllYears ? `${receipt.localTimestamp.slice(0, 4)} · ` : '' }}{{ receipt.localTimestamp.slice(11, 16) }}</time><span>{{ marketShortName(receipt.marketId) }} · {{ t('receipt') }} {{ receipt.receiptNumber }}</span><strong>{{ money(receipt.totalCents) }}</strong></li></ul>
      </aside>
    </div>
  </section>
</template>
