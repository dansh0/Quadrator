const fs = require('fs');

/**
 * Export data to CSV file
 * @param {string} filePath - Path to save the CSV file
 * @param {Array} runningData - Array of quadrat data to export
 * @param {Array} buttons - Button definitions for CSV headers
 * @returns {Promise<void>}
 */
async function exportDataToCSV(filePath, runningData, buttons) {
    // build csv text
    let dataOutput = ""
    runningData.forEach(image => {
        dataOutput += image.quadratData.toCSV(buttons);
    })
    
    if (fs.existsSync(filePath)) {
        fs.appendFile(filePath, dataOutput, function (err) {
            if (err) {
                console.error("Append/Save Failed. Make sure your file is not open in other programs");
                throw err;
            }
            console.log('Data Exported!');
        });
    } else {
        let outputWithHeader = "Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %\n" + dataOutput; 
        fs.writeFile(filePath, outputWithHeader, function (err) {
            if (err) throw err;
            console.log('Data Exported!');
        });
    }
}

module.exports = {
    exportDataToCSV
}; 