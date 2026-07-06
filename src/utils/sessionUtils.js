import { promises as fs } from 'fs';
import { ipcRenderer } from 'electron';

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

/**
 * Full interactive save flow: ask for a target file, then write the session.
 * Callable from anywhere with store access (menu button, Ctrl+S, ...).
 * @param {object} store - The Vuex store instance.
 * @returns {Promise<boolean>} true if saved, false if the dialog was cancelled.
 */
async function saveSessionInteractive(store) {
    const filePath = await ipcRenderer.invoke('saveFile', {
        filters: [{ name: 'JSON Files', extensions: ['json'] }]
    });
    if (!filePath) { return false; }

    // make sure the active quadrat is captured before serializing
    store.commit('UPDATE_RUNNING_DATA');
    await saveSessionToFile(filePath, getSessionState(store));
    return true;
}

/**
 * Full interactive load flow: confirm overwrite, pick a file, restore it.
 * The caller is responsible for reloading the active image afterwards.
 * @param {object} store - The Vuex store instance.
 * @returns {Promise<boolean>} true if a session was restored.
 */
async function loadSessionInteractive(store) {
    if (store.state.runningData.length > 0) {
        // only warn if there is actually data to lose
        const confirmation = await ipcRenderer.invoke('question', {
            title: 'Confirm Load Session',
            question: 'Loading a session will overwrite your current progress. Are you sure you want to continue?',
            buttons: ['No', 'Yes']
        });
        if (!confirmation.response) { return false; }
    }

    const filePaths = await ipcRenderer.invoke('openFile', {
        filters: [{ name: 'JSON Files', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (!filePaths || filePaths.length === 0) { return false; }

    const sessionState = await loadSessionFromFile(filePaths[0]);
    store.commit('RESTORE_SESSION', sessionState);
    return true;
}

export {
    getSessionState,
    saveSessionToFile,
    loadSessionFromFile,
    saveSessionInteractive,
    loadSessionInteractive
}; 