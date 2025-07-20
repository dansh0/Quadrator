<template>
  <v-container fluid class="pa-0 pt-4">
    <!-- Menu buttons bar (only shown in Image Prep tab) -->
    <MenuButtons
      ref="menuButtons"
      @load-new-image="forwardLoadNewImage"
      @load-existing-image="forwardLoadExistingImage"
      @init-new-quadrat-svg="forwardInitNewQuadratSVG"
    />

    <v-container class="pa-4">
        <!-- Quadrat name -->
        <v-text-field
        label="Quadrat Name"
        v-model="quadratData.name"
        class="px-5 pt-5 mt-0"
        dense
        ></v-text-field>

        <!-- <v-row>
        <v-col cols="12">
            <v-alert type="info" outlined dense>
            Define the quadrat geometry and sampling parameters here.
            </v-alert>
        </v-col>
        </v-row>

        <v-row>
        <v-col cols="12" md="6">
            <v-text-field
            dense
            label="Quadrat Area (m²)"
            v-model.number="localSettings.area"
            ></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
            <v-text-field
            dense
            label="Points per Quadrat"
            v-model.number="localSettings.pointCount"
            ></v-text-field>
        </v-col>
        </v-row>

        <v-row>
        <v-col cols="12" md="6">
            <v-text-field
            dense
            label="Point Spacing (px)"
            v-model.number="localSettings.spacing"
            ></v-text-field>
        </v-col>
        <v-col cols="12" md="6">
            <v-switch
            v-model="restrictToQuad"
            label="Restrict points to quadrat area"
            inset
            dense
            ></v-switch>
        </v-col>
        </v-row> -->

    </v-container>
    <v-row justify="center" class="mt-4">
      <v-btn color="primary" class="mr-2" @click="prevImage">Prev Image</v-btn>
      <v-btn color="primary" @click="nextImage">Next Image</v-btn>
    </v-row>
  </v-container>
</template>

<script>
import { mapState } from 'vuex';
import MenuButtons from '../MenuButtons.vue';

export default {
  name: 'ImagePrepTab',
  components: {
    MenuButtons
  },
  data() {
    return {
      // Local placeholders – in real logic they will sync with Vuex
      localSettings: {
        area: 0,
        pointCount: 25,
        spacing: 10
      }
    };
  },
  computed: {
    // Pull settings from Vuex (placeholder – full sync logic can be added later)
    ...mapState(['quadratSettings', 'quadratData']),
    restrictToQuad: {
      get() {
        return this.quadratSettings.restrictToQuad;
      },
      set(val) {
        // In a full implementation we would commit a mutation here
        // e.g. this.UPDATE_QUAD_SETTINGS({ key: 'restrictToQuad', value: val });
      }
    }
  },
  methods: {
    // Placeholder for future mutations once defined in store
    prevImage() {
      // Emit event so parent/canvas can swap image; real logic TBD
      this.$emit('prev-image');
    },
    nextImage() {
      this.$emit('next-image');
    },

    // Forward events from MenuButtons up to RightPanel so existing listeners keep working
    forwardLoadNewImage(filePath) {
      this.$emit('load-new-image', filePath);
    },
    forwardLoadExistingImage(filePath) {
      this.$emit('load-existing-image', filePath);
    },
    forwardInitNewQuadratSVG() {
      this.$emit('init-new-quadrat-svg');
    }
  }
};
</script>

<style scoped>
/* Placeholder styles – can adjust later */
</style> 