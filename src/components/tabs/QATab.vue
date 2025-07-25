<template>
    <v-container fluid class="pa-0">
        <v-data-table class="ma-4 qa-table elevation-1" color="tertiary" :headers="headers" :items="rows" hide-default-footer dense disable-sort :items-per-page="itemsPerPage" @click:row="rowClicked">
            <template v-slot:no-data>
                <v-alert type="info" dense outlined>
                    No data yet – run an analysis first.
                </v-alert>
            </template>
        </v-data-table>
        <v-alert type="info" dense outlined class="ma-4">
            Review and verify species for each quadrat point above. When finished, click below to export the coverage data.
        </v-alert>
        <v-row justify="end" class="d-flex justify-center mt-4 pa-0">
            <v-btn color="primary" @click="exportCsv">
                <v-icon left>mdi-download</v-icon> Export Results
            </v-btn>
        </v-row>
    </v-container>
</template>

<script>
import { mapState } from 'vuex';

export default {
    name: 'QATab',
    computed: {
        ...mapState(['quadratData','quadratSettings','inputStatus']),
        headers() {
            return [
                { text: 'Point', value: 'point' },
                { text: 'Species', value: 'species' }
            ];
        },
        rows() {
            const rows = [];
            this.quadratData.samples.map(sample => {
                rows.push({
                    point: sample.sampleNumber+1,
                    species: sample.codes.join(', ')
                })
            })
            return rows;
        },
        itemsPerPage() {
            // show all samples from a single quadrat on one 'page'
            return this.quadratSettings.numOfSampleRows * this.quadratSettings.numOfSampleCols;
        }
    },
    methods: {
        exportCsv() {
            // Call existing export util when wired up
            console.log('Export CSV – logic TBD');
        },
        rowClicked(item) {
            // item.point is 1-based; convert to 0-based index for sampleNumber
            const index = item.point - 1;
            if (index >= 0) {
                this.inputStatus.sampleNumber = index;
            }
        }
    }
};
</script>

<style scoped>
/* Allow the table body to scroll if it exceeds available height */
.qa-table {
  max-height: 75vh; /* adjust as needed */
  overflow-y: auto;
}
</style>