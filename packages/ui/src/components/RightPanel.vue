<script setup lang="ts">
/**
 * Tabbed workflow panel. Species ID and Data Review stay disabled until the
 * current quadrat has a defined boundary (legacy tab-gating rule), and the
 * active tab snaps back to Image Prep when the boundary goes away.
 *
 * Plain Left/Right step the sample (SpeciesTab), so the tab bar must not
 * keep focus: Vuetify moves focus between tabs on arrow keys, which showed
 * as the tab highlight wandering while samples stepped. Alt+Left/Right
 * switch tabs instead.
 */
import { computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { storeToRefs } from 'pinia';
import ImagePrepTab from './tabs/ImagePrepTab.vue';
import QaTab from './tabs/QaTab.vue';
import SpeciesTab from './tabs/SpeciesTab.vue';
import { useSessionStore } from '../stores/session.ts';
import { isTextField } from '../text-field.ts';
import { useTaggingStore, type WorkflowTab } from '../stores/tagging.ts';

const emit = defineEmits<{
  (e: 'reset-nodes'): void;
}>();

const session = useSessionStore();
const { activeTab: tab } = storeToRefs(useTaggingStore());

const geoDefined = computed(() => session.currentQuadrat?.geoDefined === true);

watch(geoDefined, (defined) => {
  if (!defined) tab.value = 'prep';
});

/** Once a tab is clicked (or Enter'd) — even the active one — hand focus back to the page. */
function releaseFocus(event: MouseEvent): void {
  const bar = event.currentTarget as HTMLElement;
  void nextTick(() => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && bar.contains(active)) active.blur();
  });
}

const ORDER: WorkflowTab[] = ['prep', 'species', 'qa'];

/** The neighbouring enabled tab, or null at either end. */
function adjacentTab(step: 1 | -1): WorkflowTab | null {
  const next = ORDER[ORDER.indexOf(tab.value) + step];
  if (next === undefined || (next !== 'prep' && !geoDefined.value)) return null;
  return next;
}

/** On macOS, Option+arrow moves by word and Back is Cmd+[. */
const isMac = (): boolean => /mac/i.test(navigator.platform);

function onKeydown(event: KeyboardEvent): void {
  if (!event.altKey || event.ctrlKey || event.shiftKey || event.metaKey) return;
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
  // Elsewhere Alt+Left is the browser's Back, which would leave the app
  // (and its unsaved session), so it is always blocked off macOS.
  if (!isMac()) event.preventDefault();
  // Never switch tabs mid-edit or from inside a dialog (the species
  // editor has its own keys).
  const t = event.target;
  if (isTextField(t) || (t instanceof Element && t.closest('.v-overlay') !== null)) return;
  event.preventDefault();
  const next = adjacentTab(event.key === 'ArrowRight' ? 1 : -1);
  if (next !== null) tab.value = next;
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <v-card class="fill-height d-flex flex-column" color="tertiary">
    <!-- flex-grow-0: `grow` grows the tab *items* horizontally, but also lets
         the bar itself grow inside this column flexbox. flex-shrink-0: the
         card has a fixed height, so a tall tab would otherwise squash the
         bar instead of scrolling the content area below. -->
    <v-tabs
      v-model="tab"
      bg-color="primary"
      density="compact"
      grow
      class="flex-grow-0 flex-shrink-0"
      @click="releaseFocus"
    >
      <v-tab value="prep" class="px-1" data-test="tab-prep">Image Prep</v-tab>
      <v-tab value="species" class="px-1" :disabled="!geoDefined" data-test="tab-species">
        Species ID
      </v-tab>
      <v-tab value="qa" class="px-1" :disabled="!geoDefined" data-test="tab-qa">Data Review</v-tab>
    </v-tabs>

    <!-- v-if per tab: SpeciesTab's global hotkey listener must exist only
         while its tab is active -->
    <div class="flex-grow-1 overflow-y-auto">
      <ImagePrepTab v-if="tab === 'prep'" @reset-nodes="emit('reset-nodes')" />
      <SpeciesTab v-else-if="tab === 'species'" />
      <QaTab v-else-if="tab === 'qa'" />
    </div>
  </v-card>
</template>
