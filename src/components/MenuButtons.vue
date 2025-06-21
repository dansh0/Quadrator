<template>
    <v-container class="pa-2">
        <v-row class="justify-center">
            <v-tooltip bottom v-for="button in menuButtons" :key="button.btnText">
                <template v-slot:activator="{ on, attrs }">
                    <v-btn color=primary small @click="button.btnFunc" v-bind="attrs" v-on="on" class="ma-1">{{ button.btnText }}</v-btn>
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
                    btnText: 'Start Over',
                    btnFunc: this.fullReset,
                    btnTooltip: 'Delete all unsaved data and restart'
                },
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
                }
            ];
        }
    },
    methods: {
        ...mapMutations([
            'CHANGE_IMG_SRC',
            'NEW_QUADRAT',
            'SWAP_QUADRAT',
            'UPDATE_RUNNING_DATA'
        ]),

        async fullReset() {
            let questionInfo = {
                title: "Confirm Full Reset",
                question: "Are you sure you want to delete all unsaved progress and start over?",
                buttons: ["No", "Yes"]
            };
            let confirmation = await ipcRenderer.invoke('question', questionInfo);
            if (!confirmation.response) { return }
                
            ipcRenderer.invoke('reload')
        },

        async selectImage() {
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