export interface ExportDateRange { start: string; end: string }
export type ExportDatePreset = 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'lastYear' | 'last90Days'

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function inExportRange(date: string, range?: ExportDateRange) {
  return !range || ((!range.start || date >= range.start) && (!range.end || date <= range.end))
}

export function normalizeExportRange(start: string, end: string): ExportDateRange {
  return start && end && start > end ? { start: end, end: start } : { start, end }
}

export function exportDatePreset(preset: ExportDatePreset, today = localDate()): ExportDateRange {
  const [year, month, day] = today.split('-').map(Number)
  const iso = (date: Date) => date.toISOString().slice(0, 10)
  if (preset === 'thisMonth') return { start: `${today.slice(0, 7)}-01`, end: today }
  if (preset === 'lastMonth') return { start: iso(new Date(Date.UTC(year!, month! - 2, 1))), end: iso(new Date(Date.UTC(year!, month! - 1, 0))) }
  if (preset === 'thisYear') return { start: `${year}-01-01`, end: today }
  if (preset === 'lastYear') return { start: `${year! - 1}-01-01`, end: `${year! - 1}-12-31` }
  if (preset === 'last90Days') return { start: iso(new Date(Date.UTC(year!, month! - 1, day! - 89))), end: today }
  return { start: '', end: '' }
}
