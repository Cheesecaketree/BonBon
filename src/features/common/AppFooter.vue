<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineEmits<{
  navigate: [view: 'dashboard' | 'market-help' | 'about', tab?: 'about' | 'privacy']
}>()

const { t } = useI18n()
</script>

<template>
  <footer class="site-footer">
    <div class="footer-container">
      <div class="footer-brand">
        <a class="footer-wordmark" href="#/" @click.prevent="$emit('navigate', 'dashboard')">
          <span>Bon</span><span>Bon</span>
        </a>
        <p class="footer-tagline">{{ t('footerTagline') }}</p>
        <p class="footer-license">
          <a href="#/about" @click.prevent="$emit('navigate', 'about', 'about')">{{ t('licenseName') }}</a>
          · {{ t('allRightsFree') }}
        </p>
      </div>

      <nav class="footer-nav" :aria-label="t('about')">
        <ul class="footer-links">
          <li>
            <a href="#/about" @click.prevent="$emit('navigate', 'about', 'about')">{{ t('about') }}</a>
          </li>
          <li>
            <a href="#/privacy" @click.prevent="$emit('navigate', 'about', 'privacy')">{{ t('privacy') }}</a>
          </li>
          <li>
            <a href="#/help/markets" @click.prevent="$emit('navigate', 'market-help')">{{ t('improveMarketData') }}</a>
          </li>
          <li>
            <a
              class="footer-github-link"
              href="https://github.com/Cheesecaketree/BonBon"
              target="_blank"
              rel="noopener noreferrer"
            >
              <span>GitHub</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                <polyline points="15 3 21 3 21 9"></polyline>
                <line x1="10" y1="14" x2="21" y2="3"></line>
              </svg>
            </a>
          </li>
        </ul>
      </nav>
    </div>
  </footer>
</template>
