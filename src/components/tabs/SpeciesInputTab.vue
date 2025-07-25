<template>
    <v-container fluid class="pa-0 pt-4">
        <v-container grid-list-md v-if="buttons.length === 0" class="pa-0">
            <v-row class="justify-center my-2">
                <v-alert v-if="buttons.length === 0" type="info" dense outlined class="ma-4">
                    No buttons loaded. Please load buttons from a CSV file.
                </v-alert>
            </v-row>            
            <v-row class="justify-center my-2">
                <v-btn large color="primary" class="black--text" @click="downloadTemplate">Download Template</v-btn>
            </v-row>
            <v-row class="justify-center my-2">
                <v-btn large color="primary" class="black--text" @click="handleSetButtons">Edit Buttons</v-btn>
            </v-row>
        </v-container>
        <!-- Button grid / toggles -->
        <v-btn-toggle multiple background-color="tertiary" @change="updateSamples" v-model="toggles">
            <v-container grid-list-md class="pa-2">
                <v-layout row wrap>
                    <v-flex v-for="button in buttons" :key="button.code">
                        <v-tooltip bottom>
                            <template v-slot:activator="{ on, attrs }">
                                <v-btn width="85px" height="40px" class="black--text sampleBtn"
                                    :color="selectedButtons.includes(button.code) ? button.colorSelected : button.color"
                                    v-bind="attrs" v-on="on">
                                    {{ buttonLabel(button.code) }}
                                </v-btn>
                            </template>
                            <span>{{ button.species }}<br />{{ button.group1 }} - {{ button.group2 }}</span>
                        </v-tooltip>
                    </v-flex>
                </v-layout>
            </v-container>
        </v-btn-toggle>

        <!-- Navigation & Hotkeys -->
        <v-container grid-list-md text-s-center>
            <v-row class="justify-center my-2">
                <v-btn large class="black--text mr-10" @click="prevSample" color="primary"
                    :disabled="!isGeoDefined">Prev</v-btn>
                <v-btn large class="black--text" color="primary" @click="nextSample"
                    :disabled="!isGeoDefined">Next</v-btn>
            </v-row>
            <v-card-text align="center" class="justify-center my-2 pa-0">
                Point {{ inputStatus.sampleNumber + 1 }} of {{ numOfSamples }}
            </v-card-text>
            <v-container v-if="buttons.length > 0" class="d-flex justify-center my-2 pa-0">
                <v-btn small color="primary" class="black--text" @click="handleSetButtons">Edit Buttons</v-btn>
            </v-container>
            <v-row class="justify-center my-2 pa-0">
                <v-switch inset v-model="hotKeySwitch" @change="enableHotKeys" label="Enable Hotkeys" />
            </v-row>
        </v-container>
    </v-container>
</template>

<script>
/* global __static */
import { mapState, mapMutations } from 'vuex';
const setButtons = require('../../utils/setButtons');
import { loadButtonsFromPath } from '../../utils/buttonUtils';
import { ipcRenderer } from 'electron';
import fs from 'fs';
import path from 'path';

