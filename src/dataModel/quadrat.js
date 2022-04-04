class Quadrat {

    constructor(numOfSamples, imgSrc) {
        this.numOfSamples = numOfSamples;
        this.imgSrc = imgSrc;
        this.samples = [];

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