<script setup lang="ts">
import { nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ExportView } from './navigation'

const props = defineProps<{ active: ExportView }>()
const emit = defineEmits<{ select: [view: ExportView] }>()
const { t } = useI18n()
const views: ExportView[] = ['overview', 'purchases', 'products', 'bonus', 'profile', 'activity']
function keys(event: KeyboardEvent, index: number) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  event.preventDefault()
  const target = event.key === 'Home' ? 0 : event.key === 'End' ? views.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + views.length) % views.length
  const view = views[target]!
  emit('select', view)
  void nextTick(() => document.getElementById(`export-tab-${view}`)?.focus())
}
</script>

<template>
  <nav class="analytics-tabs" role="tablist" :aria-label="t('analyticsViews')">
    <button v-for="(view, index) in views" :id="`export-tab-${view}`" :key="view" type="button" role="tab" :aria-selected="props.active === view" :aria-controls="`export-panel-${view}`" :tabindex="props.active === view ? 0 : -1" @click="emit('select', view)" @keydown="keys($event, index)">{{ t(view === 'overview' ? 'reweExport.overview.tab' : `reweExport.${view}Tab`) }}</button>
  </nav>
</template>
