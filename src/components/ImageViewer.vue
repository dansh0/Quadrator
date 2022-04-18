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
                <v-btn color=primary @click="initNewQuadratSVG()" class="ml-10">Reset Nodes</v-btn>
                <v-btn color=primary @click="exportData()" class="ml-10">Export Data</v-btn>
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
const fs = require('fs');

export default {
    name: 'ImageViewer',
    props: {
        
    },
    data: () => ({
        // imgElem: undefined,
        svgElem: undefined,
        imageAspect: undefined
    }),
    computed: {
        ...mapState([
            'imgSrc',
            'imgElem',
            'windowHelpers',
            'quadratData',
            'quadratSettings',
            'inputStatus',
            'buttons'
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
            //update imgElem height
            // set height to maintain aspect
            if (this.imageAspect && this.imageAspect < this.panelAspect) {
                this.imgElem.height = this.windowHelpers.height - 200;
                this.imgElem.width = this.imgElem.height * this.imageAspect;
            }

            // update canvas if applicable
            if (document.getElementById('quadratSelector')) {
                this.updateCanvasProperties();
            }
        },
        panelWidth: function() {
            // set height to maintain aspect
            if (this.imageAspect && this.imageAspect > this.panelAspect) {
                this.imgElem.width = this.windowHelpers.leftPanelWidth - 50;
                this.imgElem.height = this.imgElem.width / this.imageAspect;
            }

            // update canvas if applicable
            if (document.getElementById('quadratSelector')) {
                this.updateCanvasProperties();
            }
        },
        'inputStatus.sampleNumber': function() {
            this.updateSamplePoints();
        }
    },
    mounted() {

        this.initimgElem()

        // this.loadImage("C:\\Users\\dan\\Documents\\Fortify\\quadrator\\images\\fish.jpg") // TEMP
    },
    methods: {
        ...mapMutations([
            'changeImgSrc',
            'newQuadrat'
        ]),
        initimgElem() {
            // this.imgElem = document.createElement('img');
            // this.imgElem.height = this.windowHelpers.height - 200;
            this.imgElem.style.position = "absolute";
            this.imgElem.style.top = 0;
            this.imgElem.style.left = 0;
            this.imgElem.style['z-index'] = 1;
            this.imgElem.style['object-fit'] = 'contain';

            // reset size
            this.imgElem.style.width = undefined;
            this.imgElem.style.height = undefined;

            this.imgElem.addEventListener('load', event => {

                // get aspect of input image
                this.imageAspect = this.imgElem.naturalWidth/this.imgElem.naturalHeight;

                // set height or width to maintain aspect
                if (this.imageAspect && this.imageAspect > this.panelAspect) {
                    this.imgElem.width = this.windowHelpers.leftPanelWidth - 50;
                    this.imgElem.height = this.imgElem.width / this.imageAspect;
                } else {
                    this.imgElem.height = this.windowHelpers.height - 200;
                    this.imgElem.width = this.imgElem.height * this.imageAspect;
                } 

                // increment counter
                this.inputStatus.loadedIteration += 1

                // init new quadrat
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

            this.imgElem.src = this.imgSrc;

        },
        makeCircles() {

            this.svgElem.selectAll('circle').remove();

            this.svgElem.selectAll('nodeCircle')
                .data(this.inputStatus.nodes).enter()
                .append('circle')
                    .attr('class', 'nodeCircle')
                    .attr('cx', data => data.x * this.imgElem.width)
                    .attr('cy', data => data.y * this.imgElem.height)
                    .attr('r', "1%")
                    .attr('fill', 'red')

            let line = d3.line()
                .x(d => (d.x * this.imgElem.width))
                .y(d => (d.y * this.imgElem.height))
                
            this.svgElem.selectAll('path').remove();

            this.svgElem.append('path')
                .datum(this.inputStatus.nodes)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', "red")
                .attr('stroke-width', "0.5%")

            this.createGrid()

            this.updateSamplePoints()

        },
        initNewQuadratSVG() {

            this.svgElem = d3.select('#quadratSelector');

            // clear previous images
            this.svgElem.selectAll().remove();

            // clear previous data
            this.inputStatus.edgesNodes = [];
            this.inputStatus.nodes.length = 0;

            this.svgImage = this.svgElem.append('svg:image')
                .attr('xlink:href', this.imgElem.src)

            if (this.quadratData.samples) {
                this.quadratData.resetSamples();
            }

            // update canvas with new image
            this.updateCanvasProperties()

            // clear previous shapes
            this.makeCircles();

            let self = this
            this.svgElem.on('click', function(event) {

                let coords = d3.pointer(event);
                console.log(coords)

                let xScale = coords[0] / self.imgElem.width;
                let yScale = coords[1] / self.imgElem.height;

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

        },
        updateCanvasProperties() {
            // get canvas tag
            // this.svgElem = document.getElementById('quadratSelector');
            

            // update canvas
            // this.svgElem.width = this.imgElem.width;
            // this.svgElem.height = this.imgElem.height;



            // let ctx = this.svgElem.getContext('2d');
            // ctx.drawImage(this.imgElem, 0, 0, this.imgElem.width, this.imgElem.height);
            
            // update canvas size
            this.svgElem.style('width', this.imgElem.width);
            this.svgElem.style('height', this.imgElem.height);

            // update image size
            this.svgImage
            .attr('width', this.imgElem.width)
            .attr('height', this.imgElem.height)

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

            edgesNodes[1].forEach((edgeNodeY, yIndex) => {
                if (yIndex != edgesNodes[1].length - 1) {
                    edgesNodes[0].forEach((edgeNodeX, xIndex) => {
                        if (xIndex != edgesNodes[0].length - 1) {

                            // Make an H bridge
                            let xRand = Math.random();
                            let xSamplePos = (xRand + xIndex) / self.quadratSettings.numOfSampleRows;
                            let lineNodeX1 = {
                                x: nodes[0].x + xSamplePos * (nodes[1].x - nodes[0].x),
                                y: nodes[0].y + xSamplePos * (nodes[1].y - nodes[0].y)
                            }
                            let lineNodeX2 = {
                                x: nodes[3].x + xSamplePos * (nodes[2].x - nodes[3].x),
                                y: nodes[3].y + xSamplePos * (nodes[2].y - nodes[3].y)
                            }

                            // // Find position along bridge of H
                            let yRand = Math.random();
                            let ySamplePos = (yRand + yIndex) / self.quadratSettings.numOfSampleCols;

                            let sampleNumber = yIndex * self.quadratSettings.numOfSampleRows + xIndex

                            let samplePoint = this.quadratData.samples[sampleNumber]

                            samplePoint.x = lineNodeX1.x + ySamplePos * (lineNodeX2.x - lineNodeX1.x),
                            samplePoint.y = lineNodeX1.y + ySamplePos * (lineNodeX2.y - lineNodeX1.y),
                            samplePoint.sampleNumber = sampleNumber
                            
                        }
                    })
                }
            })

            this.updateSamplePoints();

        },

        updateSamplePoints() {

            if (!this.quadratData.samples[0].x) { return } // not initialized yet

            let self = this

            this.svgElem.selectAll('sampleCircle')
                .data(this.quadratData.samples).enter()
                .append('circle')
                    .attr('class', 'sampleCircle')
                    .attr('cx', data => data.x * this.imgElem.width)
                    .attr('cy', data => data.y * this.imgElem.height)
                    .attr('r', "1%")
                    .attr('sampleNumber', data => data.sampleNumber)
                    .attr('fill', 'purple')
                    .on('click', function(event) {
                        self.inputStatus.sampleNumber = parseInt(d3.select(this).attr('sampleNumber'));
                    })
                    .filter(function() {
                        return parseInt(d3.select(this).attr("sampleNumber")) == self.inputStatus.sampleNumber;
                    })
                    .attr('fill', 'green')

            this.createGrid();
        },
        createGrid() {
            let self = this;

            if (!self.inputStatus.edgesNodes[0]) { return } // not initialized yet

            let line = d3.line()
                .x(d => (d.x * self.imgElem.width))
                .y(d => (d.y * self.imgElem.height))
                
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
        },
        exportData() {
            let self = this;
            ipcRenderer.invoke('appendFile')
            .then((filePath) => {
                console.log(filePath.filePath)
                let dataOutput = ""
                dataOutput = self.quadratData.toCSV(this.buttons)
                if (fs.existsSync(filePath.filePath)) {
                    fs.appendFile(filePath.filePath, dataOutput, function (err) {
                        if (err) throw err;
                        console.log('Saved!');
                    });
                } else {
                    let outputWithHeader = "Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %\n" + dataOutput; 
                    fs.writeFile(filePath.filePath, outputWithHeader, function (err) {
                        if (err) throw err;
                        console.log('Saved!');
                    });
                }

            });
        }
    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style lang="scss" scoped>


</style>
