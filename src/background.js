'use strict'

import { app, protocol, BrowserWindow, ipcMain, dialog } from 'electron'
import { createProtocol } from 'vue-cli-plugin-electron-builder/lib'
import installExtension, { VUEJS_DEVTOOLS } from 'electron-devtools-installer'
const isDevelopment = process.env.NODE_ENV !== 'production'

// Scheme must be registered before the app is ready
protocol.registerSchemesAsPrivileged([
    { scheme: 'app', privileges: { secure: true, standard: true } },
    { scheme: 'file', privileges: { secure: true, standard: true, bypassCSP: true } }
])

async function createWindow() {
    // Create the browser window.
    const win = new BrowserWindow({
        width: 1500,
        height: 950,
        setBackgroundColor: '#111111',
        autoHideMenuBar: true,
        webPreferences: {
            
            // Use pluginOptions.nodeIntegration, leave this alone
            // See nklayman.github.io/vue-cli-plugin-electron-builder/guide/security.html#node-integration for more info
            nodeIntegration: process.env.ELECTRON_NODE_INTEGRATION,
            contextIsolation: !process.env.ELECTRON_NODE_INTEGRATION,
            // nodeIntegration: true,
            // contextIsolation: false,
            webSecurity: false
        }
    })

    if (process.env.WEBPACK_DEV_SERVER_URL) {
        // Load the url of the dev server if in development mode
        await win.loadURL(process.env.WEBPACK_DEV_SERVER_URL)
        if (!process.env.IS_TEST) win.webContents.openDevTools()
    } else {
        createProtocol('app')
        // Load the index.html when not in development
        win.loadURL('app://./index.html')
    }

    // Selects a file from native dialog on request by renderer process
    ipcMain.handle('openFile', async (event) => {
        
        // select file
        let filePath = await dialog.showOpenDialog(win, {properties: ['openFile', 'multiSelections']})

        return filePath.filePaths
    });

    // Selects a save file location from native dialog on request by renderer process
    ipcMain.handle('appendFile', async (event) => {
        
        // select file
        let filePath = await dialog.showSaveDialog(win, {title: "Append File", buttonLabel: "Append", filters: [{name: 'CSV', extensions: ['csv']},{name: 'TXT', extensions: ['txt']}]})

        return filePath
    });

    // Pops up an alert
    ipcMain.handle('alert', (event, alertString) => {
        
        // alert user
        dialog.showMessageBox(win, {message: alertString, type: 'error', title: 'Alert'})

    });

    // Pops up an question
    ipcMain.handle('question', async (event, questionInfo) => {
        
        // ask question
        let response = await dialog.showMessageBox(win, {
            message: questionInfo.question, 
            type: 'question', 
            title: questionInfo.title,
            buttons: questionInfo.buttons
        })

        return response

    });

    // Reloads the renderer, starting from scratch
    ipcMain.handle('reload', (event) => {
        win.webContents.reload();
    });
    
}

// Quit when all windows are closed.
app.on('window-all-closed', () => {
    // On macOS it is common for applications and their menu bar
    // to stay active until the user quits explicitly with Cmd + Q
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
})

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', async () => {
    if (isDevelopment && !process.env.IS_TEST) {
        // Install Vue Devtools
        try {
            await installExtension(VUEJS_DEVTOOLS)
        } catch (e) {
            console.error('Vue Devtools failed to install:', e.toString())
        }
    }
    createWindow()
})

// Exit cleanly on request from parent process in development mode.
if (isDevelopment) {
    if (process.platform === 'win32') {
        process.on('message', (data) => {
            if (data === 'graceful-exit') {
                app.quit()
            }
        })
    } else {
        process.on('SIGTERM', () => {
            app.quit()
        })
    }
}
