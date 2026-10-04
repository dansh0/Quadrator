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
  <!-- Column filling RightPanel's scroll area: the table takes the leftover
       height and scrolls itself, so the note and Export button stay in view.
       Flex margins don't collapse, hence mt-4 on each block plus a closing
       mb-4 instead of ma-4. -->
  <v-container fluid class="pa-0 qa-layout d-flex flex-column">
    <v-table v-if="rows.length > 0" density="compact" class="mx-4 mt-4 qa-table elevation-1" data-test="qa-table">
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
    <v-alert v-else type="info" density="compact" variant="outlined" class="mx-4 mt-4 qa-fixed" data-test="qa-empty">
      No data yet – run an analysis first.
    </v-alert>

    <v-alert type="info" density="compact" variant="outlined" class="mx-4 mt-4 qa-fixed">
      Review and verify species for each quadrat point above. When finished, click below to export
      the coverage data.
    </v-alert>
    <v-alert v-if="error" type="error" density="compact" class="mx-4 mt-4 qa-fixed" data-test="qa-error">
      {{ error }}
    </v-alert>

    <div class="d-flex justify-center qa-fixed my-4">
      <v-btn color="primary" data-test="qa-export" @click="onExport">
        <v-icon start>mdi-download</v-icon> Export Results
      </v-btn>
    </div>
    <v-snackbar :model-value="exported" timeout="3000" @update:model-value="exported = false">
      Data exported successfully.
    </v-snackbar>
  </v-container>
</template>

<style scoped>
.qa-layout {
  height: 100%;
}
/* Grows into the free height; the min-height floor keeps a few rows visible
   on very short windows, where RightPanel's own scroll takes over. */
.qa-table {
  flex: 1 1 auto;
  min-height: 120px;
  overflow-y: auto;
  cursor: pointer;
}
/* Everything below the table keeps its natural height. `flex: none` rather
   than flex-shrink-0 because v-alert brings its own zero flex-basis, which
   would collapse it to a sliver. */
.qa-fixed {
  flex: none;
}
.qa-current {
  background: rgba(var(--v-theme-primary), 0.18);
}
</style>
