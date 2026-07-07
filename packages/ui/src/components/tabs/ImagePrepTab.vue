<script setup lang="ts">
import { computed } from 'vue';
import MenuButtons from '../MenuButtons.vue';
import { useSessionStore } from '../../stores/session.ts';

const emit = defineEmits<{
  (e: 'reset-nodes'): void;
}>();

const session = useSessionStore();

const quadratName = computed({
  get: () => session.currentQuadrat?.name ?? '',
  set: (v: string) => session.renameCurrentQuadrat(v),
});
</script>

<template>
  <v-container fluid class="pa-0 pt-4">
    <MenuButtons @reset-nodes="emit('reset-nodes')" />

    <v-container class="pa-4">
      <v-text-field
        v-if="session.currentQuadrat"
        v-model="quadratName"
        label="Quadrat Name"
        density="compact"
        class="px-5 pt-5 mt-0"
        data-test="quadrat-name"
      />
    </v-container>

    <v-alert
      v-if="session.currentQuadrat && !session.currentQuadrat.geoDefined"
      type="info"
      density="compact"
      variant="outlined"
      class="ma-4"
      data-test="geo-hint"
    >
      Begin by defining the quadrat geometry by clicking on the image at corners of the desired
      quadrat or polygon. Reselect the first point to complete the quadrat geometry.
    </v-alert>
  </v-container>
</template>
