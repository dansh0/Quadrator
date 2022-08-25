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
        alert(alertString) {
            ipcRenderer.invoke('alert', alertString);
        },
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

            this.updateSamplePoints()

        },
        initNewQuadratSVG() {

            this.svgElem = d3.select('#quadratSelector');

            // clear previous images
            this.svgElem.selectAll().remove();

            // clear previous data
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

                // end condition for n-poly
                if (self.inputStatus.nodes.length > 0) {
                    if (Math.abs(xScale - self.inputStatus.nodes[0].x) < 0.025) {
                        if (Math.abs(yScale - self.inputStatus.nodes[0].y) < 0.025) {
                            console.log('HOME!')
                            // add last node as first
                            self.inputStatus.nodes.push(self.inputStatus.nodes[0])

                            // remove listener
                            self.svgElem.on('click', null)

                            self.makeCircles();

                            // start sample selection
                            self.createSamplePoints()
                            return
                        }
                    }
                }

                self.inputStatus.nodes.push({x: xScale, y: yScale});

                let nodeLength = self.inputStatus.nodes.length;
                if (self.quadratSettings.restrictToQuad && nodeLength == 4) {
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

            // make data model points
            let nodes = this.inputStatus.nodes;
            let numOfSampleRows = this.quadratSettings.numOfSampleRows;
            let numOfSampleCols = this.quadratSettings.numOfSampleCols;
            if (this.quadratSettings.restrictToQuad) {
                this.quadratData.randomSamplePointsRect(nodes, numOfSampleRows, numOfSampleCols)
            } else {
                this.quadratData.randomSamplePointsPoly(nodes)
                // let line = d3.line()
                // .x(d => (d.x * this.imgElem.width))
                // .y(d => (d.y * this.imgElem.height))
                
                // this.quadratData.cutLines.forEach((thisLine, iter) => {

                //     this.svgElem.append('path')
                //         .datum(thisLine)
                //         .attr('d', line)
                //         .attr('fill', 'none')
                //         .attr('stroke', "yellow")
                //         .attr('stroke-width', "0.5%")

                // })
            }

            // update scene
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
                        if (err) {
                            self.alert("Append/Save Failed. Make sure your file is not open in other programs")
                            throw err;
                        }
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
