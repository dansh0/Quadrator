const fs = require('fs');

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

module.exports = {
    exportDataToCSV
};
