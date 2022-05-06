const path = require('path')

class Quadrat {

    constructor(numOfSamples, imgSrc) {
        this.numOfSamples = numOfSamples;
        this.imgSrc = imgSrc;
        this.samples = [];
        this.name = path.parse(imgSrc).name
        this.initSamples();
    }

    initSamples() {
        for (let iSample=0; iSample<this.numOfSamples; iSample++) {
            this.samples.push(new Sample())
        }
    }

    resetSamples() {
        this.samples.length = 0
        this.initSamples();
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
                    console.log(codeGroup)
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