<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { filesFromDataTransfer } from '../../services/pdf/collectFiles'

defineProps<{ compact?: boolean; processing?: boolean }>()
const emit = defineEmits<{ files: [files: File[]] }>()
const { t } = useI18n()
const fileInput = ref<HTMLInputElement>()
const folderInput = ref<HTMLInputElement>()
const dragging = ref(false)

function selectFiles(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) emit('files', [...input.files])
  input.value = ''
}

async function drop(event: DragEvent) {
  dragging.value = false
  if (event.dataTransfer) emit('files', await filesFromDataTransfer(event.dataTransfer))
}
</script>

<template>
  <section
    class="import-panel"
    :class="{ compact, dragging }"
    @dragenter.prevent="dragging = true"
    @dragover.prevent="dragging = true"
    @dragleave.prevent.self="dragging = false"
    @drop.prevent="drop"
    :aria-busy="processing"
  >
    <div class="receipt-mark" aria-hidden="true"><span></span><span></span><span></span></div>
    <div class="import-copy">
      <p class="kicker">BONBON IMPORT</p>
      <h2>{{ dragging ? t('dragActive') : (compact ? t('importMore') : t('dropTitle')) }}</h2>
      <p v-if="!compact">{{ t('dropCopy') }}</p>
    </div>
    <div class="button-row">
      <button class="button primary" type="button" :disabled="processing" @click="fileInput?.click()">{{ t('choosePdfs') }}</button>
      <button class="button secondary" type="button" :disabled="processing" @click="folderInput?.click()">{{ t('chooseFolder') }}</button>
    </div>
    <input ref="fileInput" class="hidden-file" type="file" accept="application/pdf,.pdf" multiple tabindex="-1" aria-hidden="true" @change="selectFiles" />
    <input ref="folderInput" class="hidden-file" type="file" accept="application/pdf,.pdf" multiple webkitdirectory tabindex="-1" aria-hidden="true" @change="selectFiles" />
    <p v-if="!compact" class="fine-print">{{ t('processingNote') }}</p>
  </section>
</template>
