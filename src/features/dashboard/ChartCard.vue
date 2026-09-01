<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import { AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'
import { computed, useId } from 'vue'

use([CanvasRenderer, BarChart, HeatmapChart, LineChart, ScatterChart, AriaComponent, GridComponent, LegendComponent, TooltipComponent, VisualMapComponent])

const props = defineProps<{ title: string; copy?: string; description?: string; option: EChartsOption; tall?: boolean; dense?: boolean }>()
const id = useId()
const titleId = `chart-title-${id}`
const descriptionId = `chart-description-${id}`
const accessibleDescription = computed(() => props.description || props.copy || props.title)
</script>

<template>
  <article class="chart-card" :class="{ dense }" :aria-labelledby="titleId" :aria-describedby="descriptionId">
    <header class="chart-card-heading"><div><h3 :id="titleId">{{ title }}</h3><p v-if="copy">{{ copy }}</p></div><slot name="actions" /></header>
    <p :id="descriptionId" class="sr-only">{{ accessibleDescription }}</p>
    <VChart class="chart" :class="{ tall }" :option="option" autoresize role="img" :aria-label="accessibleDescription" />
  </article>
</template>
