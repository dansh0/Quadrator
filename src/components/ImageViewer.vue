<template>
    <v-card :style="{'width':panelWidth, 'height':panelHeight}" color=tertiary>
        <div v-if="!imgSrc" class="background-container" :style="backgroundStyle">
            <v-container fill-height grid-list-md text-xs-center>
                <v-row class="fill-height">
                    <v-col cols="12" class="d-flex flex-column">
                        <v-row class="flex-grow-0" style="height: 40%">
                            <v-col cols="12" class="d-flex align-center justify-center">
                                <img src="@/assets/QUADRATOR_LOGO_white_text_transparent.png" alt="Quadrator" class="homeTitle">
                            </v-col>
                        </v-row>
                        <v-row class="flex-grow-0" style="height: 80%">
                            <v-col cols="12" class="d-flex align-center justify-center">
                                <v-card class="pa-1 elevation-9" color=tertiary max-width="500">
                                    <v-card-text class="text-center">
                                        <!-- <p class="text-body-1 mb-4">
                                            TODO: Add info here
                                        </p> -->
                                        <v-col class="d-flex flex-column align-center">
                                            <v-btn color="primary" x-large @click="selectImage()" class="elevation-6">
                                                <v-icon left>mdi-image-plus</v-icon>
                                                Load Image
                                            </v-btn>
                                        </v-col>
                                        <p class="text-caption grey--text mb-1 mt-5">
                                            Beta Release {{ appVersion ? `v${appVersion}` : '' }}
                                        </p>
                                        <p class="text-caption grey--text mb-0">
                                            © 2025 Shores Design. All rights reserved.
                                        </p>
                                    </v-card-text>
                                </v-card>
                            </v-col>
                        </v-row>
                    </v-col>
                </v-row>
            </v-container>
        </div>
        <v-container v-if="imgSrc" grid-list-md text-xs-center>
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
const { version } = require('../../package.json');
const fs = require('fs');
const setButtons = require('../utils/setButtons');

