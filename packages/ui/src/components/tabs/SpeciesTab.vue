<script setup lang="ts">
/**
 * Species tagging: button grid + sample cursor + hotkeys. Port of the legacy
 * SpeciesInputTab; hotkeys are suppressed while any text input is focused
 * (typing a quadrat name must never tag species — legacy data-loss bug) and
 * while a dialog is open.
 *
 * "Edit hotkeys" mode rebinds keys in place: tagging pauses, clicking a
 * button picks it, and the next keypress becomes its key. Taking a key from
 * another species swaps the two, with Undo. Esc (or Done) leaves the mode.
 */
import templateCsv from '../../assets/buttons_template.csv?raw';
import type { SpeciesEntry } from '@quadrator/core';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { classifyCaptureKey } from '../../hotkey-capture.ts';
import { usePlatform } from '../../platform.ts';
import { type HotkeyChange, useSpeciesStore } from '../../stores/species.ts';
import { useTaggingStore } from '../../stores/tagging.ts';
import SpeciesEditorDialog from '../species/SpeciesEditorDialog.vue';

const platform = usePlatform();
const species = useSpeciesStore();
const tagging = useTaggingStore();

const error = ref<string | null>(null);
const editorOpen = ref(false);

/** Edit-hotkeys mode, and the species waiting for its new key. */
const bindMode = ref(false);
const armed = ref<string | null>(null);
const bindMessage = ref<string | null>(null);
/** Last rebinding, for the snackbar and its Undo. */
const lastChange = ref<{ text: string; before: SpeciesEntry[] } | null>(null);

const hotkeysEnabled = computed({
  get: () => species.hotkeysEnabled,
  set: (v: boolean) => void species.setHotkeysEnabled(platform, v),
});

function label(code: string): string {
  if (armed.value === code) return `${code} [?]`;
  const key = species.hotkeysEnabled || bindMode.value ? species.hotkeyFor(code) : null;
  return key ? `${code} [${key}]` : code;
}

function isSelected(code: string): boolean {
  return tagging.selectedCodes.includes(code);
}

function onSpeciesClick(code: string): void {
  if (bindMode.value) {
    armed.value = armed.value === code ? null : code;
    bindMessage.value = null;
  } else {
    tagging.toggleCode(code);
  }
}

function toggleBindMode(): void {
  bindMode.value = !bindMode.value;
  armed.value = null;
  bindMessage.value = null;
}

/** The editor takes over key handling, so Edit Hotkeys mode ends first. */
function openEditor(): void {
  if (bindMode.value) toggleBindMode();
  editorOpen.value = true;
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

/** Text inputs, and anything inside a dialog or menu (teleported overlays). */
function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  if (el === null) return false;
  return (
    el.tagName === 'INPUT' ||
    el.tagName === 'TEXTAREA' ||
    el.isContentEditable === true ||
    (typeof el.closest === 'function' && el.closest('.v-overlay') !== null)
  );
}

function describe(change: HotkeyChange): string {
  const parts = [
    change.key === null ? `${change.code} has no key` : `${change.code} → ${change.key}`,
  ];
  if (change.swappedWith !== null) {
    const { code, key } = change.swappedWith;
    parts.push(key === null ? `${code} no longer has a key` : `${code} moved to ${key}`);
  }
  if (change.moved.length > 0) {
    parts.push(`${change.moved.length} automatic ${change.moved.length === 1 ? 'key' : 'keys'} shifted`);
  }
  return parts.join(' · ');
}

async function bind(code: string, key: string | null): Promise<void> {
  const before = species.entries.map((e) => ({ ...e }));
  try {
    const change = await species.assignHotkey(platform, code, key);
    lastChange.value = { text: describe(change), before };
    armed.value = null;
  } catch (e) {
    bindMessage.value = e instanceof Error ? e.message : String(e);
  }
}

