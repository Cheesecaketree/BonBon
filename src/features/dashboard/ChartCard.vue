<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import { BarChart, HeatmapChart, LineChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, VisualMapComponent } from 'echarts/components'
import VChart from 'vue-echarts'

use([CanvasRenderer, BarChart, HeatmapChart, LineChart, ScatterChart, GridComponent, TooltipComponent, VisualMapComponent])

defineProps<{ title: string; copy?: string; option: EChartsOption; tall?: boolean }>()
</script>

<template>
  <article class="chart-card">
    <header><h3>{{ title }}</h3><p v-if="copy">{{ copy }}</p></header>
    <VChart class="chart" :class="{ tall }" :option="option" autoresize />
  </article>
</template>