export default {
    name: 'ImageViewer',
    props: {
        
    },
    data: () => ({
        // imgElem: undefined,
        svgElem: undefined,
        imageAspect: undefined,
        newImage: true
    }),
    computed: {
        ...mapState([
            'imgSrc',
            'imgPathList',
            'imgElem',
            'windowHelpers',
            'quadratData',
            'runningData',
            'quadratSettings',
            'inputStatus',
            'buttons'
        ]),
        appVersion: function() {
            return version
        },
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
        },
        backgroundStyle() {
            return {
                backgroundImage: `url(${require('@/assets/images/pexels-pok-rie-33563-1031200.jpg')})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                zIndex: 0
            }
        },
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

        this.initImgElem()
        if (this.imgPathList.length > 0) {
            this.loadNewImage(this.imgPathList[0])
        }

    },
    methods: {
        ...mapMutations([
            'CHANGE_IMG_SRC',
            'NEW_QUADRAT',
            'SWAP_QUADRAT',
            'RESET_ALL',
            'UPDATE_RUNNING_DATA'
        ]),
        

        // ----
        // INIT
        // ----

        initImgElem() {

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

                if (this.newImage) {
                    // init new quadrat
                    this.initNewQuadratSVG();
                } else {
                    this.loadExistingQuadratSVG();
                }
                
            })

        },


        // --------------------
        // IMAGE LOADING
        // --------------------

        async selectImage() {
            let filePaths = await ipcRenderer.invoke('openFile')
            
            // if canceled, then quick action
            if (!filePaths || filePaths.length == 0) { return }

            // set store global
            filePaths.forEach(path => {
                this.imgPathList.push(path);
            })

            // load image if one is defined
            console.log("File Paths:", filePaths)
            this.loadNewImage(filePaths[0]);
        },

        loadNewImage(filePath) {
            // remove listeners
            d3.select('#quadratSelector').on('click', null);
            d3.select('#quadratSelector').on('mousemove', null);

            // update data
            this.CHANGE_IMG_SRC(filePath);
            this.NEW_QUADRAT();

            this.newImage = true;
            this.imgElem.src = this.imgSrc;
        },

        loadExistingImage(filePath) {
            // remove listeners
            d3.select('#quadratSelector').on('click', null);
            d3.select('#quadratSelector').on('mousemove', null);

            // update only the image src
            this.CHANGE_IMG_SRC(filePath);
            this.newImage = false;
            this.imgElem.src = this.imgSrc;
        },


        // ---------
        // SVG TOOLS
        // ---------

        updateCanvasProperties() {
            
            // update canvas size
            this.svgElem.style('width', this.imgElem.width);
            this.svgElem.style('height', this.imgElem.height);

            // update image size
            this.svgImage
            .attr('width', this.imgElem.width)
            .attr('height', this.imgElem.height)

            this.makeCircles()

        },

        createSamplePoints() {
            let self = this;

            // make data model points
            let nodes = this.inputStatus.nodes || [];
            let numOfSampleRows = this.quadratSettings.numOfSampleRows;
            let numOfSampleCols = this.quadratSettings.numOfSampleCols;
            if (this.quadratSettings.restrictToQuad || nodes.length == 5) {
                this.quadratData.randomSamplePointsRect(nodes, numOfSampleRows, numOfSampleCols)
            } else {
                this.quadratData.randomSamplePointsPoly(nodes)
                // let line = d3.line()
                //     .x(d => (d.x * this.imgElem.width))
                //     .y(d => (d.y * this.imgElem.height))
                
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

            if (!this.quadratData.samples || !this.quadratData.samples[0] || !this.quadratData.samples[0].x) { return } // not initialized yet

            let self = this

            this.svgElem.selectAll('sampleCircle')
                .data(this.quadratData.samples).enter()
                .append('circle')
                    .attr('class', 'sampleCircle')
                    .attr('cx', data => data.x * this.imgElem.width)
                    .attr('cy', data => data.y * this.imgElem.height)
                    .attr('r', "1%")
                    .attr('sampleNumber', data => data.sampleNumber)
                    .attr('fill', 'DarkOrchid')
                    .attr('stroke', 'Purple')
                    .on('click', function(event) {
                        self.inputStatus.sampleNumber = parseInt(d3.select(this).attr('sampleNumber'));
                    })
                    .filter(function() {
                        return parseInt(d3.select(this).attr("sampleNumber")) == self.inputStatus.sampleNumber;
                    })
                    .attr('fill', 'green')
                    .attr('stroke', 'darkgreen')

        },

        makeCircles() {

            this.svgElem.selectAll('circle').remove();

            // Safely handle undefined nodes
            const nodes = this.inputStatus.nodes || [];

            this.svgElem.selectAll('nodeCircle')
                .data(nodes).enter()
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
                .datum(nodes)
                .attr('d', line)
                .attr('fill', 'none')
                .attr('stroke', "red")
                .attr('stroke-width', "0.5%")

            this.updateSamplePoints()

        },


        // -----------------        
        // QUADRAT UTILITIES
        // -----------------

        initNewQuadratSVG() {

            this.svgElem = d3.select('#quadratSelector');

            // clear previous images
            this.svgElem.selectAll().remove();

            // clear previous data - safely initialize if undefined
            if (!this.inputStatus.nodes) {
                this.inputStatus.nodes = [];
            } else {
                this.inputStatus.nodes.length = 0;
            }

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

                let xScale = coords[0] / self.imgElem.width;
                let yScale = coords[1] / self.imgElem.height;

                // end condition for n-poly
                if (self.inputStatus.nodes.length > 0 && !self.quadratSettings.restrictToQuad) {
                    if (Math.abs(xScale - self.inputStatus.nodes[0].x) < 0.025) {
                        if (Math.abs(yScale - self.inputStatus.nodes[0].y) < 0.025) {

                            // add last node as first
                            self.inputStatus.nodes.push(self.inputStatus.nodes[0])

                            // remove listener
                            self.svgElem.on('click', null);
                            self.svgElem.on('mousemove', null);
                            document.body.style.cursor = 'default';

                            self.makeCircles();

                            // start sample selection
                            self.createSamplePoints()
                            return
                        }
                    }
                }


                self.inputStatus.nodes.push({x: xScale, y: yScale});
                
                // add cursor action if it's the first
                if (self.inputStatus.nodes.length == 1 && !self.quadratSettings.restrictToQuad) {

                    self.svgElem.on('mousemove', self._cursorCompletePoly);

                }

                let nodeLength = self.inputStatus.nodes.length;
                if (self.quadratSettings.restrictToQuad && nodeLength == 4) {
                    // add last node as first
                    self.inputStatus.nodes.push(self.inputStatus.nodes[0])

                    // remove listener
                    self.svgElem.on('click', null);
                    self.svgElem.on('mousemove', null);

                    self.makeCircles();

                    // start sample selection
                    self.createSamplePoints()
                } else {

                    self.makeCircles();
                }

            })

        },

        loadExistingQuadratSVG() {

            // redirect to reset quadrat if empty (this allows listeners to reset)
            if (!this.inputStatus.nodes || this.inputStatus.nodes.length == 0) {
                this.initNewQuadratSVG();
                return
            }

            this.svgElem = d3.select('#quadratSelector');

            // clear previous images
            this.svgElem.selectAll().remove();

            // show image
            this.svgImage = this.svgElem.append('svg:image')
                .attr('xlink:href', this.imgElem.src)


            // update canvas with new image
            this.updateCanvasProperties()

            // clear previous shapes
            this.makeCircles();

        },

        _cursorCompletePoly(subEvent) { 
            let subCoords = d3.pointer(subEvent);

            let xSubScale = subCoords[0] / this.imgElem.width;
            let ySubScale = subCoords[1] / this.imgElem.height;

            if (Math.abs(xSubScale - this.inputStatus.nodes[0].x) < 0.025) {
                if (Math.abs(ySubScale - this.inputStatus.nodes[0].y) < 0.025) {
                    document.body.style.cursor = 'crosshair'; 
                } else {
                    document.body.style.cursor = 'default';
                }
            } else {
                document.body.style.cursor = 'default';
            }
        },


        // ---------------
        // OTHER UTILITIES
        // ---------------

        alert(alertString) {
            ipcRenderer.invoke('alert', alertString);
        },

        async setButtons() {
            await setButtons(this.buttons, this.alert);
        },

    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style lang="scss" scoped>
.background-container {
    position: relative;
}

.title-block {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    background-color: rgba(0, 0, 0, 0.5);
    padding: 2rem;
    border-radius: 8px;
    backdrop-filter: blur(5px);
}

.homeTitle {
    max-width: 80%;
    height: auto;
}

.v-card {
    position: relative;
    overflow: hidden;
}

.v-container {
    position: relative;
    z-index: 1;
}
</style>
