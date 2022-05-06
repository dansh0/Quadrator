<template>
    <v-card :style="{'width':panelWidth}" color=tertiary max-height=200 height="100%" >
        <v-container v-if="imgElem.src" fluid class="pa-0">
            <v-row class="mx-2 py-2 justify-center">
                <svg id="zoomImage" width="100%" height="100%"/>
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
        zoomWidth: 4000
    }),
    computed: {
        ...mapState([
            'imgElem',
            'imgSrc',
            'quadratData',
            'inputStatus',
            'windowHelpers'
        ]),
        panelWidth: function() {
            return this.windowHelpers.rightPanelWidth + 'px'
        },
        imageAspect: function() {
            if (this.imgElem.naturalWidth) {
                return this.imgElem.naturalWidth/this.imgElem.naturalHeight;
            } else {
                return 1;
            }
        },
        sampleCoords: function() {
            if (this.quadratData.samples) {
                let sample = this.quadratData.samples[this.inputStatus.sampleNumber]
                return [sample.x, sample.y] 
            } else {
                return undefined
            }
        },
    },
    watch: {
        'imageAspect': function() {
            console.log(this.imgElem)
        },
        'sampleCoords': function(coords) {
            let svgElement = d3.select('#zoomImage');
            let svgImage = d3.select('#svgImage');

            let svgWidth = parseInt(svgElement.style('width'))
            let svgHeight = parseInt(svgElement.style('height'))
            let imageWidth = parseInt(svgImage.style('width'))
            let imageHeight = parseInt(svgImage.style('height'))

            let aspectRatio = this.imgElem.naturalWidth/this.imgElem.naturalHeight;

            svgImage.attr('x', parseInt(-coords[0]*imageWidth + svgWidth/2))
            svgImage.attr('y', parseInt(-coords[1]*imageHeight + svgHeight/2))
            svgImage.attr('width', this.zoomWidth)
            svgImage.attr('height', this.zoomWidth/aspectRatio)

            // svgImage.attr('x', 10-parseInt(svgImage.style('width')))
            // svgImage.attr('y', 10-parseInt(svgImage.style('height')))
        },
        'inputStatus.loadedIteration': function() {
            // new image is loaded, update

            // get aspect of input image
            console.log(this.imageAspect)

            d3.select('#svgImage')
                .attr('xlink:href', this.imgElem.src)

        }
    },
    mounted() {

        let svgElement = d3.select('#zoomImage');
        
        // init image
        svgElement.append('svg:image')
                .attr('id', 'svgImage')

        let center = [
            parseInt(svgElement.style('width')) / 2,
            parseInt(svgElement.style('height')) / 2
        ]

        let dist = 15;

        let crosshairPoints = [
            {x: center[0], y: center[1]},
            {x: center[0] + dist, y: center[1]},
            {x: center[0] - dist, y: center[1]},
            {x: center[0], y: center[1]},
            {x: center[0], y: center[1] + dist},
            {x: center[0], y: center[1] - dist},
        ]

        // init crosshair
        let line = d3.line()
            .x(d => (d.x))
            .y(d => (d.y))

        svgElement.append('path')
            .datum(crosshairPoints)
            .attr('d', line)
            .attr('fill', 'none')
            .attr('stroke', "black")
            .attr('stroke-width', "1px")

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
