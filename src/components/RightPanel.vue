<template>
    <v-card id="card" :style="{'width':panelWidth}" color=tertiary height="100%" >
    <!-- <v-card min-width=400 color=tertiary width=400 height="100%" > -->
        <MenuButtons 
            ref="menuButtons"
            @load-new-image="handleLoadNewImage"
            @load-existing-image="handleLoadExistingImage"
            @init-new-quadrat-svg="handleInitNewQuadratSVG"
        />
        <v-text-field label="Quadrat Name" v-model="quadratData.name" class="px-5 pt-5 mt-0"></v-text-field>
<!--         <v-card-title  align="center" class="justify-center py-0">
            Select Species ID
        </v-card-title> -->
        <v-container v-if="this.buttons.length==0" class="d-flex justify-center">
            <v-btn x-large color=primary @click="handleSetButtons">Edit Buttons</v-btn>
        </v-container>
        <v-container v-else class="d-flex justify-center">
            <v-btn small color=primary @click="handleSetButtons">Edit Buttons</v-btn>
        </v-container>
        <v-btn-toggle multiple background-color=tertiary @change="updateSamples()" v-model="toggles">
            <v-container grid-list-md>
                <v-layout row wrap>
                    <v-flex v-for="button in this.buttons" :key="button.code">
                        <v-tooltip bottom>
                            <template v-slot:activator="{ on, attrs }">
                                <v-btn width=85px height=40px class="black--text sampleBtn" :color="selectedButtons.includes(button.code)?button.colorSelected:button.color" v-bind="attrs" v-on="on">{{ buttonLabel(button.code) }}</v-btn>
                            </template>
                            <span>{{ button.species }}<br/>{{ button.group1 }} - {{ button.group2 }}</span>
                        </v-tooltip>
                    </v-flex>
                </v-layout>
            </v-container>
        </v-btn-toggle>
        <v-container grid-list-md text-s-center>
        <v-row class="justify-center my-2">
            <v-btn large class="black--text mr-10" @click="prevSample()" color=primary :disabled="!isGeoDefined">Prev</v-btn>
            <v-btn large class="black--text" color=primary @click="nextSample()" :disabled="!isGeoDefined">Next</v-btn>
        </v-row>
        <v-card-text  align="center" class="justify-center">
            <!-- <v-spacer /> -->
            Point {{ inputStatus.sampleNumber + 1}} of {{ numOfSamples }}
        </v-card-text>
        <v-row class="justify-center">
            <v-switch  inset v-model="hotKeySwitch" @change="enableHotKeys()" label="Enable Hotkeys" />
        </v-row>
        </v-container>
            


            <!-- <v-row>
                <v-col cols=10 class="ml-5">
                    <v-select color=primary item-color=primary v-model="selectValue" outlined :items="selectValues" label="Filter By Category"></v-select>
                </v-col>
            </v-row> -->
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';
const setButtons = require('../utils/setButtons');
import { loadButtonsFromPath } from '../utils/buttonUtils';
import MenuButtons from './MenuButtons.vue';