export default {
    name: 'SpeciesInputTab',
    data: () => ({
        hotKeySwitch: localStorage.getItem('hotKeySwitch') !== 'false' || false,
        toggles: []
    }),
    computed: {
        ...mapState(['quadratSettings', 'quadratData', 'inputStatus', 'buttons', 'hotKeys']),
        selectedButtons() {
            return this.toggles.map(tog => this.buttonCodes[tog]);
        },
        buttonCodes() {
            return this.buttons.map(button => button.code);
        },
        numOfSamples() {
            return this.quadratSettings.numOfSampleRows * this.quadratSettings.numOfSampleCols;
        },
        isGeoDefined() {
            if (!this.quadratData.samples) return false;
            return this.quadratData.samples.filter(sample => !!sample.x && !!sample.y).length > 0;
        },
        selectedSamples() {
            if (this.quadratData.samples && this.quadratData.samples[this.inputStatus.sampleNumber]) {
                return this.quadratData.samples[this.inputStatus.sampleNumber].codes;
            }
            return [];
        }
    },
    watch: {
        selectedSamples() {
            this.updateToggles();
        }
    },
    mounted() {
        this.enableHotKeys();
        this.loadButtonsOnStartup();
        this.updateToggles();
    },
    methods: {
        ...mapMutations(['UPDATE_RUNNING_DATA']),
        buttonLabel(button) {
            const idx = this.buttonCodes.indexOf(button);
            if (this.hotKeySwitch) {
                const hotKeyLabel = this.hotKeys[idx];
                return hotKeyLabel ? `${button} [${hotKeyLabel}]` : button;
            }
            return button;
        },
        nextSample() {
            if (this.inputStatus.sampleNumber + 1 === this.numOfSamples) {
                console.log('Quadrat Complete');
            } else {
                this.inputStatus.sampleNumber += 1;
            }
            this.UPDATE_RUNNING_DATA();
            this.updateToggles();
        },
        prevSample() {
            if (this.inputStatus.sampleNumber > 0) {
                this.inputStatus.sampleNumber -= 1;
                this.updateToggles();
                this.UPDATE_RUNNING_DATA();
            }
        },
        enableHotKeys() {
            if (this.hotKeySwitch) {
                window.addEventListener('keydown', this.hotKeyFunc);
            } else {
                window.removeEventListener('keydown', this.hotKeyFunc);
            }
            localStorage.setItem('hotKeySwitch', this.hotKeySwitch);
        },
        hotKeyFunc(event) {
            if (event.keyCode === 39 || event.keyCode === 13) {
                this.nextSample();
            } else if (event.keyCode === 37 || event.keyCode === 8) {
                this.prevSample();
            } else if (
                this.toggles &&
                this.hotKeys.includes(event.key) &&
                !event.ctrlKey &&
                !event.shiftKey
            ) {
                const buttonIndex = this.hotKeys.indexOf(event.key);
                if (!this.toggles.includes(buttonIndex)) {
                    this.toggles.push(buttonIndex);
                } else {
                    this.toggles.splice(this.toggles.indexOf(buttonIndex), 1);
                }
            }
            this.updateSamples();
        },
        updateSamples() {
            // reset list without losing reference
            const selected = this.selectedSamples;
            selected.length = 0;
            this.toggles.forEach(tog => {
                selected.push(this.buttonCodes[tog]);
            });
        },
        updateToggles() {
            this.toggles = [];
            this.selectedSamples.forEach(sample => {
                this.toggles.push(this.buttonCodes.indexOf(sample));
            });
        },
        alert(alertString) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.invoke('alert', alertString);
        },
        async handleSetButtons() {
            await setButtons(this.buttons, this.alert);
        },
        async loadButtonsOnStartup() {
            const savedPath = localStorage.getItem('buttonsCSVPath');
            if (savedPath) {
                try {
                    await loadButtonsFromPath(savedPath, this.buttons);
                    console.log(`Successfully loaded buttons from saved path: ${savedPath}`);
                } catch (error) {
                    this.alert(
                        `Failed to load button configuration from the saved path: ${savedPath}. The file may have been moved or deleted. Please select it again.`
                    );
                    localStorage.removeItem('buttonsCSVPath');
                }
            }
        },
        async downloadTemplate() {
            try {
                // Resolve the path to the bundled template file.
                // In development, this points to the src folder; in production `__static` is provided by electron-builder.
                const TEMPLATE_RELATIVE = path.join('assets', 'buttons_template.csv');
                const templatePath = process.env.NODE_ENV === 'production'
                    ? path.join(__static, TEMPLATE_RELATIVE) // TEST!
                    : path.join(__dirname, '../../../../../../src/assets', 'buttons_template.csv');
                
                // Ask the user where to save the file, pre-filling the name as buttons.csv
                const filePath = await ipcRenderer.invoke('saveFile', {
                    title: 'Save Buttons Template',
                    defaultPath: 'buttons.csv',
                    buttonLabel: 'Save',
                    filters: [{ name: 'CSV', extensions: ['csv'] }]
                });

                // If the user cancelled the dialog, filePath will be null
                if (!filePath) return;

                // Copy the template file to the chosen destination
                fs.copyFile(templatePath, filePath, (err) => {
                    if (err) {
                        this.alert(`Failed to save template: ${err.message}`);
                    } else {
                        this.alert('Template saved successfully.');
                    }
                });
            } catch (error) {
                this.alert(`Unexpected error: ${error.message}`);
            }
        }
    }
};
</script>

<style scoped>
.sampleBtn {
    font-size: 0.8em !important;
    font-weight: bold;
}
</style>