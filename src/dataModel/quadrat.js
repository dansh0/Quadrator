class Quadrat {

    constructor(numOfSamples, imgSrc) {
        this.numOfSamples = numOfSamples;
        this.imgSrc = imgSrc;
        this.samples = [];

        this.initSamples();
    }

    initSamples() {
        for (let iSample=0; iSample<this.numOfSamples; iSample++) {
            this.samples.push({})
        }
    }
}

export { Quadrat }