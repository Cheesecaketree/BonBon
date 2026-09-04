import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { germanLanding } from './src/i18n/landing'

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function staticLandingHtml() {
  const copy = Object.fromEntries(
    Object.entries(germanLanding).map(([key, value]) => [key, escapeHtml(value)]),
  ) as Record<keyof typeof germanLanding, string>

  return `
    <main class="app-shell static-landing">
      <header class="topbar">
        <a class="wordmark" href="/" aria-label="BonBon Startseite"><span>Bon</span><span>Bon</span></a>
      </header>
      <section class="hero-grid">
        <div class="hero-copy">
          <h1>${copy.tagline}</h1>
          <p class="lede">${copy.intro}</p>
          <div class="promise-row" aria-label="Vorteile"><span>${copy.local}</span><span>${copy.noAccount}</span><span>${copy.noCloud}</span></div>
        </div>
        <article class="import-panel static-import-note">
          <div class="receipt-mark" aria-hidden="true"><span></span><span></span><span></span></div>
          <div class="import-copy">
            <p class="kicker">BONBON IMPORT</p>
            <h2>${copy.dropTitle}</h2>
            <p>${copy.dropCopy}</p>
          </div>
          <p class="fine-print">${copy.processingNote}</p>
          <noscript><p class="noscript-note">Für die lokale Auswertung deiner eBons benötigt BonBon JavaScript. Deine Dateien verlassen dabei nicht deinen Browser.</p></noscript>
        </article>
      </section>
      <section class="steps" aria-labelledby="static-steps-title">
        <div><p class="eyebrow">${copy.howLabel}</p><h2 id="static-steps-title">${copy.howItWorks}</h2></div>
        <ol><li><span>01</span>${copy.stepOne}</li><li><span>02</span>${copy.stepTwo}</li><li><span>03</span>${copy.stepThree}</li></ol>
      </section>
      <section class="static-privacy" aria-labelledby="static-privacy-title">
        <p class="eyebrow">DATEN &amp; PRIVATSPHÄRE</p>
        <h2 id="static-privacy-title">${copy.localOnlyTitle}</h2>
        <p>${copy.localOnlyCopy}</p>
      </section>
    </main>`
}

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'bonbon-static-landing',
      transformIndexHtml(html) {
        return html.replace('<!--app-static-fallback-->', staticLandingHtml())
      },
    },
  ],
  build: { chunkSizeWarningLimit: 700 },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'dist/**'],
  },
})
