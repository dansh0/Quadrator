const path = require('path')
import { range } from 'd3';
import Polygon from '../assets/poly-split-js-master/src/Polygon.js';
import Vector from '../assets/poly-split-js-master/src/Vector.js';
// import Line from '../assets/poly-split-js-master/src/Line.js';
const { ipcRenderer } = require('electron');

class Quadrat {

    constructor(numOfSamples, imgSrc) {
        this.numOfSamples = numOfSamples;
        this.imgSrc = imgSrc;
        this.samples = [];
        this.name = path.parse(imgSrc).name
        this.cutLines = []
        this.initSamples();
    }

    initSamples() {
        for (let iSample=0; iSample<this.numOfSamples; iSample++) {
            this.samples.push(new Sample())
        }
    }

    resetSamples() {
        this.samples.length = 0
        this.cutLines = []
        this.polygons = []
        this.initSamples();
    }

    randomSamplePointsRect(nodes, numOfSampleRows, numOfSampleCols) {
        let edgesNodes = []
        nodes.forEach((node, index) => {
            if (index != nodes.length - 1) {
                let line = [node, nodes[index + 1]];
                let edgeNodes = [];
                let nodeCount = index%2==0 ? numOfSampleRows : numOfSampleCols;
                let stepX = (line[1].x - line[0].x) / (nodeCount)
                let edgeNodesX = range(line[0].x, line[1].x + stepX*0.5, stepX )
                let stepY = (line[1].y - line[0].y) / (nodeCount)
                let edgeNodesY = range(line[0].y, line[1].y + stepY*0.5, stepY )
                edgeNodesX.forEach((edgeNodeX, index) => {
                    edgeNodes.push({x: edgeNodeX, y: edgeNodesY[index]})
                })
                edgesNodes.push(edgeNodes)
            }
        })

        // make points
        let samplePoints = []

        edgesNodes[1].forEach((edgeNodeY, yIndex) => {
            if (yIndex != edgesNodes[1].length - 1) {
                edgesNodes[0].forEach((edgeNodeX, xIndex) => {
                    if (xIndex != edgesNodes[0].length - 1) {

                        // Make an H bridge
                        let xRand = Math.random();
                        let xSamplePos = (xRand + xIndex) / numOfSampleRows;
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
                        let ySamplePos = (yRand + yIndex) / numOfSampleCols;

                        let sampleNumber = yIndex * numOfSampleRows + xIndex

                        this.samples[sampleNumber].x = lineNodeX1.x + ySamplePos * (lineNodeX2.x - lineNodeX1.x)
                        this.samples[sampleNumber].y = lineNodeX1.y + ySamplePos * (lineNodeX2.y - lineNodeX1.y)
                        this.samples[sampleNumber].sampleNumber = sampleNumber
                        
                    }
                })
            }
        })
    }

    randomSamplePointsPoly(nodes) {

        let multiplier = 1000

        // create polygon to cut
        this.polygons = new Array();
        this.polygons.push(new Polygon());
        nodes.forEach((node, iter) => {
            if (iter != nodes.length-1) {
                // last is same as first, push all others
                this.polygons[0].push_back(new Vector(node.x*multiplier, node.y*multiplier, 0))
            }
        })

        let totalArea = this.polygons[0].countSquare()
        // let cutArea = totalArea / 3
        let cutArea = totalArea / this.numOfSamples

        // cut for each sample
        let cutRet;
        for (let iSample=0; iSample<this.numOfSamples-1; iSample++) {
            cutRet = this.polygons[iSample].split(cutArea)
            if (cutRet.value == 1) {
                this.cutLines.push([{x:cutRet.cutLine.start.x/multiplier, y:cutRet.cutLine.start.y/multiplier}, {x:cutRet.cutLine.end.x/multiplier, y:cutRet.cutLine.end.y/multiplier}])
                let size1 = cutRet.poly1.countSquare()
                let size2 = cutRet.poly2.countSquare()
                if (size1 < size2) {
                    this.polygons[iSample] = cutRet.poly1
                    this.polygons.push(cutRet.poly2)
                } else {
                    this.polygons[iSample] = cutRet.poly2
                    this.polygons.push(cutRet.poly1)
                }
            } else {
                console.error('Cut Failed')
                ipcRenderer.invoke('alert', "Could not complete polygon processing. Try loading image again");
                return
            }
        }

        // assign a point to each polygon
        this.polygons.forEach((poly, pCount) => {

            // get bbox
            poly.bbox = this._getPolygonBBox(poly);
           
            // test if a random point is inside the poly, repeat randomizer if not
            let inside = false
            let failTry = 0
            let xPoint, yPoint;
            while (!inside) {
                if (failTry > 999) { //max 999 guesses, usually on takes a few max
                    console.error('Could not find a point for sample');
                    ipcRenderer.invoke('alert', "Could not complete polygon processing. Try loading image again");
                    return
                }
                xPoint = poly.bbox.min.x + Math.random() * (poly.bbox.max.x - poly.bbox.min.x);
                yPoint = poly.bbox.min.y + Math.random() * (poly.bbox.max.y - poly.bbox.min.y);
                inside = poly.isPointInside(new Vector(xPoint, yPoint, 0));
                failTry++;
            }

            // assign random point to sample pool
            this.samples[pCount].x = xPoint / multiplier;
            this.samples[pCount].y = yPoint / multiplier;
            this.samples[pCount].sampleNumber = pCount;

        })

    }

    _getPolygonBBox(polygon) {
        let bbox = {
            min: {x: 0, y:0, z:0},
            max: {x: Infinity, y: Infinity, z: Infinity}
        }

        polygon.poly.arrVector.forEach(vect => {
            if (vect.x > bbox.min.x) { bbox.min.x = vect.x }
            if (vect.y > bbox.min.y) { bbox.min.y = vect.y }
            if (vect.z > bbox.min.z) { bbox.min.z = vect.z }
            if (vect.x < bbox.max.x) { bbox.max.x = vect.x }
            if (vect.y < bbox.max.y) { bbox.max.y = vect.y }
            if (vect.z < bbox.max.z) { bbox.max.z = vect.z }
        })

        return bbox;
    }

    toCSV(speciesList) {

        // get date
        let date = new Date();
        let dateString = date.toString();

        // get code output
        let codes = {}
        this.samples.forEach(sample => {
            sample.codes.forEach(code => {
                if (codes[code]) {
                    codes[code].count += 1;
                } else {
                    // find species name
                    let codeIndex = speciesList.map(spec => spec.code).indexOf(code)
                    let codeSpecies = speciesList[codeIndex].species;
                    let codeGroup = speciesList[codeIndex].group1 + ' - ' + speciesList[codeIndex].group2;
                    // init at count of 1
                    codes[code] = {count: 1, species: codeSpecies, group: codeGroup}
                }
            })
        })

        let appendOut = ""

        Object.keys(codes).forEach(code => {

            // percent coverage
            let coverage = (codes[code].count / this.numOfSamples) * 100

            // make array of line elements
            let line = [this.name, this.imgSrc, dateString, code, codes[code].species, codes[code].group, codes[code].count, coverage]
            
            // make csv line
            let lineOut = ""
            line.forEach(item => {
                lineOut += item + ','
            })
            lineOut += '\n'

            appendOut += lineOut
        })

        
        // combine lines

        return appendOut


    }
}

class Sample {

    constructor() {
        this.sampleNumber = undefined;
        this.x = undefined;
        this.y = undefined;
        this.codes = [];
    }

}

export { Quadrat }