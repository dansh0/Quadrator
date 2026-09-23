<script setup lang="ts">
/**
 * Tabbed workflow panel. Species ID and Data Review stay disabled until the
 * current quadrat has a defined boundary (legacy tab-gating rule), and the
 * active tab snaps back to Image Prep when the boundary goes away.
 */
import { computed, watch } from 'vue';
import { storeToRefs } from 'pinia';
import ImagePrepTab from './tabs/ImagePrepTab.vue';
import QaTab from './tabs/QaTab.vue';
import SpeciesTab from './tabs/SpeciesTab.vue';
import { useSessionStore } from '../stores/session.ts';
import { useTaggingStore } from '../stores/tagging.ts';

const emit = defineEmits<{
  (e: 'reset-nodes'): void;
}>();

const session = useSessionStore();
const { activeTab: tab } = storeToRefs(useTaggingStore());

const geoDefined = computed(() => session.currentQuadrat?.geoDefined === true);

watch(geoDefined, (defined) => {
  if (!defined) tab.value = 'prep';
});
</script>

<template>
  <v-card class="fill-height d-flex flex-column" color="tertiary">
    <!-- flex-grow-0: `grow` grows the tab *items* horizontally, but also lets
         the bar itself grow inside this column flexbox -->
    <v-tabs v-model="tab" bg-color="primary" density="compact" grow class="flex-grow-0">
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
