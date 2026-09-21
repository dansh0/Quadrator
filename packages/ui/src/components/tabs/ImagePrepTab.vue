<script setup lang="ts">
/**
 * Image Prep tab: the menu actions, the quadrat name, and — while the
 * current quadrat has no boundary yet — the controls that decide how the
 * next one is drawn and sampled.
 *
 * These are session defaults. Each quadrat records what it was actually
 * drawn and sampled with when its boundary is committed, so changing them
 * never rewrites quadrats that are already done.
 */
import { computed } from 'vue';
import type { GridOrigin, QuadratShape, SamplingMode } from '@quadrator/core';
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

const SAMPLING_ITEMS = [
  { value: 'stratified-random', title: 'Stratified random' },
  { value: 'regular-grid', title: 'Regular grid' },
  { value: 'random', title: 'Random' },
] as const;

const SHAPE_ITEMS = [
  { value: 'quad', title: 'Quad' },
  { value: 'square', title: 'Square' },
  { value: 'n-poly', title: 'N-poly' },
] as const;

const ORIGIN_ITEMS = [
  { value: 'center', title: 'Center' },
  { value: 'bottom-left', title: 'Bottom left' },
  { value: 'bottom-right', title: 'Bottom right' },
  { value: 'top-right', title: 'Top right' },
  { value: 'top-left', title: 'Top left' },
  { value: 'fill', title: 'Fill (edges + interior)' },
] as const;

const settings = computed(() => session.session?.settings ?? null);

const sampling = computed({
  get: () => settings.value?.sampling ?? 'stratified-random',
  set: (v: SamplingMode) => session.setSampling(v),
});

const shape = computed({
  get: () => settings.value?.shape ?? 'n-poly',
  set: (v: QuadratShape) => session.setShape(v),
});

/**
 * A polygon has no rows×cols cells to take a corner of — its equal-area
 * pieces are the only grid it has, so grid points go at each piece's centre.
 */
const originLocked = computed(() => shape.value === 'n-poly');

const gridOrigin = computed({
  // While locked, show what will actually be used rather than a stale corner
  // left over from a quad (defineBoundary records 'center' for polygons too).
  get: () => (originLocked.value ? 'center' : (settings.value?.gridOrigin ?? 'center')),
  set: (v: GridOrigin) => session.setGridOrigin(v),
});

const rows = computed({
  get: () => settings.value?.numOfSampleRows ?? 5,
  set: (v: number | string) => session.setGridSize(Number(v), cols.value),
});

const cols = computed({
  get: () => settings.value?.numOfSampleCols ?? 5,
  set: (v: number | string) => session.setGridSize(rows.value, Number(v)),
});

const showGridOptions = computed(() => sampling.value === 'regular-grid');

/**
 * `fill` puts points on the grid's intersections instead of inside its
 * cells, so the same sample count draws one fewer row and column of cells.
 */
const gridSizeHint = computed(() =>
  showGridOptions.value && gridOrigin.value === 'fill' && !originLocked.value
    ? `${rows.value} × ${cols.value} points on a ${Math.max(1, rows.value - 1)} × ${Math.max(1, cols.value - 1)} grid, edges included`
    : undefined
);

const originItems = computed(() =>
  originLocked.value ? ORIGIN_ITEMS.filter((i) => i.value === 'center') : ORIGIN_ITEMS
);

const drawHint = computed(() => {
  switch (shape.value) {
    case 'quad':
      return 'Click the four corners of the quadrat; the fourth click completes it.';
    case 'square':
      return 'Click twice to set one side — the square is completed at a right angle to it.';
    default:
      return 'Click each corner of the shape, then click the first point again to close it.';
  }
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

    <template v-if="session.currentQuadrat && !session.currentQuadrat.geoDefined">
      <v-alert type="info" density="compact" variant="outlined" class="ma-4" data-test="geo-hint">
        Begin by defining the quadrat geometry by clicking on the image.
        {{ drawHint }} Hold Ctrl to lock each segment to 15° steps<span
          v-if="shape !== 'square'"
        >, and from the third point to the previous segment's length</span>.
      </v-alert>

      <v-container class="px-9 pb-4 pt-0">
        <v-select
          v-model="sampling"
          :items="SAMPLING_ITEMS"
          label="Sampling"
          density="compact"
          hide-details="auto"
          class="mb-4"
          data-test="sampling-select"
        />

        <v-select
          v-model="shape"
          :items="SHAPE_ITEMS"
          label="Quadrat shape"
          density="compact"
          hide-details="auto"
          class="mb-4"
          data-test="shape-select"
        />

        <v-select
          v-if="showGridOptions"
          v-model="gridOrigin"
          :items="originItems"
          :disabled="originLocked"
          :hint="originLocked ? 'Polygons place grid points at each cell’s centre.' : undefined"
          persistent-hint
          label="Point placement"
          density="compact"
          hide-details="auto"
          class="mb-4"
          data-test="grid-origin-select"
        />

        <div v-if="gridSizeHint" class="text-caption text-medium-emphasis mb-2" data-test="grid-size-hint">
          {{ gridSizeHint }}
        </div>

        <v-row no-gutters class="ga-4">
          <v-col>
            <v-number-input
              v-model="rows"
              :min="1"
              :max="99"
              control-variant="stacked"
              label="Rows"
              density="compact"
              hide-details="auto"
              data-test="rows-input"
            />
          </v-col>
          <v-col>
            <v-number-input
              v-model="cols"
              :min="1"
              :max="99"
              control-variant="stacked"
              label="Columns"
              density="compact"
              hide-details="auto"
              data-test="cols-input"
            />
          </v-col>
        </v-row>
      </v-container>
    </template>
  </v-container>
</template>
