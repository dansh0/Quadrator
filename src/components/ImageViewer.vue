<template>
    <v-card :style="{'width':panelWidth, 'height':panelHeight}" color=tertiary>
        <v-container v-if="!imgSrc" fill-height grid-list-md text-xs-center>
            <v-row class="mx-3 justify-center">
                <v-btn color=primary x-large @click="selectImage()">Load Image</v-btn>
            </v-row>
        </v-container>
        <v-container v-if="imgSrc" grid-list-md text-xs-center>
            <v-row class="mr-3 mb-3 justify-center">
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="fullReset()"  v-bind="attrs" v-on="on" class="ml-5 mt-3">Start Over</v-btn>
                    </template>
                    <span>Delete all unsaved data and restart</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="selectImage()" v-bind="attrs" v-on="on" class="ml-5 mt-3">Load Image</v-btn>
                    </template>
                    <span>Load one or multiple images to add to this image group</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="resetNodes()" v-bind="attrs" v-on="on" class="ml-5 mt-3">Reset Nodes</v-btn>
                    </template>
                    <span>Reset boundary polygon definition and data nodes for this quadrat</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="exportData()" v-bind="attrs" v-on="on" class="ml-5 mt-3">Export Data</v-btn>
                    </template>
                    <span>Save all entered data for all loaded quadrats as appended rows of a CSV file</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="previousImage()" v-bind="attrs" v-on="on" class="ml-5 mt-3">Prev. Image</v-btn>
                    </template>
                    <span>Move back to the previous image to analyze</span>
                </v-tooltip>
                <v-tooltip bottom>
                    <template v-slot:activator="{ on, attrs }">
                        <v-btn color=primary small @click="nextImage()" v-bind="attrs" v-on="on" class="ml-5 mt-3">Next Image</v-btn>
                    </template>
                    <span>Move forward to the next image to analyze</span>
                </v-tooltip>
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

        this.initImgElem()

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
        // TOP BUTTON FUNCTIONS
        // --------------------

        async fullReset() {

            let questionInfo = {
                title: "Confirm Full Reset",
                question: "Are you sure you want to delete all unsaved progress and start over?",
                buttons: ["No", "Yes"]
            };
            let confirmation = await ipcRenderer.invoke('question', questionInfo);
            if (!confirmation.response) { return }
                
            this.RESET_ALL();
        },

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

        async resetNodes() {
            if (this.inputStatus.nodes.length > 0) {
                let questionInfo = {
                    title: "Confirm Node Reset",
                    question: "Are you sure you want to reset your node selections?",
                    buttons: ["No", "Yes"]
                };
                let confirmation = await ipcRenderer.invoke('question', questionInfo);
                if (!confirmation.response) { return }
            }

            // if all good then init new one
            this.initNewQuadratSVG()
        },

        async exportData() {

            // update running data list
            this.UPDATE_RUNNING_DATA();

            let filePath = await ipcRenderer.invoke('appendFile');

            // quit if file select was canceled
            if (!filePath.filePath) { return }

            console.log("Export Path:", filePath.filePath)
            
            // build csv text
            let dataOutput = ""
            this.runningData.forEach(image => {
                dataOutput += image.quadratData.toCSV(this.buttons);
            })
            // dataOutput = this.quadratData.toCSV(this.buttons)
            if (fs.existsSync(filePath.filePath)) {
                fs.appendFile(filePath.filePath, dataOutput, function (err) {
                    if (err) {
                        this.alert("Append/Save Failed. Make sure your file is not open in other programs")
                        throw err;
                    }
                    console.log('Data Exported!');
                });
            } else {
                let outputWithHeader = "Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %\n" + dataOutput; 
                fs.writeFile(filePath.filePath, outputWithHeader, function (err) {
                    if (err) throw err;
                    console.log('Data Exported!');
                });
            }

        },

        previousImage() {
            let currentImgIndex = this.imgPathList.indexOf(this.quadratData.imgSrc);

            // do nothing if first image
            if (currentImgIndex == 0) { return }

            // update running data list
            this.UPDATE_RUNNING_DATA();

            // load next quadrat
            this.SWAP_QUADRAT(this.runningData[currentImgIndex-1]);
            this.loadExistingImage(this.imgPathList[currentImgIndex-1]);
            
        },

        nextImage() {
            let currentImgIndex = this.imgPathList.indexOf(this.quadratData.imgSrc);

            // do nothing if last image
            if (currentImgIndex == (this.imgPathList.length - 1)) { return }

            // update running data list
            this.UPDATE_RUNNING_DATA();

            // load next quadrat
            if (!this.runningData[currentImgIndex+1]) { // make new one
                this.loadNewImage(this.imgPathList[currentImgIndex+1]);
            } else { // load existing one
                this.SWAP_QUADRAT(this.runningData[currentImgIndex+1]);
                this.loadExistingImage(this.imgPathList[currentImgIndex+1]);
            }
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


        // -----------------        
        // QUADRAT UTILITIES
        // -----------------

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
            if (this.inputStatus.nodes.length == 0) {
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


        // -----------
        // SAVE & LOAD
        // -----------

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


        // ---------------
        // OTHER UTILITIES
        // ---------------

        alert(alertString) {
            ipcRenderer.invoke('alert', alertString);
        },

    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style lang="scss" scoped>


</style>
