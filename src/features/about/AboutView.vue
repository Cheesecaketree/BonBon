<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const props = withDefaults(
  defineProps<{
    initialTab?: 'about' | 'privacy'
    hasReceipts?: boolean
  }>(),
  {
    initialTab: 'about',
    hasReceipts: false,
  },
)

const emit = defineEmits<{
  navigate: [view: 'dashboard']
}>()

const { t } = useI18n()
const activeTab = ref<'about' | 'privacy'>(props.initialTab)

watch(
  () => props.initialTab,
  (newTab) => {
    activeTab.value = newTab
  },
)

function switchTab(tab: 'about' | 'privacy') {
  activeTab.value = tab
  window.location.hash = tab === 'privacy' ? '#/privacy' : '#/about'
}
</script>

<template>
  <section class="about-page">
    <div class="about-container">
      <button class="back-link" type="button" @click="emit('navigate', 'dashboard')">
        ← {{ hasReceipts ? t('backToDashboard') : t('backToOverview') }}
      </button>

      <header class="about-header">
        <div class="about-header-copy">
          <p class="eyebrow">{{ activeTab === 'privacy' ? t('privacyEyebrow') : t('aboutEyebrow') }}</p>
          <h1>{{ activeTab === 'privacy' ? t('privacyHeading') : t('aboutHeading') }}</h1>
          <p class="about-lead">{{ activeTab === 'privacy' ? t('privacyIntro') : t('aboutIntro') }}</p>
        </div>

        <div class="about-tab-toggle" role="tablist" :aria-label="t('aboutTabLabel')">
          <button
            id="tab-btn-about"
            type="button"
            role="tab"
            :class="{ active: activeTab === 'about' }"
            :aria-selected="activeTab === 'about'"
            aria-controls="panel-about"
            @click="switchTab('about')"
          >
            {{ t('aboutTabAbout') }}
          </button>
          <button
            id="tab-btn-privacy"
            type="button"
            role="tab"
            :class="{ active: activeTab === 'privacy' }"
            :aria-selected="activeTab === 'privacy'"
            aria-controls="panel-privacy"
            @click="switchTab('privacy')"
          >
            {{ t('aboutTabPrivacy') }}
          </button>
        </div>
      </header>

      <!-- About Tab Content -->
      <div
        v-if="activeTab === 'about'"
        id="panel-about"
        role="tabpanel"
        aria-labelledby="tab-btn-about"
        class="about-content"
      >
        <div class="about-card-grid">
          <!-- AI Involvement Notice Card -->
          <article class="about-card highlight-card ai-card">
            <div class="about-card-header">
              <span class="about-badge ai-badge">{{ t('aboutAiBadge') }}</span>
              <h2>{{ t('aboutAiTitle') }}</h2>
            </div>
            <p>{{ t('aboutAiCopy') }}</p>
          </article>

          <!-- 0BSD License Card -->
          <article class="about-card license-card">
            <div class="about-card-header">
              <span class="about-badge license-badge">{{ t('aboutLicenseBadge') }}</span>
              <h2>{{ t('aboutLicenseTitle') }}</h2>
            </div>
            <p>{{ t('aboutLicenseCopy') }}</p>
          </article>

          <!-- GitHub Card -->
          <article class="about-card github-card">
            <div class="about-card-header">
              <div class="github-card-title-group">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
                </svg>
                <h2>{{ t('aboutGithubTitle') }}</h2>
              </div>
            </div>
            <p>{{ t('aboutGithubCopy') }}</p>
            <div class="about-card-action">
              <a
                class="button primary github-button"
                href="https://github.com/Cheesecaketree/BonBon"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('aboutGithubButton') }} ↗
              </a>
            </div>
          </article>
        </div>

        <!-- Principles / Tech Grid -->
        <section class="principles-section" aria-labelledby="principles-title">
          <h2 id="principles-title" class="principles-heading">{{ t('aboutTechTitle') }}</h2>
          <div class="principles-grid">
            <article class="principle-item">
              <div class="principle-number">01</div>
              <h3>{{ t('aboutTechLocalTitle') }}</h3>
              <p>{{ t('aboutTechLocalCopy') }}</p>
            </article>
            <article class="principle-item">
              <div class="principle-number">02</div>
              <h3>{{ t('aboutTechPrivacyTitle') }}</h3>
              <p>{{ t('aboutTechPrivacyCopy') }}</p>
            </article>
            <article class="principle-item">
              <div class="principle-number">03</div>
              <h3>{{ t('aboutTechDatasetTitle') }}</h3>
              <p>{{ t('aboutTechDatasetCopy') }}</p>
            </article>
            <article class="principle-item">
              <div class="principle-number">04</div>
              <h3>{{ t('aboutTechStackTitle') }}</h3>
              <p>{{ t('aboutTechStackCopy') }}</p>
            </article>
          </div>
        </section>
      </div>

      <!-- Privacy Tab Content -->
      <div
        v-else
        id="panel-privacy"
        role="tabpanel"
        aria-labelledby="tab-btn-privacy"
        class="privacy-notice-content"
      >
        <div class="privacy-sections-list">
          <article class="privacy-section-card">
            <h2>{{ t('privacyLocalTitle') }}</h2>
            <p>{{ t('privacyLocalCopy') }}</p>
          </article>

          <article class="privacy-section-card">
            <h2>{{ t('privacyStorageTitle') }}</h2>
            <p>{{ t('privacyStorageCopy') }}</p>
          </article>

          <article class="privacy-section-card">
            <h2>{{ t('privacyHostingTitle') }}</h2>
            <p>{{ t('privacyHostingCopy') }}</p>
          </article>

          <article class="privacy-section-card">
            <h2>{{ t('privacyAnalyticsTitle') }}</h2>
            <p>{{ t('privacyAnalyticsCopy') }}</p>
          </article>

          <article class="privacy-section-card">
            <h2>{{ t('privacyCrowdsourcingTitle') }}</h2>
            <p>{{ t('privacyCrowdsourcingCopy') }}</p>
          </article>

          <article class="privacy-section-card">
            <h2>{{ t('privacyThirdPartyTitle') }}</h2>
            <p>{{ t('privacyThirdPartyCopy') }}</p>
          </article>

          <article class="privacy-section-card contact-card">
            <h2>{{ t('privacyContactTitle') }}</h2>
            <p>{{ t('privacyContactCopy') }}</p>
            <div class="contact-action">
              <a
                class="button secondary"
                href="https://github.com/Cheesecaketree/BonBon"
                target="_blank"
                rel="noopener noreferrer"
              >
                https://github.com/Cheesecaketree/BonBon ↗
              </a>
            </div>
          </article>
        </div>
      </div>
    </div>
  </section>
</template>