async function undo(): Promise<void> {
  const change = lastChange.value;
  lastChange.value = null;
  if (change === null) return;
  try {
    await species.replaceEntries(platform, change.before);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

/** Capture phase, so an armed button gets the key before anything else. */
function onCaptureKeydown(event: KeyboardEvent): void {
  if (!bindMode.value || isTypingTarget(event.target)) return;
  const code = armed.value;
  const result = classifyCaptureKey(event);
  // Esc is "done": it leaves Edit Hotkeys mode, armed or not.
  if (result.kind === 'cancel') {
    event.preventDefault();
    event.stopImmediatePropagation();
    toggleBindMode();
    return;
  }
  if (code === null || result.kind === 'ignore') return;
  event.preventDefault();
  event.stopImmediatePropagation();
  bindMessage.value = null;
  if (result.kind === 'invalid') bindMessage.value = result.message;
  else void bind(code, result.kind === 'bind' ? result.key : null);
}

function onKeydown(event: KeyboardEvent): void {
  if (bindMode.value || !species.hotkeysEnabled || isTypingTarget(event.target)) return;

  if (event.key === 'ArrowRight' || event.key === 'Enter') {
    tagging.nextSample();
  } else if (event.key === 'ArrowLeft' || event.key === 'Backspace') {
    tagging.prevSample();
  } else if (!event.ctrlKey && !event.shiftKey && !event.metaKey && !event.altKey) {
    const code = species.codeForKey(event.key);
    if (code !== null) tagging.toggleCode(code);
  }
}

onMounted(() => {
  window.addEventListener('keydown', onCaptureKeydown, true);
  window.addEventListener('keydown', onKeydown);
});
onUnmounted(() => {
  window.removeEventListener('keydown', onCaptureKeydown, true);
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <v-container fluid class="pa-0 pt-4">
    <!-- Empty state -->
    <v-container v-if="species.entries.length === 0" class="pa-0">
      <v-row class="justify-center my-2">
        <v-alert type="info" density="compact" variant="outlined" class="ma-4" data-test="no-buttons">
          No species yet. Create a list here, or load one from a CSV file.
        </v-alert>
      </v-row>
      <v-row class="justify-center my-2">
        <v-btn size="large" color="primary" prepend-icon="mdi-table-edit" data-test="create-species" @click="openEditor">
          Create Species List
        </v-btn>
      </v-row>
      <v-row class="justify-center my-2">
        <v-btn size="large" color="primary" variant="tonal" data-test="load-buttons" @click="onLoadButtons">
          Load Buttons CSV
        </v-btn>
      </v-row>
      <v-row class="justify-center my-2">
        <v-btn size="small" variant="text" data-test="download-template" @click="onDownloadTemplate">
          Download Template
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
            :class="{
              'species-btn--selected': !bindMode && isSelected(entry.code),
              'species-btn--armed': armed === entry.code,
            }"
            :color="!bindMode && isSelected(entry.code) ? entry.colorSelected : entry.color"
            :elevation="!bindMode && isSelected(entry.code) ? 8 : 0"
            :aria-pressed="bindMode ? armed === entry.code : isSelected(entry.code)"
            :data-test="`species-${entry.code}`"
            @click="onSpeciesClick(entry.code)"
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

    <v-alert
      v-if="bindMode"
      type="info"
      density="compact"
      variant="tonal"
      class="mx-4 my-2"
      data-test="bind-hint"
    >
      <template v-if="armed">
        Press the new key for <strong>{{ armed }}</strong>. Delete clears it, Esc when done.
      </template>
      <template v-else>Tagging is paused. Click a species, then press its new key. Esc when done.</template>
      <div v-if="bindMessage" class="text-error mt-1" data-test="bind-message">{{ bindMessage }}</div>
    </v-alert>

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
      <v-row v-if="species.entries.length > 0" class="justify-center my-2 ga-2">
        <v-btn size="small" color="primary" prepend-icon="mdi-table-edit" data-test="edit-species" @click="openEditor">
          Edit Species
        </v-btn>
        <v-btn
          size="small"
          :color="bindMode ? 'secondary' : 'primary'"
          prepend-icon="mdi-keyboard"
          data-test="edit-hotkeys"
          @click="toggleBindMode"
        >
          {{ bindMode ? 'Done' : 'Edit Hotkeys' }}
        </v-btn>
        <v-btn size="small" color="primary" data-test="load-buttons" @click="onLoadButtons">
          Load CSV
        </v-btn>
      </v-row>
      <v-row class="justify-center my-2">
        <v-switch v-model="hotkeysEnabled" inset label="Enable Hotkeys" data-test="hotkey-switch" />
      </v-row>
    </v-container>

    <v-snackbar :model-value="lastChange !== null" timeout="6000" data-test="hotkey-snackbar" @update:model-value="lastChange = null">
      {{ lastChange?.text }}
      <template #actions>
        <v-btn variant="text" data-test="hotkey-undo" @click="undo">Undo</v-btn>
      </template>
    </v-snackbar>

    <SpeciesEditorDialog v-model="editorOpen" />
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

/* Waiting for its new key: dashed, so it can't be mistaken for "tagged". */
.species-btn--armed {
  outline: 2px dashed rgb(var(--v-theme-secondary));
  opacity: 1;
}

/* the ring is decoration; focus must still be obvious for keyboard users */
.species-btn:focus-visible {
  outline-color: rgb(var(--v-theme-primary));
}
</style>
