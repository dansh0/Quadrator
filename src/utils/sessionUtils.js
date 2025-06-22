import { promises as fs } from 'fs';
import { Quadrat } from '../dataModel/quadrat.js';
import { InputState } from '../InputState.js';

/**
 * Gathers the current session state from the Vuex store.
 * @param {object} store - The Vuex store instance.
 * @returns {object} A serializable session state object.
 */
function getSessionState(store) {
    return {
        imgPathList: store.state.imgPathList,
        runningData: store.state.runningData,
        currentImgSrc: store.state.imgSrc
    };
}

/**
 * Saves the session state to a JSON file.
 * @param {string} filePath - The path to save the file to.
 * @param {object} sessionState - The session state object to save.
 * @returns {Promise<void>}
 */
async function saveSessionToFile(filePath, sessionState) {
    const jsonString = JSON.stringify(sessionState, null, 2); // Using 2 spaces for pretty printing
    await fs.writeFile(filePath, jsonString);
}

/**
 * Loads and validates session data from a JSON file.
 * @param {string} filePath - The path of the file to load.
 * @returns {Promise<object>} The validated session state object.
 */
async function loadSessionFromFile(filePath) {
    const jsonString = await fs.readFile(filePath, 'utf8');
    const sessionState = JSON.parse(jsonString);

    // Validate the structure of the saved session data
    if (!sessionState || !sessionState.imgPathList || !sessionState.runningData || !sessionState.currentImgSrc) {
        throw new Error("Invalid or corrupt session file.");
    }

    // Note: Object reconstruction is now handled in the Vuex store's RESTORE_SESSION mutation
    // This ensures proper class instances are created with all methods intact

    return sessionState;
}

export { getSessionState, saveSessionToFile, loadSessionFromFile }; 