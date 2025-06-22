<template>
    <v-container class="pa-2">
        <v-row class="justify-center">
            <v-tooltip bottom v-for="button in menuButtons" :key="button.btnText">
                <template v-slot:activator="{ on, attrs }">
                    <v-btn color=primary small @click="button.btnFunc" v-bind="attrs" v-on="on" class="ma-1" style="width:120px">{{ button.btnText }}</v-btn>
                </template>
                <span>{{ button.btnTooltip }}</span>
            </v-tooltip>
        </v-row>
    </v-container>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
const { ipcRenderer } = require('electron');
import { exportDataToCSV } from '../utils/exportUtils';
import setButtons from '../utils/setButtons';
import { getSessionState, saveSessionToFile, loadSessionFromFile } from '../utils/sessionUtils';

export default {
    name: 'MenuButtons',
    computed: {
        ...mapState([
            'imgPathList',
            'quadratData',
            'runningData',
            'buttons',
            'inputStatus'
        ]),
        menuButtons() {
            return [
                {
                    btnText: 'Load Image',
                    btnFunc: this.selectImage,
                    btnTooltip: 'Load one or multiple images to add to this image group'
                },
                {
                    btnText: 'Reset Nodes',
                    btnFunc: this.resetNodes,
                    btnTooltip: 'Reset boundary polygon definition and data nodes for this quadrat'
                },
                {
                    btnText: 'Start Over',
                    btnFunc: this.fullReset,
                    btnTooltip: 'Delete all unsaved data and restart'
                },
                {
                    btnText: 'Save Session',
                    btnFunc: this.saveSession,
                    btnTooltip: 'Save the current session to a file'
                },
                {
                    btnText: 'Load Session',
                    btnFunc: this.loadSession,
                    btnTooltip: 'Load a previously saved session from a file'
                },
                {
                    btnText: 'Export Data',
                    btnFunc: this.exportData,
                    btnTooltip: 'Save all entered data for all loaded quadrats as appended rows of a CSV file'
                },
                {
                    btnText: 'Prev. Image',
                    btnFunc: this.previousImage,
                    btnTooltip: 'Move back to the previous image to analyze'
                },
                {
                    btnText: 'Next Image',
                    btnFunc: this.nextImage,
                    btnTooltip: 'Move forward to the next image to analyze'
                },
                //{
                //    btnText: 'Export QA',
                //    btnFunc: this.exportQAReport,
                //    btnTooltip: 'Export a report of the codes chosen for this quadrat'
                //}
            ];
        }
    },
    methods: {
        ...mapMutations([
            'CHANGE_IMG_SRC',
            'NEW_QUADRAT',
            'SWAP_QUADRAT',
            'UPDATE_RUNNING_DATA',
            'RESTORE_SESSION'
        ]),

        async saveSession() {
            try {
                const filePath = await ipcRenderer.invoke('saveFile', {
                    filters: [{ name: 'JSON Files', extensions: ['json'] }]
                });

                if (filePath) {
                    // update running data list
                    this.UPDATE_RUNNING_DATA();

                    const sessionState = getSessionState(this.$store);
                    await saveSessionToFile(filePath, sessionState);
                }
            } catch (error) {
                console.error('Failed to save session:', error);
                this.alert(`Error saving session: ${error.message}`);
            }
        },

        async loadSession() {
            if (this.runningData.length > 0) {
                // only warn if there is actually data saved
                const questionInfo = {
                    title: "Confirm Load Session",
                    question: "Loading a session will overwrite your current progress. Are you sure you want to continue?",
                    buttons: ["No", "Yes"]
                };
                const confirmation = await ipcRenderer.invoke('question', questionInfo);
                if (!confirmation.response) { return; }
            }

            try {
                const filePaths = await ipcRenderer.invoke('openFile', {
                    filters: [{ name: 'JSON Files', extensions: ['json'] }],
                    properties: ['openFile']
                });

                if (filePaths && filePaths.length > 0) {
                    const filePath = filePaths[0];
                    const sessionState = await loadSessionFromFile(filePath);
                    this.RESTORE_SESSION(sessionState);
                    
                    this.$nextTick(() => {
                        this.$emit('load-existing-image', this.$store.state.imgSrc);
                    });
                }
            } catch (error) {
                console.error('Failed to load session:', error);
                this.alert(`Error loading session: ${error.message}`);
            }
        },

        async fullReset() {
            let questionInfo = {
                title: "Confirm Full Reset",
                question: "Are you sure you want to delete all unsaved progress and start over?",
                buttons: ["No", "Yes"]
            };
            let confirmation = await ipcRenderer.invoke('question', questionInfo);
            if (!confirmation.response) { return }

            // Clear the local storage
            localStorage.removeItem('lastSession');
                
            ipcRenderer.invoke('reload')
        },

        async selectImage() {
            // update running data list
            this.UPDATE_RUNNING_DATA();

            let filePaths = await ipcRenderer.invoke('openFile')
            
            // if canceled, then quick action
            if (!filePaths || filePaths.length == 0) { return }

            // set store global
            filePaths.forEach(path => {
                this.imgPathList.push(path);
            })

            // load image if one is defined
            console.log("File Paths:", filePaths)
            this.$emit('load-new-image', filePaths[0]);
        },

        async resetNodes() {
            if (this.inputStatus.nodes.length > 0) {
                let questionInfo = {
                    title: "Confirm Node Reset",
                    question: "Are you sure you want to reset your node selections?",
                    buttons: ["No", "Yes"]
                };
                let confirmation = await ipcRenderer.invoke('question', questionInfo);
                if (!confirmation.response) { return }
            }

            // if all good then init new one
            this.$emit('init-new-quadrat-svg');
        },

        async exportData() {
            // update running data list
            this.UPDATE_RUNNING_DATA();

            let filePath = await ipcRenderer.invoke('appendFile');

            // quit if file select was canceled
            if (!filePath.filePath) { return }

            console.log("Export Path:", filePath.filePath)
            
            await exportDataToCSV(filePath.filePath, this.runningData, this.buttons);
        },

        async exportQAReport() {
            let filePath = await ipcRenderer.invoke('saveFile', {
                filters: [{ name: 'CSV Files', extensions: ['csv'] }]
            });
            
            if (!filePath) { return }
          
            const qaData = this.quadratData.samples.map(sample => {
                return {
                    sampleNumber: sample.sampleNumber,
                    codes: sample.codes
                }
            })

            console.log(qaData)
        },

        previousImage() {
            let currentImgIndex = this.imgPathList.indexOf(this.quadratData.imgSrc);

            // do nothing if first image
            if (currentImgIndex == 0) { return }

            // update running data list
            this.UPDATE_RUNNING_DATA();

            // load next quadrat
            this.SWAP_QUADRAT(this.runningData[currentImgIndex-1]);
            this.$emit('load-existing-image', this.imgPathList[currentImgIndex-1]);
        },

        nextImage() {
            let currentImgIndex = this.imgPathList.indexOf(this.quadratData.imgSrc);

            // do nothing if last image
            if (currentImgIndex == (this.imgPathList.length - 1)) { return }

            // update running data list
            this.UPDATE_RUNNING_DATA();

            // load next quadrat
            if (!this.runningData[currentImgIndex+1]) { // make new one
                this.$emit('load-new-image', this.imgPathList[currentImgIndex+1]);
            } else { // load existing one
                this.SWAP_QUADRAT(this.runningData[currentImgIndex+1]);
                this.$emit('load-existing-image', this.imgPathList[currentImgIndex+1]);
            }
        },

        async setButtons() {
            await setButtons(this.buttons, this.alert);
        },

        alert(alertString) {
            ipcRenderer.invoke('alert', alertString);
        }
    }
}
</script>

<style scoped>
/* Add any specific styling for the menu buttons */
</style> 