export default {
    name: 'RightPanel',
    components: {
        MenuButtons
    },
    props: {
    },
    data: () => ({
        hotKeySwitch: false,
        toggles: []
        // selectValue: 'No Filter',
        // selectValues: [
        //     'No Filter',
        //     'Green',
        //     'Red'
        // ],
    }),
    computed: {
        ...mapState([
            'windowHelpers',
            'quadratSettings',
            'quadratData',
            'inputStatus',
            'buttons',
            'hotKeys'
        ]),
        selectedButtons: function() {
            let buttonPresses = [];

            this.toggles.forEach((tog) => {
                buttonPresses.push(this.buttonCodes[tog]);
            })
            return buttonPresses
        },
        panelWidth: function() {
            return this.windowHelpers.rightPanelWidth + 'px'
        },
        selectedSamples: function() {
            if (this.quadratData.samples && this.quadratData.samples[this.inputStatus.sampleNumber]) {
                return this.quadratData.samples[this.inputStatus.sampleNumber].codes
            } else {
                return []
            }
        },
        buttonCodes: function() {
            let codes = [];
            this.buttons.forEach(button => {
                codes.push(button.code)
            })
            return codes
        },
        numOfSamples: function() {
            return this.quadratSettings.numOfSampleRows * this.quadratSettings.numOfSampleCols
        },
        isGeoDefined: function() {
            if (!this.quadratData.samples) return false;
            return this.quadratData.samples.filter(sample => (!!sample.x && !!sample.y)).length > 0
        }
    },
    watch: {
        // 'toggles': function() {
        //     console.log(this.selectedButtons)
        // }, 
        'selectedSamples': function() {
            this.updateToggles();
        }
    },
    mounted() {
        this.enableHotKeys();
        this.loadButtonsOnStartup();
    },
    methods: {
        ...mapMutations([
            'UPDATE_RUNNING_DATA'
        ]),
        buttonLabel(button) {
            let buttIndex = this.buttonCodes.indexOf(button);
            let fullLabel;
            if (this.hotKeySwitch) {
                let hotKeyLabel = this.hotKeys[buttIndex];
                fullLabel = hotKeyLabel ? button + ' [' + hotKeyLabel + ']' : button;
            } else {
                fullLabel = button;
            }
            return fullLabel
        },
        nextSample() {
            if (this.inputStatus.sampleNumber + 1 == this.numOfSamples) {
                // finish quadrat
                console.log('Quadrat Complete');
            } else {
                this.inputStatus.sampleNumber += 1;
            }

            // update running data with data from last sample
            this.UPDATE_RUNNING_DATA();

            // update button selections
            this.updateToggles();

        },
        prevSample() {

            if (this.inputStatus.sampleNumber > 0) {
                this.inputStatus.sampleNumber -= 1;

                // update button selections
                this.updateToggles();

                // update running data with data from last sample
                this.UPDATE_RUNNING_DATA();

            }
            
        },
        enableHotKeys() {
            if (this.hotKeySwitch) {
                window.addEventListener("keydown", this.hotKeyFunc);
            } else {
                window.removeEventListener("keydown", this.hotKeyFunc);
            }
        },
        hotKeyFunc(event) {
            if (event.keyCode === 39 || event.keyCode === 13){
                this.nextSample();
            } else if (event.keyCode === 37 || event.keyCode == 8){
                this.prevSample();
            } else if (this.toggles && this.hotKeys.includes(event.key)) {
                let buttonIndex = this.hotKeys.indexOf(event.key);
                if (!this.toggles.includes(buttonIndex)) {
                    this.toggles.push(buttonIndex);
                } else {
                    this.toggles.splice(this.toggles.indexOf(buttonIndex),1);
                }
            } 
            // update data model
            this.updateSamples(); 
        },
        updateSamples() {
            // reset list without losing reference
            this.selectedSamples.length = 0;

            // add toggle to selectedSamples without affecting reference
            this.toggles.forEach(tog => {
                this.selectedSamples.push(this.buttonCodes[tog])
            })
        },
        updateToggles() {
            // reset toggles
            this.toggles = []

            // add selectedSamples to toggles
            this.selectedSamples.forEach(sample => {
                this.toggles.push(this.buttonCodes.indexOf(sample))
            })
        },
        alert(alertString) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.invoke('alert', alertString);
        },
        async handleSetButtons() {
            await setButtons(this.buttons, this.alert);
        },
        triggerSaveSession() {
            if (this.$refs.menuButtons) {
                this.$refs.menuButtons.saveSession();
            }
        },
        triggerLoadSessionFromFile() {
            if (this.$refs.menuButtons) {
                this.$refs.menuButtons.loadSession();
            }
        },
        async loadButtonsOnStartup() {
            const savedPath = localStorage.getItem('buttonsCSVPath');
            if (savedPath) {
                try {
                    await loadButtonsFromPath(savedPath, this.buttons);
                    console.log(`Successfully loaded buttons from saved path: ${savedPath}`);
                } catch (error) {
                    this.alert(`Failed to load button configuration from the saved path: ${savedPath}. The file may have been moved or deleted. Please select it again.`);
                    // Clear the invalid path from storage
                    localStorage.removeItem('buttonsCSVPath');
                }
            }
        },

        // Handle events from MenuButtons component
        handleLoadNewImage(filePath) {
            this.$emit('load-new-image', filePath);
        },

        handleLoadExistingImage(filePath) {
            this.$emit('load-existing-image', filePath);
        },

        handleInitNewQuadratSVG() {
            this.$emit('init-new-quadrat-svg');
        }
    }
}
</script>


<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

.v-btn {
    text-color: #000000;
}

.sampleBtn {
    font-size:  .8em !important;
    font-weight: bold;
}

/*#card {
    width: 400px;
}
*/
</style>
