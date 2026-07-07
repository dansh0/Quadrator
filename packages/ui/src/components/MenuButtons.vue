<script setup lang="ts">
import { ref } from 'vue';
import { exportSessionCsv } from '../export.ts';
import { usePlatform } from '../platform.ts';
import { useSessionStore } from '../stores/session.ts';
import { useSpeciesStore } from '../stores/species.ts';

const emit = defineEmits<{
  /** The canvas re-initializes boundary drawing for the current quadrat. */
  (e: 'reset-nodes'): void;
}>();

const platform = usePlatform();
const session = useSessionStore();
const species = useSpeciesStore();

const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const confirm = ref<{ question: string; action: () => void } | null>(null);

async function guard(work: () => Promise<void>): Promise<void> {
  error.value = null;
  try {
    await work();
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e);
  }
}

const onLoadImages = () => guard(async () => void (await session.addImages(platform)));
const onSaveSession = () => guard(async () => void (await session.save(platform)));
const onLoadSession = () => guard(async () => void (await session.open(platform)));
const onExport = () =>
  guard(async () => {
    if (session.session === null) return;
    if (await exportSessionCsv(platform, session.session, species.entries)) {
      notice.value = 'Data exported successfully.';
    }
  });

function onResetNodes(): void {
  const boundary = session.currentQuadrat?.boundary ?? [];
  if (boundary.length === 0) {
    emit('reset-nodes');
    return;
  }
  confirm.value = {
    question: 'Are you sure you want to reset your node selections?',
    action: () => emit('reset-nodes'),
  };
}

function onStartOver(): void {
  confirm.value = {
    question: 'Are you sure you want to delete all unsaved progress and start over?',
    action: () => session.$reset(),
  };
}

function runConfirmed(): void {
  confirm.value?.action();
  confirm.value = null;
}

const buttons = [
  { text: 'Load Image', tooltip: 'Load one or multiple images to add to this image group', fn: onLoadImages },
  { text: 'Reset Nodes', tooltip: 'Reset boundary polygon definition and data nodes for this quadrat', fn: onResetNodes },
  { text: 'Start Over', tooltip: 'Delete all unsaved data and restart', fn: onStartOver },
  { text: 'Save Session', tooltip: 'Save the current session to a file', fn: onSaveSession },
  { text: 'Load Session', tooltip: 'Load a previously saved session from a file', fn: onLoadSession },
  { text: 'Export Data', tooltip: 'Save all entered data for all loaded quadrats as a CSV file', fn: onExport },
  { text: 'Prev. Image', tooltip: 'Move back to the previous image to analyze', fn: () => session.stepQuadrat(-1) },
  { text: 'Next Image', tooltip: 'Move forward to the next image to analyze', fn: () => session.stepQuadrat(1) },
];
</script>

<template>
  <v-container class="pa-2">
    <v-row class="justify-center" no-gutters>
      <v-tooltip v-for="b in buttons" :key="b.text" location="bottom">
        <template #activator="{ props }">
          <v-btn
            color="primary"
            size="small"
            class="ma-1 menu-btn"
            v-bind="props"
            :data-test="`menu-${b.text.toLowerCase().replace(/[^a-z]+/g, '-')}`"
            @click="b.fn"
          >
            {{ b.text }}
          </v-btn>
        </template>
        <span>{{ b.tooltip }}</span>
      </v-tooltip>
    </v-row>

    <v-alert v-if="error" type="error" density="compact" closable class="ma-2" data-test="menu-error" @click:close="error = null">
      {{ error }}
    </v-alert>
    <v-snackbar :model-value="notice !== null" timeout="3000" @update:model-value="notice = null">
      {{ notice }}
    </v-snackbar>

    <v-dialog :model-value="confirm !== null" max-width="420" @update:model-value="confirm = null">
      <v-card data-test="confirm-dialog">
        <v-card-text>{{ confirm?.question }}</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn data-test="confirm-no" @click="confirm = null">No</v-btn>
          <v-btn color="primary" data-test="confirm-yes" @click="runConfirmed">Yes</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<style scoped>
.menu-btn {
  width: 120px;
}
</style>
