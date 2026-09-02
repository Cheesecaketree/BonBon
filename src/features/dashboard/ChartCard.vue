<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { computed, nextTick, onMounted, ref, useId, watch } from 'vue'

use([CanvasRenderer, BarChart, HeatmapChart, LineChart, ScatterChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent])

export interface StickyYConfig {
  labels: string[]
  top?: string
  bottom?: string
  width?: string
  align?: 'center' | 'space-between'
}

const props = defineProps<{ title: string; copy?: string; description?: string; option?: EChartsOption; tall?: boolean; dense?: boolean; scrollable?: boolean; scrollMinWidth?: string; scrollHint?: string; scrollFocusRatio?: number; stickyY?: StickyYConfig }>()
const emit = defineEmits<{ select: [payload: unknown] }>()
const id = useId()
const titleId = `chart-title-${id}`
const descriptionId = `chart-description-${id}`
const accessibleDescription = computed(() => props.description || props.copy || props.title)

const viewportRef = ref<HTMLElement>()
let hasUserScrolled = false

function onViewportScroll() {
  hasUserScrolled = true
}

function applyScrollFocus(force = false) {
  if (!props.scrollable || props.scrollFocusRatio === undefined) return
  if (hasUserScrolled && !force) return
  const el = viewportRef.value
  if (!el) return
  const maxScroll = el.scrollWidth - el.clientWidth
  if (maxScroll <= 0) return
  const targetX = el.scrollWidth * props.scrollFocusRatio
  const targetScroll = Math.max(0, Math.min(maxScroll, targetX - el.clientWidth / 2))
  el.scrollLeft = targetScroll
}

onMounted(() => {
  hasUserScrolled = false
  nextTick(() => {
    applyScrollFocus()
    requestAnimationFrame(() => applyScrollFocus())
  })
})

watch(() => [props.scrollFocusRatio, props.option], () => {
  hasUserScrolled = false
  nextTick(() => {
    applyScrollFocus()
  })
})
</script>

<template>
  <article class="chart-card" :class="{ dense }" :aria-labelledby="titleId" :aria-describedby="descriptionId">
    <header class="chart-card-heading"><div><h3 :id="titleId">{{ title }}</h3><p v-if="copy">{{ copy }}</p></div><slot name="actions" /></header>
    <p :id="descriptionId" class="sr-only">{{ accessibleDescription }}</p>
    <slot>
      <div v-if="scrollable" class="chart-scroll-wrap">
        <p v-if="scrollHint" class="chart-scroll-hint"><span>{{ scrollHint }}</span><span aria-hidden="true">→</span></p>
        <div ref="viewportRef" class="chart-scroll-viewport" :class="{ 'has-sticky-y': Boolean(stickyY) }" tabindex="0" :aria-label="accessibleDescription" @scroll.passive="onViewportScroll">
          <div
            v-if="stickyY"
            class="chart-sticky-y-rail"
            :class="`align-${stickyY.align || 'center'}`"
            :style="{
              width: stickyY.width || '34px',
              paddingTop: stickyY.top || '16px',
              paddingBottom: stickyY.bottom || '58px'
            }"
            aria-hidden="true"
          >
            <span v-for="(label, idx) in stickyY.labels" :key="idx" class="chart-sticky-y-label">{{ label }}</span>
          </div>
          <div class="chart-scroll-canvas" :style="{ minWidth: scrollMinWidth }">
            <VChart v-if="option" class="chart" :class="{ tall }" :option="option" autoresize role="img" :aria-label="accessibleDescription" @click="emit('select', $event)" />
          </div>
        </div>
      </div>
      <VChart v-else-if="option" class="chart" :class="{ tall }" :option="option" autoresize role="img" :aria-label="accessibleDescription" @click="emit('select', $event)" />
    </slot>
  </article>
</template>
