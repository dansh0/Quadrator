import fs from 'fs';
import { ipcRenderer } from 'electron';

/**
 * Export data to CSV file
 * @param {string} filePath - Path to save the CSV file
 * @param {Array} runningData - Array of quadrat data to export
 * @param {Array} buttons - Button definitions for CSV headers
 * @returns {Promise<void>} - Rejects if the file cannot be written
 */
async function exportDataToCSV(filePath, runningData, buttons) {
    // build csv text
    let dataOutput = ""
    runningData.forEach(image => {
        // runningData can contain gaps if images were skipped
        if (image && image.quadratData) {
            dataOutput += image.quadratData.toCSV(buttons);
        }
    })

    if (fs.existsSync(filePath)) {
        await fs.promises.appendFile(filePath, dataOutput);
    } else {
        let outputWithHeader = "Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %\n" + dataOutput;
        await fs.promises.writeFile(filePath, outputWithHeader);
    }
    console.log('Data Exported!');
}

/**
 * Full interactive export flow: capture the active quadrat, ask for a target
 * file, then write/append the CSV. Callable from any component.
 * @param {object} store - The Vuex store instance.
 * @returns {Promise<boolean>} true if exported, false if the dialog was cancelled.
 */
async function exportDataInteractive(store) {
    // make sure the active quadrat's latest tags are captured
    store.commit('UPDATE_RUNNING_DATA');

    const filePath = await ipcRenderer.invoke('appendFile');
    if (!filePath || !filePath.filePath) { return false; }

    await exportDataToCSV(filePath.filePath, store.state.runningData, store.state.buttons);
    return true;
}

export { exportDataToCSV, exportDataInteractive };
