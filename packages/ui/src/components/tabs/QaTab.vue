<script setup lang="ts">
/**
 * Data review: per-point species table for the current quadrat. Clicking a
 * row moves the tagging cursor there (jump back to fix a point).
 */
import { computed, ref } from 'vue';
import { exportSessionCsv } from '../../export.ts';
import { usePlatform } from '../../platform.ts';
import { useSessionStore } from '../../stores/session.ts';
import { useSpeciesStore } from '../../stores/species.ts';
import { useTaggingStore } from '../../stores/tagging.ts';

const platform = usePlatform();
const session = useSessionStore();
const species = useSpeciesStore();
const tagging = useTaggingStore();

const error = ref<string | null>(null);
const exported = ref(false);

const rows = computed(() =>
  (session.currentQuadrat?.samples ?? []).map((s) => ({
    index: s.index,
    point: s.index + 1,
    species: s.codes.join(', '),
  }))
);

async function onExport(): Promise<void> {
  error.value = null;
  exported.value = false;
  try {
    if (session.session === null) return;
    exported.value = await exportSessionCsv(platform, session.session, species.entries);
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}
</script>

<template>
  <v-container fluid class="pa-0">
    <v-table v-if="rows.length > 0" density="compact" class="ma-4 qa-table elevation-1" data-test="qa-table">
      <thead>
        <tr>
          <th>Point</th>
          <th>Species</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="row in rows"
          :key="row.index"
          :class="{ 'qa-current': row.index === tagging.cursor }"
          :data-test="`qa-row-${row.point}`"
          @click="tagging.setCursor(row.index)"
        >
          <td>{{ row.point }}</td>
          <td>{{ row.species }}</td>
        </tr>
      </tbody>
    </v-table>
    <v-alert v-else type="info" density="compact" variant="outlined" class="ma-4" data-test="qa-empty">
      No data yet – run an analysis first.
    </v-alert>

    <v-alert type="info" density="compact" variant="outlined" class="ma-4">
      Review and verify species for each quadrat point above. When finished, click below to export
      the coverage data.
    </v-alert>
    <v-alert v-if="error" type="error" density="compact" class="ma-4" data-test="qa-error">
      {{ error }}
    </v-alert>

    <v-row class="justify-center mt-4 pa-0">
      <v-btn color="primary" data-test="qa-export" @click="onExport">
        <v-icon start>mdi-download</v-icon> Export Results
      </v-btn>
    </v-row>
    <v-snackbar :model-value="exported" timeout="3000" @update:model-value="exported = false">
      Data exported successfully.
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.qa-table {
  max-height: 75vh;
  overflow-y: auto;
  cursor: pointer;
}
.qa-current {
  background: rgba(var(--v-theme-primary), 0.18);
}
</style>
