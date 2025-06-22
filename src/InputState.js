class InputState {

    constructor() {
        this.sampleNumber = 0;
        this.nodes = [];
        this.edgesNodes = [];
        this.loadedIteration = 0;
    }

    /**
     * Creates an InputState instance from saved JSON data
     * @param {Object} savedData - The saved input state data object
     * @returns {InputState} A new InputState instance with the saved data
     */
    static inputStateFromSavedData(savedData) {
        const inputState = new InputState();
        inputState.sampleNumber = savedData.sampleNumber || 0;
        inputState.nodes = savedData.nodes || [];
        inputState.edgesNodes = savedData.edgesNodes || [];
        inputState.loadedIteration = savedData.loadedIteration || 0;
        return inputState;
    }
}

export { InputState }