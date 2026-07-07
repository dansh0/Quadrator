<script setup lang="ts">
import { onMounted, onUnmounted, watch } from 'vue';
import logoUrl from './assets/QUADRATOR_LOGO_white_text_transparent.png';
import homeBgUrl from './assets/pexels-pok-rie-33563-1031200.jpg';
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

async function onLoadImages(): Promise<void> {
  await store.addImages(platform);
}

async function onOpen(): Promise<void> {
  await store.open(platform);
}

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
});
onUnmounted(() => window.removeEventListener('keydown', onKeydown));
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
                      color="primary"
                      size="large"
                      prepend-icon="mdi-folder-open"
                      class="elevation-6 home-button"
                      data-test="home-open-session"
                      @click="onOpen"
                    >
                      Load from File
                    </v-btn>
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
