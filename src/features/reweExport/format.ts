import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { profileValueFormat, profileValueToken } from '../../domain/receipts/reweExport/profile'
import type { ExportFact } from '../../domain/receipts/reweExport/schema'

/** Locale-aware formatting shared by the export views. */
export function useExportFormat() {
  const { t, locale } = useI18n()
  const localeName = computed(() => locale.value === 'de' ? 'de-DE' : 'en-GB')
  const currency = computed(() => new Intl.NumberFormat(localeName.value, { style: 'currency', currency: 'EUR' }))
  const wholeCurrency = computed(() => new Intl.NumberFormat(localeName.value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }))
  const decimal = computed(() => new Intl.NumberFormat(localeName.value, { maximumFractionDigits: 3 }))
  const shortDecimal = computed(() => new Intl.NumberFormat(localeName.value, { maximumFractionDigits: 1 }))
  const rounding = computed(() => new Intl.NumberFormat(localeName.value, { maximumFractionDigits: 2 }))
  const percentFormat = computed(() => new Intl.NumberFormat(localeName.value, { style: 'percent', maximumFractionDigits: 1 }))
  const wholePercent = computed(() => new Intl.NumberFormat(localeName.value, { style: 'percent', maximumFractionDigits: 0 }))

  const money = (cents: number) => currency.value.format(cents / 100)
  const roundMoney = (cents: number) => wholeCurrency.value.format(cents / 100)
  const number = (value: number) => decimal.value.format(value)
  const short = (value: number) => shortDecimal.value.format(value)
  const rounded = (value: number) => rounding.value.format(value)
  const percent = (value: number) => percentFormat.value.format(value)
  const share = (value: number) => wholePercent.value.format(value)

  function date(value: string) {
    const day = value.slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return value
    const parsed = new Date(`${day}T00:00:00Z`)
    if (!Number.isFinite(parsed.getTime())) return value
    return new Intl.DateTimeFormat(localeName.value, { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(parsed)
  }

  function month(value: string, style: 'short' | 'long' = 'short') {
    return new Intl.DateTimeFormat(localeName.value, { month: style, year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}-01T00:00:00Z`))
  }

  // 2024-01-07 is a Sunday, so adding the JavaScript weekday index yields that weekday.
  function weekday(day: number, style: 'short' | 'long' = 'long') {
    return new Intl.DateTimeFormat(localeName.value, { weekday: style, timeZone: 'UTC' }).format(new Date(Date.UTC(2024, 0, 7 + day)))
  }

  /** Displays a stored profile value with its known format and an English translation where one exists. */
  function factValue(fact: ExportFact) {
    const value = Number(fact.value)
    const format = profileValueFormat(fact.field)
    if (format === 'money' && Number.isFinite(value)) return money(Math.round(value * 100))
    if (format === 'ratio' && Number.isFinite(value)) return percent(value)
    if (format === 'percent' && Number.isFinite(value)) return `${rounded(value)} %`
    if (format === 'date') return date(fact.value)
    if (format === 'boolean') {
      if (fact.value === 'true' || value === 1) return t('reweExport.values.yes')
      if (fact.value === 'false' || value === 0) return t('reweExport.values.no')
      return fact.value
    }
    if (format === 'number' && Number.isFinite(value)) return rounded(value)
    const age = locale.value === 'en' && fact.field === 'LEBENSPHASE' ? fact.value.match(/^(\d+)\s+bis\s+(\d+)\s+Jahre$/) : undefined
    if (age) return t('reweExport.ageRange', { from: age[1], to: age[2] })
    const token = locale.value === 'en' ? profileValueToken(fact) : undefined
    if (token) return t(`reweExport.values.${token}`)
    if (/^[+-]?\d+(?:\.\d+|[eE][+-]?\d+)/.test(fact.value) && Number.isFinite(value)) return rounded(value)
    return fact.value
  }

  return { localeName, money, roundMoney, number, short, rounded, percent, share, date, month, weekday, factValue }
}
