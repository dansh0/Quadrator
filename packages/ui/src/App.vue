<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { version as appVersion } from '../../../package.json';
import logoUrl from './assets/QUADRATOR_LOGO_white_text_transparent.png';
import homeBgUrl from './assets/pexels-pok-rie-33563-1031200.jpg';
import { createAutosaver } from './autosave.ts';
import ImageCanvas from './components/ImageCanvas.vue';
import RightPanel from './components/RightPanel.vue';
import { usePlatform } from './platform.ts';
import { useSessionStore } from './stores/session.ts';
import { useSpeciesStore } from './stores/species.ts';
import { useTaggingStore } from './stores/tagging.ts';

const platform = usePlatform();
const store = useSessionStore();
const species = useSpeciesStore();
const tagging = useTaggingStore();

const hasAutosave = ref(false);
const homeError = ref<string | null>(null);

async function onLoadImages(): Promise<void> {
  await store.addImages(platform);
}

async function onOpen(): Promise<void> {
  await store.open(platform);
}

async function onContinueLast(): Promise<void> {
  homeError.value = null;
  try {
    await store.restoreAutosaved(platform);
  } catch {
    // legacy behavior: a corrupt snapshot is dropped, not retried forever
    homeError.value =
      'Session could not be loaded. It may be corrupt. Please load new images to continue.';
    await store.clearAutosaved(platform);
    hasAutosave.value = false;
  }
}

// Crash recovery: throttled snapshot of the session into the settings
// document whenever the store changes (legacy auto-save to localStorage).
const autosaver = createAutosaver(() => void store.autosave(platform));
store.$subscribe(() => {
  if (store.quadratCount > 0) autosaver.notify();
});

function onKeydown(event: KeyboardEvent): void {
  if (event.ctrlKey && event.key === 's') {
    event.preventDefault();
    void store.save(platform);
  }
}

// the tagging cursor is per-quadrat; entering another quadrat resets it
watch(
  () => store.session?.currentQuadratId,
  () => tagging.setCursor(0)
);

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void species.init(platform);
  void store.hasAutosaved(platform).then((v) => (hasAutosave.value = v));
});
onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown);
  autosaver.stop();
});
</script>

<template>
  <!-- Layout mirrors the legacy shell (src/App.vue): no app bar; the viewer
       fills the left side and the tab panel is a fixed-width right column
       that only appears once a quadrat exists. -->
  <v-app>
    <v-main class="fill-height">
      <v-container fluid class="fill-height pa-1">
        <v-row class="fill-height" align="stretch" no-gutters>
          <v-col class="fill-height">
            <v-card class="fill-height" color="tertiary">
              <!-- Home screen (legacy ImageViewer empty state) -->
              <div
                v-if="!store.currentQuadrat"
                class="home-screen"
                :style="{ backgroundImage: `url(${homeBgUrl})` }"
                data-test="home-screen"
              >
                <img :src="logoUrl" alt="Quadrator" class="home-title" />
                <v-card class="pa-1 elevation-9" color="tertiary" max-width="500">
                  <v-card-text class="text-center d-flex flex-column align-center">
                    <v-btn
                      color="primary"
                      size="x-large"
                      prepend-icon="mdi-image-plus"
                      class="elevation-6 mb-4 home-button"
                      data-test="home-load-images"
                      @click="onLoadImages"
                    >
                      Load Image
                    </v-btn>
                    <v-btn
                      v-if="hasAutosave"
                      color="primary"
                      size="large"
                      prepend-icon="mdi-history"
                      class="elevation-6 mb-4 home-button"
                      data-test="home-continue-last"
                      @click="onContinueLast"
                    >
                      Continue Last Session
                    </v-btn>
                    <v-btn
                      color="primary"
                      size="large"
                      prepend-icon="mdi-folder-open"
                      class="elevation-6 home-button"
                      data-test="home-open-session"
                      @click="onOpen"
                    >
                      Load from File
                    </v-btn>
                    <v-alert
                      v-if="homeError"
                      type="error"
                      density="compact"
                      class="mt-4"
                      data-test="home-error"
                    >
                      {{ homeError }}
                    </v-alert>
                    <p class="text-caption text-grey mb-1 mt-5">Beta Release v{{ appVersion }}</p>
                    <p class="text-caption text-grey mb-0">
                      © 2026 Shores Design. All rights reserved.
                    </p>
                  </v-card-text>
                </v-card>
              </div>

              <ImageCanvas v-else />
            </v-card>
          </v-col>

          <v-col v-if="store.currentQuadrat" class="fill-height pl-2 right-panel-col">
            <RightPanel @reset-nodes="store.resetBoundary()" />
          </v-col>
        </v-row>
      </v-container>
    </v-main>
  </v-app>
</template>

<style>
/* Single-window desktop app: the page itself never scrolls (legacy shell
   rule); only designated panes (e.g. the tab content) scroll internally. */
html,
body {
  overflow: hidden;
}
</style>

<style scoped>
/* Legacy right panel is a fixed 400px (store.js windowHelpers.rightPanelWidth). */
.right-panel-col {
  flex: 0 0 400px;
  max-width: 400px;
}

.home-screen {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-evenly;
  background-size: cover;
  background-position: center;
}

.home-title {
  max-width: 80%;
}

.home-button {
  width: 280px;
}
</style>
