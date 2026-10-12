import { emptyReweExport, hasExportData, reweExportSchema, type ExportOrigin, type ReweExport } from '../../domain/receipts/reweExport/schema'

function normalizeNumber(raw: string) {
  const value = raw.trim().replace(/\s/g, '')
  return value.includes(',') ? value.replace(/\./g, '').replace(',', '.') : value
}

export function exportNumber(raw: string) {
  const normalized = normalizeNumber(raw)
  if (!/^[+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(normalized)) throw new Error('invalid-number')
  const result = Number(normalized)
  if (!Number.isFinite(result)) throw new Error('invalid-number')
  return result
}

export function exportCents(raw: string) {
  const value = exportNumber(raw)
  const normalized = /[eE]/.test(raw) ? value.toFixed(12) : normalizeNumber(raw)
  const [whole = '0', fraction = ''] = normalized.replace(/^[+-]/, '').split('.')
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0').slice(0, 2)) + (Number(fraction[2] ?? '0') >= 5 ? 1 : 0)
  if (!Number.isSafeInteger(cents)) throw new Error('invalid-number')
  return value < 0 ? -cents : cents
}

function validDate(raw: string) {
  const date = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid-date')
  const parsed = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('invalid-date')
  return date
}

function receiptTimestamp(raw: string) {
  const match = raw.match(/^(\d{2})\.(\d{2})\.(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!match) throw new Error('invalid-date')
  const [, day, month, year, hour, minute, second] = match
  const date = validDate(`${year}-${month}-${day}`)
  if (Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) throw new Error('invalid-date')
  return { date, timestamp: `${date}T${hour}:${minute}:${second}` }
}

function quantityUnit(name: string, quantity: number): 'item' | 'kg' | 'l' | 'unknown' {
  if (/\b1KG\s+LS[·\s]/i.test(name)) return 'kg'
  if (/\b1L\s+LS[·\s]/i.test(name)) return 'l'
  return Number.isInteger(quantity) ? 'item' : 'unknown'
}

const nullValues = new Set(['', 'None', 'NaT', 'nan', 'null'])
const safeAccountFields = new Set(['Date_Created1', 'registrationDate'])

/** Template contents are inert: exported scripts and embedded resources are never mounted. */
export function readExportHtml(html: string, filename: string, target = emptyReweExport()): ReweExport {
  const template = document.createElement('template')
  template.innerHTML = html
  template.content.querySelectorAll('script,style,iframe,object,embed,link,img,video,audio,source').forEach((node) => node.remove())
  let section = ''
  let tableIndex = 0
  let recognizedTables = 0
  let skippedRows = 0

  for (const node of template.content.querySelectorAll('h1,h2,h3,h4,table')) {
    if (node.tagName !== 'TABLE') {
      const heading = node.textContent?.trim() ?? ''
      if (/^Datenobjekt:/.test(heading)) section = heading.replace(/^Datenobjekt:\s*/, '')
      else if (node.tagName === 'H2' || node.tagName === 'H1') section = heading
      continue
    }
    const index = tableIndex++
    const rows = [...node.querySelectorAll('tr')].filter((row) => row.closest('table') === node).map((row) =>
      [...row.children].filter((cell) => ['TD', 'TH'].includes(cell.tagName)).map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim()),
    )
    const header = rows[0] ?? []
    if (!header.length) continue
    const has = (...fields: string[]) => fields.every((field) => header.includes(field))
    const origin = (row: number): ExportOrigin => ({ file: filename, table: index, row })
    let recognized = false
    function horizontal(fields: string[], process: (get: (key: string) => string, origin: ExportOrigin) => void) {
      if (!has(...fields)) return false
      recognized = true
      rows.slice(1).forEach((cells, row) => {
        try {
          if (cells.length !== header.length) throw new Error('invalid-row')
          process((key) => cells[header.indexOf(key)] ?? '', origin(row + 1))
        } catch { skippedRows += 1 }
      })
      return true
    }

    if (horizontal(['MARKT', 'TAG', 'ARTIKEL', 'MENGE', 'BETRAG'], (get, source) => {
      const name = get('ARTIKEL')
      const market = get('MARKT')
      if (!name || !market) throw new Error('invalid-row')
      const quantity = exportNumber(get('MENGE'))
      const lineTotalCents = exportCents(get('BETRAG'))
      const kind = /LEERGUT|RUECKGABE|RÜCKGABE/i.test(name) ? 'depositReturn'
        : /PFAND|FLASCHE LEER/i.test(name) ? (lineTotalCents < 0 ? 'depositReturn' : 'deposit')
        : lineTotalCents < 0 ? 'discount' : 'product'
      target.purchases.push({ date: validDate(get('TAG')), market, name, quantity, quantityUnit: quantityUnit(name, quantity), lineTotalCents, kind, origin: source })
    })) { /* Separate source table, without invented receipt identities. */ }
    else if (horizontal(['Rechnungsnummer', 'Storno Status', 'Rechnungszeitstempel'], (get, source) => {
      const raw = get('Storno Status')
      if (!['true', 'false'].includes(raw)) throw new Error('invalid-row')
      target.receiptIndex.push({ ...receiptTimestamp(get('Rechnungszeitstempel')), receiptNumber: get('Rechnungsnummer'), cancelled: raw === 'true', origin: source })
    })) { /* Index entries remain independent from purchased products. */ }
    else if (horizontal(['MARKT', 'TAG', 'ARTIKEL', 'GESAMMELTES_GUTHABEN'], (get, source) => {
      target.itemBonus.push({ date: validDate(get('TAG')), market: get('MARKT'), name: get('ARTIKEL'), cents: exportCents(get('GESAMMELTES_GUTHABEN')), origin: source })
    })) { /* Product-level benefits are not added to the Bonus ledger. */ }
    else if (horizontal(['TAG', 'TRANSAKTIONSART', 'TRANSAKTIONS_TYP', 'BETRAG'], (get, source) => {
      const type = get('TRANSAKTIONS_TYP')
      if (type !== 'CREDIT' && type !== 'DEBIT') throw new Error('invalid-row')
      const cents = exportCents(get('BETRAG'))
      if ((type === 'CREDIT' && cents < 0) || (type === 'DEBIT' && cents > 0)) throw new Error('invalid-row')
      target.bonusTransactions.push({ date: validDate(get('TAG')), channel: get('TRANSAKTIONSART'), type, cents, origin: source })
    })) { /* Preserve the ledger independently of the item-level benefits. */ }
    else if (horizontal(['TAG', 'GUTHABENSTAND'], (get, source) => {
      target.balances.push({ date: validDate(get('TAG')), cents: exportCents(get('GUTHABENSTAND')), origin: source })
    })) { /* Observations, never summed. */ }
    else if (horizontal(['TAG', 'COUPON', 'COUPON_STATUS'], (get, source) => {
      target.coupons.push({ date: validDate(get('TAG')), title: get('COUPON'), status: get('COUPON_STATUS'), origin: source })
    })) { /* Status rows, not distinct coupons. */ }
    else if (horizontal(['TAG', 'BONUS_CHALLENGE', 'STATUS_CHALLENGE'], (get, source) => {
      target.challenges.push({ date: validDate(get('TAG')), title: get('BONUS_CHALLENGE'), status: get('STATUS_CHALLENGE'), origin: source })
    })) { /* Status rows, not distinct challenges. */ }
    else if (horizontal(['Artikelnummer', 'Artikelbezeichnung', 'Gewichtung/Interesse (0=niedrig, 1=hoch)'], (get, source) => {
      const score = exportNumber(get('Gewichtung/Interesse (0=niedrig, 1=hoch)'))
      if (score < 0 || score > 1) throw new Error('invalid-row')
      target.interests.push({ articleId: get('Artikelnummer'), name: get('Artikelbezeichnung'), score, origin: source })
    })) { /* Scores are not purchase probabilities. */ }
    else if (header.some((field) => ['KUNDENGRUPPE', 'SHARE_OF_WALLET', 'RFM_SEGMENT'].includes(field))) {
      recognized = true
      rows.slice(1).forEach((cells, row) => header.forEach((field, column) => {
        const value = cells[column]
        if (value && !nullValues.has(value)) target.facts.push({ field, value, section: 'Basis-Segmentierung', origin: origin(row + 1) })
      }))
    } else if (header[0] === '' && header.slice(1).every((field) => /^Datensatz \d+$/.test(field))) {
      recognized = true
      for (let column = 1; column < header.length; column += 1) {
        const fields: Record<string, string> = {}
        rows.slice(1).forEach((cells) => {
          if (cells[column] !== undefined && !nullValues.has(cells[column]!)) fields[cells[0]!] = cells[column]!
        })
        const firstField = rows[1]?.[0]
        const source = { ...origin(1), column }
        if (['App ID', 'ACTIVITY_KIND', 'Bonus Coupon: Title'].includes(firstField ?? '')) {
          const activitySource = firstField === 'App ID' ? 'app' : firstField === 'ACTIVITY_KIND' ? 'appEvents' : 'web'
          target.activities.push({ source: activitySource, recordId: header[column]!, timestamp: fields['Zeitstempel'] ?? fields['CREATED_AT'] ?? fields['Timestamp'] ?? '', fields, origin: source })
        } else {
          Object.entries(fields).forEach(([field, value]) => target.facts.push({ field, value, section, origin: { ...source, row: rows.findIndex((cells) => cells[0] === field) } }))
        }
      }
    } else if (header[0] === 'Datum / Attribut' && header.includes('Datenkategorie')) {
      recognized = true
      let current: ReweExport['consents'][number] | undefined
      let baseType = ''
      for (let row = 1; row < rows.length; row += 1) {
        const [field, value = ''] = rows[row]!
        if (field === 'consent_type' || field === 'Channel') {
          if (field === 'consent_type') baseType = value
          current = { type: field === 'Channel' ? `${baseType} · ${value}` : value, granted: false, changedAt: '', via: '', origin: origin(row) }
        } else if (current && field === 'state') {
          if (value === 'true' || value === 'false') {
            current.granted = value === 'true'
            target.consents.push(current)
          } else skippedRows += 1
        } else if (current && field === 'created_at') current.changedAt = value
        else if (current && field === 'origin') current.via = value
      }
    } else if (header.length === 2) {
      for (let row = 1; row < rows.length; row += 1) {
        const [field = '', value = ''] = rows[row]!
        if (safeAccountFields.has(field)) {
          recognized = true
          target.facts.push({ field, value, section: 'Konto', origin: origin(row) })
        }
      }
    }
    if (recognized) recognizedTables += 1
  }
  target.files.push({ name: filename, recognizedTables, skippedRows })
  return target
}

const MAX_BYTES = 100 * 1024 * 1024

export async function importExportFiles(files: File[], progress?: (done: number, total: number) => void): Promise<ReweExport> {
  const htmlFiles = files.filter((file) => /\.html?$/i.test(file.name))
  if (!htmlFiles.length || htmlFiles.length > 100 || htmlFiles.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new Error('invalid-files')
  const data = emptyReweExport()
  const fingerprints = new Set<string>()
  for (let index = 0; index < htmlFiles.length; index += 1) {
    const file = htmlFiles[index]!
    const bytes = await file.arrayBuffer()
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    const fingerprint = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    if (!fingerprints.has(fingerprint)) {
      fingerprints.add(fingerprint)
      readExportHtml(new TextDecoder().decode(bytes), file.name, data)
    }
    progress?.(index + 1, htmlFiles.length)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  if (!hasExportData(data)) throw new Error('empty-export')
  return reweExportSchema.parse(data)
}
