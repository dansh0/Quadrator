const csv = require('csv-parser');
const fs = require('fs');

/**
 * Loads button configurations from a CSV file at a given path.
 * @param {string} filePath - The absolute path to the CSV file.
 * @param {Array} buttons - Reference to the buttons array to populate.
 * @returns {Promise<void>} - A promise that resolves when loading is complete or rejects on error.
 */
function loadButtonsFromPath(filePath, buttons) {
    return new Promise((resolve, reject) => {
        // Clear existing buttons to ensure a fresh start
        buttons.length = 0;
        
        const newButtons = [];
        
        const stream = fs.createReadStream(filePath);

        // Attach an error handler directly to the source stream.
        // This will catch file-system errors, such as ENOENT (file not found).
        stream.on('error', (error) => {
            console.error('Error reading file stream:', error);
            reject(error);
        });
        
        // Now, pipe the stream and handle other events.
        stream
            .pipe(csv())
            .on('data', (data) => newButtons.push(data))
            .on('end', () => {
                // Replace the content of the original array without changing the reference
                buttons.splice(0, buttons.length, ...newButtons);
                console.log('CSV file successfully processed from', filePath);
                resolve();
            })
            .on('error', (error) => {
                // This handler will now catch parsing errors from csv-parser.
                console.error('Error processing CSV:', error);
                reject(error);
            });
    });
}

module.exports = { loadButtonsFromPath }; 