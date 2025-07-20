<template>
  <v-container fluid class="pa-0">
    <v-data-table
      :headers="headers"
      :items="rows"
      dense
      class="elevation-1"
      disable-sort
      :items-per-page="10"
    >
      <template v-slot:no-data>
        <v-alert type="info" dense outlined>
          No data yet – run an analysis first.
        </v-alert>
      </template>
    </v-data-table>

    <v-row justify="end" class="d-flex justify-center mt-4 pa-0">
      <v-btn color="primary" @click="exportCsv">
        <v-icon left>mdi-download</v-icon> Export CSV
      </v-btn>
    </v-row>
  </v-container>
</template>

<script>
import { mapState } from 'vuex';

export default {
  name: 'QATab',
  computed: {
    ...mapState(['runningData']),
    headers() {
      return [
        { text: 'Image', value: 'image' },
        { text: 'Point', value: 'point' },
        { text: 'Species', value: 'species' }
      ];
    },
    rows() {
      // Placeholder: build rows from runningData (structure TBD)
      return [];
    }
  },
  methods: {
    exportCsv() {
      // Call existing export util when wired up
      console.log('Export CSV – logic TBD');
    }
  }
};
</script>

<style scoped>

.theme--dark.v-data-table {
    background-color: #444449;
    box-shadow: 0 0 0 0 !important;
}

</style> 