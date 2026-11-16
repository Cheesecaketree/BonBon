import { reactive, readonly } from 'vue'

/**
 * Export navigation state lives in the URL hash, e.g. `#/rewe-export/shopping/purchases?start=2025-01-01`.
 * The hash never leaves the browser, so view, filters and selected product stay local while the back
 * button, reloads and bookmarks keep working.
 */

export type ExportArea = 'shopping' | 'rewe'
export type ExportView = 'insights' | 'purchases' | 'products' | 'bonus' | 'summary' | 'profile' | 'activity'
export type ExportSort = 'spend' | 'days' | 'quantity' | 'name'

export const exportAreaViews: Record<ExportArea, ExportView[]> = {
  shopping: ['insights', 'purchases', 'products', 'bonus'],
  rewe: ['summary', 'profile', 'activity'],
}
const areaHome: Record<ExportArea, ExportView> = { shopping: 'insights', rewe: 'summary' }

export interface ExportRoute {
  view: ExportView
  start: string
  end: string
  market: string
  q: string
  sort: ExportSort
  product: string
}

export const exportRoot = '#/rewe-export'
const sorts: ExportSort[] = ['spend', 'days', 'quantity', 'name']
const isoDate = /^\d{4}-\d{2}-\d{2}$/

export function defaultExportRoute(): ExportRoute {
  return { view: 'insights', start: '', end: '', market: '', q: '', sort: 'spend', product: '' }
}

export function exportArea(view: ExportView): ExportArea {
  return exportAreaViews.rewe.includes(view) ? 'rewe' : 'shopping'
}

export function isExportHash(hash: string) {
  return hash === exportRoot || hash.startsWith(`${exportRoot}/`) || hash.startsWith(`${exportRoot}?`)
}

export function parseExportHash(hash: string): ExportRoute | null {
  if (!isExportHash(hash)) return null
  const [path = '', query = ''] = hash.slice(exportRoot.length).split('?')
  const [areaSegment, viewSegment] = path.split('/').filter(Boolean)
  const area: ExportArea = areaSegment === 'rewe' ? 'rewe' : 'shopping'
  const view = exportAreaViews[area].find((candidate) => candidate === viewSegment) ?? areaHome[area]
  const params = new URLSearchParams(query)
  const date = (name: string) => {
    const value = params.get(name) ?? ''
    if (!isoDate.test(value)) return ''
    const parsed = new Date(`${value}T00:00:00Z`)
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : ''
  }
  const sort = params.get('sort') as ExportSort
  return {
    view,
    start: date('start'),
    end: date('end'),
    market: params.get('market') ?? '',
    q: params.get('q') ?? '',
    sort: sorts.includes(sort) ? sort : 'spend',
    product: params.get('product') ?? '',
  }
}

export function exportHash(route: ExportRoute) {
  const area = exportArea(route.view)
  const path = route.view === areaHome[area] ? `/${area}` : `/${area}/${route.view}`
  const params = new URLSearchParams()
  if (route.start) params.set('start', route.start)
  if (route.end) params.set('end', route.end)
  if (route.market) params.set('market', route.market)
  if (route.q) params.set('q', route.q)
  if (route.sort !== 'spend') params.set('sort', route.sort)
  if (route.product) params.set('product', route.product)
  const query = params.toString()
  return `${exportRoot}${path}${query ? `?${query}` : ''}`
}

const state = reactive<ExportRoute>(parseExportHash(typeof window === 'undefined' ? '' : window.location.hash) ?? defaultExportRoute())
let listening = false

function syncFromHash() {
  const parsed = parseExportHash(window.location.hash)
  // Leaving the export (receipts, about page) keeps the last export state for when the user returns.
  if (parsed) Object.assign(state, parsed)
}

/** The hash to restore when the user switches back to the export from another part of the app. */
export function lastExportHash() { return exportHash(state) }

export interface NavigateOptions { replace?: boolean }

export function navigateExport(patch: Partial<ExportRoute>, options: NavigateOptions = {}) {
  const next: ExportRoute = { ...state, ...patch }
  // Switching between views drops the product selection unless the caller sets one explicitly.
  if (patch.view && patch.view !== state.view && !('product' in patch)) next.product = ''
  const hash = exportHash(next)
  Object.assign(state, next)
  if (hash === window.location.hash) return
  if (options.replace) window.history.replaceState(window.history.state, '', hash)
  else window.location.hash = hash
}

export function resetExportRoute(options: NavigateOptions = { replace: true }) {
  navigateExport(defaultExportRoute(), options)
}

export function useExportRoute() {
  if (!listening && typeof window !== 'undefined') {
    listening = true
    window.addEventListener('hashchange', syncFromHash)
  }
  syncFromHash()
  return { route: readonly(state), navigate: navigateExport, reset: resetExportRoute }
}
