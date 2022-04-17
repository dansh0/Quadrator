<template>
    <v-card :style="{'width':panelWidth}" color=tertiary max-height=200 height="100%" >
        <v-container v-if="imgSrc" fluid class="pa-0">
            <v-row class="mx-2 justify-center">
                <svg id="zoomImage" width="100%" height="100%"/>
                <!-- <v-img width="200px" height="180px" contain :src="imgSrc" class="my-2"/> -->
            </v-row>
        </v-container>
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';
import * as d3 from 'd3';

export default {
    name: 'ZoomPanel',
    props: {
    },
    data: () => ({
        
    }),
    computed: {
        ...mapState([
            'imgSrc',
            'quadratData',
            'windowHelpers'
        ]),
        panelWidth: function() {
           return this.windowHelpers.rightPanelWidth + 'px'
        }
    },
    watch: {
        'quadratData.imgSrc': function() {
            console.log(this.imgSrc)
            d3.select('#zoomImage').append('svg:image')
                .attr('xlink:href', this.imgSrc)
        }
    },
    mounted() {
        d3.select('#zoomImage').append('svg:image')
                .attr('xlink:href', this.imgSrc)
    },
    methods: {
        ...mapMutations([
        ]),
    }
}
</script>


<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>


</style>
