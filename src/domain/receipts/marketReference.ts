const SPACED_REWE = /\bR\s+E\s+W\s+E\b/giu
const PHONE_LABEL = /^(?:tel(?:(?:efon)(?:nummer)?|-?nr\.?)?|fon|phone|fax)(?:\s*[.:]{1,2}\s*|\s+)/i
const PHONE_SUFFIX = /\s+(?:tel(?:(?:efon)(?:nummer)?|-?nr\.?)?|fon|phone|fax)(?:\s*[.:]{1,2}\s*|\s+)[+()\d][\d\s()+./-]*$/i
const NON_MARKET_DETAIL = /^(?:steuernr\.?|steuer-?nr\.?|steuernummer|ust(?:-?id)?(?:-?nr\.?)?|st\.-nr\.|uid)\s*[:.]|^barcode\b/i

export function normalizeMarketRetailerName(value: string): string {
  return value.replace(SPACED_REWE, 'REWE')
}

function isPhoneOnly(value: string): boolean {
  const digits = (value.match(/\d/g) || []).length
  if (PHONE_LABEL.test(value) && digits >= 4) return true
  if (!/^[+()\d][\d\s()+./-]+$/.test(value)) return false
  return digits >= 6
}

export function sanitizeMarketReference(raw: string): string {
  return raw
    .split(/[\r\n,]+/)
    .map((part) => normalizeMarketRetailerName(part.replace(/\s+/g, ' ').trim()).replace(PHONE_SUFFIX, '').trim())
    .filter((part) => part && !isPhoneOnly(part) && !NON_MARKET_DETAIL.test(part))
    .join(', ')
}
