<script setup lang="ts">
/**
 * Species tagging: button grid + sample cursor + hotkeys. Port of the legacy
 * SpeciesInputTab; hotkeys are suppressed while any text input is focused
 * (typing a quadrat name must never tag species — legacy data-loss bug).
 */
import templateCsv from '../../assets/buttons_template.csv?raw';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { usePlatform } from '../../platform.ts';
import { useSpeciesStore } from '../../stores/species.ts';
import { useTaggingStore } from '../../stores/tagging.ts';

const platform = usePlatform();
const species = useSpeciesStore();
const tagging = useTaggingStore();

const error = ref<string | null>(null);

const hotkeysEnabled = computed({
  get: () => species.hotkeysEnabled,
  set: (v: boolean) => void species.setHotkeysEnabled(platform, v),
});

function label(code: string): string {
  const key = species.hotkeysEnabled ? species.hotkeyFor(code) : null;
  return key ? `${code} [${key}]` : code;
}

function isSelected(code: string): boolean {
  return tagging.selectedCodes.includes(code);
}

async function onLoadButtons(): Promise<void> {
  error.value = null;
  try {
    await species.loadFromFile(platform);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

async function onDownloadTemplate(): Promise<void> {
  error.value = null;
  try {
    await platform.exportCsv(templateCsv, 'buttons.csv');
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return (
    el !== null &&
    (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true)
  );
}

function onKeydown(event: KeyboardEvent): void {
  if (!species.hotkeysEnabled || isTypingTarget(event.target)) return;

  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    tagging.nextSample();
  } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
    tagging.prevSample();
  } else if (!event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey) {
    const code = species.codeForKey(event.key);
    if (code !== null) tagging.toggleCode(code);
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <v-container fluid class="pa-0 pt-4">
    <!-- Empty state -->
    <v-container v-if="species.entries.length === 0" class="pa-0">
      <v-row class="justify-center my-2">
        <v-alert type="info" density="compact" variant="outlined" class="ma-4" data-test="no-buttons">
          No buttons loaded. Please load buttons from a CSV file.
        </v-alert>
      </v-row>
      <v-row class="justify-center my-2">
        <v-btn size="large" color="primary" data-test="download-template" @click="onDownloadTemplate">
          Download Template
        </v-btn>
      </v-row>
      <v-row class="justify-center my-2">
        <v-btn size="large" color="primary" data-test="load-buttons" @click="onLoadButtons">
          Load Buttons CSV
        </v-btn>
      </v-row>
    </v-container>

    <!-- Button grid -->
    <v-container v-else class="pa-2 d-flex flex-wrap justify-center">
      <v-tooltip v-for="entry in species.entries" :key="entry.code" location="bottom">
        <template #activator="{ props }">
          <v-btn
            v-bind="props"
            class="species-btn ma-1"
            :class="{ 'species-btn--selected': isSelected(entry.code) }"
            :color="isSelected(entry.code) ? entry.colorSelected : entry.color"
            :elevation="isSelected(entry.code) ? 8 : 0"
            :aria-pressed="isSelected(entry.code)"
            :data-test="`species-${entry.code}`"
            @click="tagging.toggleCode(entry.code)"
          >
            <!-- Selection must not rest on colour alone: the palette comes
                 from the user's CSV, where selected and unselected can be
                 near-identical shades. The ring and lift read at a glance
                 whatever colours a survey uses, without adding anything
                 inside the button to compete with the label. -->
            {{ label(entry.code) }}
          </v-btn>
        </template>
        <span>{{ entry.species }}<br />{{ entry.group1 }} - {{ entry.group2 }}</span>
      </v-tooltip>
    </v-container>

    <v-alert v-if="error" type="error" density="compact" closable class="ma-4" data-test="species-error" @click:close="error = null">
      {{ error }}
    </v-alert>

    <!-- Navigation & hotkeys -->
    <v-container class="text-center">
      <v-row class="justify-center my-2">
        <v-btn
          size="large"
          color="primary"
          class="mr-10"
          :disabled="tagging.atFirst"
          data-test="prev-sample"
          @click="tagging.prevSample()"
        >
          Prev
        </v-btn>
        <v-btn
          size="large"
          color="primary"
          :disabled="tagging.atLast"
          data-test="next-sample"
          @click="tagging.nextSample()"
        >
          Next
        </v-btn>
      </v-row>
      <div class="my-2" data-test="sample-position">
        Point {{ tagging.cursor + 1 }} of {{ tagging.sampleCount }}
      </div>
      <v-row v-if="species.entries.length > 0" class="justify-center my-2">
        <v-btn size="small" color="primary" data-test="load-buttons" @click="onLoadButtons">
          Load Buttons CSV
        </v-btn>
      </v-row>
      <v-row class="justify-center my-2">
        <v-switch v-model="hotkeysEnabled" inset label="Enable Hotkeys" data-test="hotkey-switch" />
      </v-row>
    </v-container>
  </v-container>
</template>

<style scoped>
.species-btn {
  width: 85px;
  height: 40px;
  font-size: 0.8em;
  font-weight: bold;
  /* keeps the ring from shifting the grid when it appears */
  outline: 2px solid transparent;
  outline-offset: 2px;
  opacity: 0.88;
  transition:
    outline-color 120ms ease,
    opacity 120ms ease,
    transform 120ms ease;
}

.species-btn--selected {
  outline-color: rgb(var(--v-theme-on-surface));
  opacity: 1;
  transform: translateY(-1px);
}

/* the ring is decoration; focus must still be obvious for keyboard users */
.species-btn:focus-visible {
  outline-color: rgb(var(--v-theme-primary));
}
</style>
