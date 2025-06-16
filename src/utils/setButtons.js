const { ipcRenderer } = require('electron');
const csv = require('csv-parser');
const fs = require('fs');

/**
 * Utility function to set buttons from a CSV file
 * @param {Array} buttons - Reference to the buttons array to update
 * @param {Function} alert - Function to show alerts to the user
 * @returns {Promise<void>}
 */
async function setButtons(buttons, alert) {
    // Request CSV file selection
    let filePath = await ipcRenderer.invoke('openFile', {
        filters: [
            { name: 'CSV Files', extensions: ['csv'] }
        ]
    });
    
    // If no file selected, return
    if (!filePath || filePath.length === 0) return;
    
    // Clear existing buttons
    buttons.length = 0;
    
    // Read and process the CSV file
    fs.createReadStream(filePath[0])
        .pipe(csv())
        .on('data', (data) => buttons.push(data))
        .on('end', () => {
            console.log('CSV file successfully processed');
        })
        .on('error', (error) => {
            console.error('Error processing CSV:', error);
            alert('Error processing CSV file. Please try again.');
        });
}

module.exports = setButtons;
