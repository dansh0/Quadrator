<template>
    <v-card :style="{'width':panelWidth, 'height':panelHeight}" color=tertiary>
        <v-container v-if="!imgSrc" fill-height grid-list-md text-xs-center>
            <v-row class="mx-3 justify-center">
                <v-btn color=primary x-large @click="selectImage()">Load Image</v-btn>
            </v-row>
        </v-container>
        <v-container v-if="imgSrc" grid-list-md text-xs-center>
            <v-row class="mx-3 mb-3 justify-center">
                <v-btn color=primary @click="selectImage()">Load Image</v-btn>
                <v-btn color=primary @click="resetSelection()" class="ml-10">Reset Nodes</v-btn>
            </v-row>
            <v-row align="center" class="mx-1 mb-1">
                <!-- <v-img max-width="100%" max-height="100%" :src="imgSrc"/> -->
                <svg id="quadratSelector" width="100%" height="100%" />
            </v-row>
        </v-container>
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';
import * as d3 from 'd3';
const { ipcRenderer } = require('electron');

export default {
    name: 'ImageViewer',
    props: {
        
    },
    data: () => ({
        imageElem: undefined,
        svgElem: undefined,
        imageAspect: undefined
    }),
    computed: {
        ...mapState([
            'imgSrc',
            'windowHelpers',
            'quadratData',
            'quadratSettings',
            'inputStatus'
        ]),
        panelWidth: function() {

            return this.windowHelpers.leftPanelWidth + 'px'
        },
        panelHeight: function() {
            
            if (!this.imgSrc) {
                return this.windowHelpers.height + 'px'
            } else {
                return '100%'
            }
        },
        panelAspect: function() {

            return this.windowHelpers.leftPanelWidth / this.windowHelpers.height

        },
        numOfSamples: function() {
            return this.quadratSettings.numOfSampleRows * this.quadratSettings.numOfSampleCols
        }
    },
    watch: {
        panelHeight: function() {
            //update imageElem height
            // set height to maintain aspect
            if (this.imageAspect && this.imageAspect < this.panelAspect) {
                this.imageElem.height = this.windowHelpers.height - 200;
                this.imageElem.width = this.imageElem.height * this.imageAspect;
            }

            // update canvas if applicable
            if (document.getElementById('quadratSelector')) {
                this.updateCanvasProperties();
            }
        },
        panelWidth: function() {
            // set height to maintain aspect
            if (this.imageAspect && this.imageAspect > this.panelAspect) {
                this.imageElem.width = this.windowHelpers.leftPanelWidth - 50;
                this.imageElem.height = this.imageElem.width / this.imageAspect;
            }

            // update canvas if applicable
            if (document.getElementById('quadratSelector')) {
                this.updateCanvasProperties();
            }
        },
    },
    mounted() {

        this.initImageElem()

        // this.loadImage("C:\\Users\\dan\\Documents\\Fortify\\quadrator\\images\\fish.jpg") // TEMP
    },
    methods: {
        ...mapMutations([
            'changeImgSrc',
            'newQuadrat'
        ]),
        initImageElem() {
            this.imageElem = document.createElement('img');
            // this.imageElem.height = this.windowHelpers.height - 200;
            this.imageElem.style.position = "absolute";
            this.imageElem.style.top = 0;
            this.imageElem.style.left = 0;
            this.imageElem.style['z-index'] = 1;
            this.imageElem.style['object-fit'] = 'contain';

            // reset size
            this.imageElem.style.width = undefined;
            this.imageElem.style.height = undefined;

            this.imageElem.addEventListener('load', event => {

                // get aspect of input image
                this.imageAspect = this.imageElem.naturalWidth/this.imageElem.naturalHeight;

                // set height or width to maintain aspect
                if (this.imageAspect && this.imageAspect > this.panelAspect) {
                    this.imageElem.width = this.windowHelpers.leftPanelWidth - 50;
                    this.imageElem.height = this.imageElem.width / this.imageAspect;
                } else {
                    this.imageElem.height = this.windowHelpers.height - 200;
                    this.imageElem.width = this.imageElem.height * this.imageAspect;
                } 


                this.initNewQuadratSVG();
                
            })

        },
        selectImage() {
            ipcRenderer.invoke('openFile')
            .then((filePath) => {
                console.log(filePath)

                this.loadImage(filePath);
            });
        },
        loadImage(filePath) {
            // update data
            this.changeImgSrc(filePath);
            this.newQuadrat();

            this.imageElem.src = this.imgSrc;

        },
        makeCircles() {

            this.svgElem.selectAll('circle').remove();

            this.svgElem.selectAll('circle')
                .data(this.inputStatus.nodes).enter()
                .append('circle')
                    .attr('cx', data => data.x * this.imageElem.width)
                    .attr('cy', data => data.y * this.imageElem.height)
                    .attr('r', "1%")
                    .attr('fill', 'red')

            let line = d3.line()
                .x(d => (d.x * this.imageElem.width))
                .y(d => (d.y * this.imageElem.height))
                
            this.svgElem.selectAll('path').remove();

            this.svgElem.append('path')
                .datum(this.inputStatus.nodes)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', "red")
                .attr('stroke-width', "0.5%")

            this.createGrid()

        },
        initNewQuadratSVG() {

            this.svgElem = d3.select('#quadratSelector');

            // clear previous images
            this.svgElem.selectAll().remove();

            this.svgImage = this.svgElem.append('svg:image')
                .attr('xlink:href', this.imageElem.src)

            // update canvas with new image
            this.updateCanvasProperties()

            // clear previous shapes
            this.makeCircles();

            let self = this
            this.svgElem.on('click', function(event) {

                let coords = d3.pointer(event);
                console.log(coords)

                let xScale = coords[0] / self.imageElem.width;
                let yScale = coords[1] / self.imageElem.height;

                self.inputStatus.nodes.push({x: xScale, y: yScale});

                let nodeLength = self.inputStatus.nodes.length;
                if (nodeLength == self.quadratSettings.nEdge) {
                    // add last node as first
                    self.inputStatus.nodes.push(self.inputStatus.nodes[0])

                    // remove listener
                    self.svgElem.on('click', null)

                    self.makeCircles();

                    // start sample selection
                    self.createSamplePoints()
                } else {

                    self.makeCircles();
                }


            })

            // this.testDraw()


        },
        resetSelection() {
            this.inputStatus.nodes.length = 0;

            this.initNewQuadratSVG()
        },
        updateCanvasProperties() {
            // get canvas tag
            // this.svgElem = document.getElementById('quadratSelector');
            

            // update canvas
            // this.svgElem.width = this.imageElem.width;
            // this.svgElem.height = this.imageElem.height;



            // let ctx = this.svgElem.getContext('2d');
            // ctx.drawImage(this.imageElem, 0, 0, this.imageElem.width, this.imageElem.height);
            
            // update canvas size
            this.svgElem.style('width', this.imageElem.width);
            this.svgElem.style('height', this.imageElem.height);

            // update image size
            this.svgImage
            .attr('width', this.imageElem.width)
            .attr('height', this.imageElem.height)

            this.makeCircles()

        },
        testDraw() {
            let svg = d3.select('#quadratSelector');

            svg.append("circle")
                .style("stroke", "gray")
                .style("fill", "black")
                .attr("r", 40)
                .attr("cx", 50)
                .attr("cy", 20);
        },
        createSamplePoints() {
            let self = this;

            let nodes = this.inputStatus.nodes
            nodes.forEach((node, index) => {
                if (index != nodes.length - 1) {
                    let line = [node, nodes[index + 1]];
                    let edgeNodes = [];
                    let nodeCount = index%2==0 ? self.quadratSettings.numOfSampleRows : self.quadratSettings.numOfSampleCols;
                    let stepX = (line[1].x - line[0].x) / (nodeCount)
                    let edgeNodesX = d3.range(line[0].x, line[1].x + stepX*0.5, stepX )
                    let stepY = (line[1].y - line[0].y) / (nodeCount)
                    let edgeNodesY = d3.range(line[0].y, line[1].y + stepY*0.5, stepY )
                    console.log(edgeNodesX, edgeNodesY)
                    edgeNodesX.forEach((edgeNodeX, index) => {
                        edgeNodes.push({x: edgeNodeX, y: edgeNodesY[index]})
                    })
                    self.inputStatus.edgesNodes.push(edgeNodes)
                }
            })

            // make points
            let samplePoints = []
            let edgesNodes = self.inputStatus.edgesNodes
            edgesNodes[0].forEach((edgeNodeX, xIndex) => {
                if (xIndex != edgesNodes[0].length - 1) {
                    edgesNodes[1].forEach((edgeNodeY, yIndex) => {
                        if (yIndex != edgesNodes[1].length - 1) {
                            // TODO solve points here
                        }
                    })
                }
            })

            this.svgElem.selectAll('circle')
                .data(samplePoints).enter()
                .append('circle')
                    .attr('cx', data => data.x * this.imageElem.width)
                    .attr('cy', data => data.y * this.imageElem.height)
                    .attr('r', "1%")
                    .attr('fill', 'purple')


            this.createGrid();
        },
        createGrid() {
            let self = this;

            if (!self.inputStatus.edgesNodes[0]) { return } // not initialized yet

            console.log(this.inputStatus.edgesNodes)

            let line = d3.line()
                .x(d => (d.x * self.imageElem.width))
                .y(d => (d.y * self.imageElem.height))
                
            // self.svgElem.selectAll('path').remove();

            let edgesNodes = self.inputStatus.edgesNodes
            edgesNodes[0].forEach((node, index) => {
                let lineNodes = [node, edgesNodes[2][edgesNodes[2].length - index - 1]]
                self.svgElem.append('path')
                    .datum(lineNodes)
                    .attr('d', line)
                    .attr('fill', 'none')
                    .attr('stroke', "red")
                    .attr('stroke-width', "0.25%")
                    .style("stroke-dasharray", ("3, 3"))
            })
            edgesNodes[1].forEach((node, index) => {
                let lineNodes = [node, edgesNodes[3][edgesNodes[3].length - index - 1]]
                self.svgElem.append('path')
                    .datum(lineNodes)
                    .attr('d', line)
                    .attr('fill', 'none')
                    .attr('stroke', "red")
                    .attr('stroke-width', "0.25%")
                    .style("stroke-dasharray", ("3, 3"))
            })
        }
    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style lang="scss" scoped>


</style>
