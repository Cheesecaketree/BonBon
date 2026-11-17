<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { guideCheckedOn, guideSegments, reweExportGuide, rewePrivacyPage } from '../../i18n/reweExportGuide'

const emit = defineEmits<{ import: [] }>()

const { locale } = useI18n()
const content = computed(() => reweExportGuide[locale.value === 'en' ? 'en' : 'de'])
const checkedOn = computed(() => {
  const [year, month] = guideCheckedOn.split('-').map(Number)
  const date = new Intl.DateTimeFormat(locale.value === 'en' ? 'en-GB' : 'de-DE', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)))
  return content.value.checked.replace('{date}', date)
})
</script>

<template>
  <section class="about-page export-guide" aria-labelledby="export-guide-title">
    <button class="back-link" type="button" @click="emit('import')">← {{ content.back }}</button>

    <header class="export-guide-header">
      <p class="eyebrow">{{ content.eyebrow }}</p>
      <h1 id="export-guide-title">{{ content.title }}</h1>
      <p class="about-lead">{{ content.lead }}</p>
      <a class="button primary" :href="rewePrivacyPage" target="_blank" rel="noopener noreferrer" data-rewe-privacy-link>{{ content.openPrivacy }} ↗</a>
      <p class="export-guide-checked">{{ checkedOn }}</p>
    </header>

    <ol class="export-guide-steps">
      <li v-for="(step, index) in content.steps" :key="step.title">
        <h2>{{ step.title }}</h2>
        <p>
          <template v-for="(segment, segmentIndex) in guideSegments(step.text)" :key="segmentIndex">
            <strong v-if="segment.label" class="ui-label">{{ segment.text }}</strong>
            <template v-else>{{ segment.text }}</template>
          </template>
        </p>
        <p v-if="step.note" class="export-guide-note">
          <template v-for="(segment, segmentIndex) in guideSegments(step.note)" :key="segmentIndex">
            <strong v-if="segment.label" class="ui-label">{{ segment.text }}</strong>
            <template v-else>{{ segment.text }}</template>
          </template>
        </p>
        <button v-if="index === content.steps.length - 1" class="button secondary" type="button" @click="emit('import')">{{ content.importButton }}</button>
      </li>
    </ol>

    <p class="export-guide-warning">
      <strong>{{ content.confusionTitle }}</strong>
      <template v-for="(segment, index) in guideSegments(content.confusionCopy)" :key="index">
        <strong v-if="segment.label" class="ui-label">{{ segment.text }}</strong>
        <template v-else>{{ index === 0 ? ` ${segment.text}` : segment.text }}</template>
      </template>
    </p>

    <footer class="export-guide-footer">
      <p>{{ content.privacyCopy }}</p>
      <p>
        {{ content.outdated }}
        <a href="https://github.com/Cheesecaketree/BonBon/issues" target="_blank" rel="noopener noreferrer">{{ content.reportIssue }} ↗</a>
      </p>
    </footer>
  </section>
</template>
