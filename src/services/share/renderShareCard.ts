/**
 * Draws a portrait share card (1080 × 1350, a common social-media format) onto a canvas.
 * Rendering happens locally; the caller decides whether to download or hand the image to the OS share sheet.
 */

export interface ShareCardModel {
  kicker: string
  title: string
  period: string
  lead: { label: string; value: string; note: string }
  stats: { label: string; value: string }[]
  lists: { title: string; items: string[] }[]
  footer: string
}

export const shareCardSize = { width: 1080, height: 1350 }

const colors = { paper: '#f3ecdf', cream: '#fffaf1', ink: '#241d1d', muted: '#756767', berry: '#9b2848', berryDark: '#6f1732', line: 'rgba(36,29,29,0.17)', tint: 'rgba(155,40,72,0.08)' }
const serif = 'Georgia, "Times New Roman", serif'
const sans = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif'

function fit(context: CanvasRenderingContext2D, text: string, width: number) {
  if (context.measureText(text).width <= width) return text
  let value = text
  while (value.length > 1 && context.measureText(`${value}…`).width > width) value = value.slice(0, -1)
  return `${value.trimEnd()}…`
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number, maxLines: number) {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (context.measureText(candidate).width <= width || !line) line = candidate
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  kept[maxLines - 1] = fit(context, `${kept[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`, width)
  return kept
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath()
  context.moveTo(x + radius, y)
  context.arcTo(x + width, y, x + width, y + height, radius)
  context.arcTo(x + width, y + height, x, y + height, radius)
  context.arcTo(x, y + height, x, y, radius)
  context.arcTo(x, y, x + width, y, radius)
  context.closePath()
}

export function drawShareCard(context: CanvasRenderingContext2D, model: ShareCardModel) {
  const { width, height } = shareCardSize
  const margin = 72
  const inner = width - margin * 2
  context.textBaseline = 'alphabetic'

  context.fillStyle = colors.paper
  context.fillRect(0, 0, width, height)
  roundedRect(context, 40, 40, width - 80, height - 80, 36)
  context.fillStyle = colors.cream
  context.fill()
  context.strokeStyle = colors.line
  context.lineWidth = 2
  context.stroke()

  let y = 128
  context.fillStyle = colors.berry
  context.font = `800 22px ${sans}`
  context.fillText(fit(context, model.kicker.toLocaleUpperCase(), inner), margin, y)
  y += 78
  context.fillStyle = colors.ink
  context.font = `400 64px ${serif}`
  for (const line of wrap(context, model.title, inner, 2)) {
    context.fillText(line, margin, y)
    y += 72
  }
  context.fillStyle = colors.muted
  context.font = `500 24px ${sans}`
  context.fillText(fit(context, model.period, inner), margin, y - 18)
  y += 30

  roundedRect(context, margin, y, inner, 250, 24)
  context.fillStyle = colors.tint
  context.fill()
  context.fillStyle = colors.muted
  context.font = `800 20px ${sans}`
  context.fillText(fit(context, model.lead.label.toLocaleUpperCase(), inner - 80), margin + 40, y + 58)
  context.fillStyle = colors.berry
  context.font = `400 120px ${serif}`
  context.fillText(fit(context, model.lead.value, inner - 80), margin + 40, y + 172)
  context.fillStyle = colors.muted
  context.font = `500 24px ${sans}`
  context.fillText(fit(context, model.lead.note, inner - 80), margin + 40, y + 218)
  y += 250

  const stats = model.stats.slice(0, 3)
  const lists = model.lists.filter((list) => list.items.length).slice(0, 2)
  const footerTop = height - 140
  // Spread the remaining blocks evenly between the lead figure and the footer.
  const listsHeight = lists.length ? 104 + Math.max(...lists.map((list) => Math.min(list.items.length, 4))) * 52 : 0
  const blocks = (stats.length ? 1 : 0) + (lists.length ? 1 : 0)
  const gap = Math.max(40, (footerTop - 40 - y - (stats.length ? 104 : 0) - listsHeight) / (blocks + 1))
  y += gap

  if (stats.length) {
    const column = inner / stats.length
    stats.forEach((stat, index) => {
      const x = margin + column * index
      if (index) {
        context.fillStyle = colors.line
        context.fillRect(x - 1, y, 2, 104)
      }
      const offset = index ? 28 : 0
      context.fillStyle = colors.muted
      context.font = `800 18px ${sans}`
      context.fillText(fit(context, stat.label.toLocaleUpperCase(), column - offset - 16), x + offset, y + 28)
      context.fillStyle = colors.ink
      context.font = `400 46px ${serif}`
      context.fillText(fit(context, stat.value, column - offset - 16), x + offset, y + 88)
    })
    y += 104 + gap
  }

  if (lists.length) {
    const column = (inner - 40 * (lists.length - 1)) / lists.length
    lists.forEach((list, index) => {
      const x = margin + (column + 40) * index
      let listY = y
      context.fillStyle = colors.line
      context.fillRect(x, listY, column, 2)
      listY += 52
      context.fillStyle = colors.berry
      context.font = `800 20px ${sans}`
      context.fillText(fit(context, list.title.toLocaleUpperCase(), column), x, listY)
      listY += 52
      context.font = `400 34px ${serif}`
      for (const item of list.items.slice(0, 4)) {
        if (listY > footerTop - 20) break
        context.fillStyle = colors.ink
        context.fillText(fit(context, item, column), x, listY)
        listY += 52
      }
    })
  }

  context.fillStyle = colors.line
  context.fillRect(margin, footerTop, inner, 2)
  context.fillStyle = colors.ink
  context.font = `400 40px ${serif}`
  context.fillText('Bon', margin, footerTop + 64)
  const bon = context.measureText('Bon').width
  context.fillStyle = colors.berry
  context.fillText('Bon', margin + bon - 2, footerTop + 64)
  context.fillStyle = colors.muted
  context.font = `500 20px ${sans}`
  context.textAlign = 'right'
  context.fillText(fit(context, model.footer, inner - 200), width - margin, footerTop + 60)
  context.textAlign = 'left'
}

/** Renders the card to a PNG blob, or null where canvas is unavailable. */
export async function renderShareCard(model: ShareCardModel): Promise<Blob | null> {
  const canvas = document.createElement('canvas')
  canvas.width = shareCardSize.width
  canvas.height = shareCardSize.height
  let context: CanvasRenderingContext2D | null = null
  try { context = canvas.getContext('2d') } catch { return null }
  if (!context) return null
  await document.fonts?.ready
  drawShareCard(context, model)
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'))
}
