const { ipcRenderer } = require('electron');
const { loadButtonsFromPath } = require('./buttonUtils');

/**
 * Opens a dialog for the user to select a CSV file,
 * then loads the buttons and saves the path to localStorage.
 * @param {Array} buttons - Reference to the buttons array to update.
 * @param {Function} alert - Function to show alerts to the user.
 * @returns {Promise<void>}
 */
async function setButtons(buttons, alert) {
    // Request CSV file selection
    let filePaths = await ipcRenderer.invoke('openFile', {
        filters: [
            { name: 'CSV Files', extensions: ['csv'] }
        ],
        properties: ['openFile']
    });

    // If no file selected, return
    if (!filePaths || filePaths.length === 0) return;

    const filePath = filePaths[0];

    try {
        await loadButtonsFromPath(filePath, buttons);
        // On success, save the path to localStorage for persistence
        localStorage.setItem('buttonsCSVPath', filePath);
    } catch (error) {
        alert('Error processing CSV file. Please check the file and try again.');
        // If loading fails, remove any previously stored path
        localStorage.removeItem('buttonsCSVPath');
    }
}

module.exports = setButtons;
