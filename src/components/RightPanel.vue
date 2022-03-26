<template>
    <v-card id="card" :style="{'width':panelWidth}" color=tertiary height="100%" >
    <!-- <v-card min-width=400 color=tertiary width=400 height="100%" > -->
        <v-card-title  align="center" class="justify-center">
            <!-- <v-spacer /> -->
            Select Species ID
        </v-card-title>
        <v-btn-toggle multiple background-color=tertiary v-model="toggles">
            <v-container grid-list-md text-s-center>
                <v-layout row wrap>
                    <v-flex v-for="button in this.buttons" :key="button">
                        <v-btn width=85px class="black--text" :color="selectedButtons.includes(button)?'secondary':'primary'">{{ buttonLabel(button) }}</v-btn>
                    </v-flex>
                </v-layout>
            </v-container>
        </v-btn-toggle>
        <v-container grid-list-md text-s-center>
        <v-row class="justify-center my-10">
            <v-btn x-large class="black--text mr-10" @click="prevSample()" color=primary >Prev</v-btn>
            <v-btn x-large class="black--text" color=primary @click="nextSample()">Next</v-btn>
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

export default {
    name: 'RightPanel',
    props: {
    },
    data: () => ({
        toggles: [],
        selectValue: 'No Filter',
        selectValues: [
            'No Filter',
            'Green',
            'Red'
        ],
        buttons: [
            "AAA",
            "BBB",
            "CCC",
            "DDD",
            "EEE",
            "FFF",
            "GGG",
            "HHH",
            "III",
            "JJJ",
            "KKK",
            "LLL",
            "MMM",
            "NNN",
            "OOO",
            "PPP",
            "QQQ",
            "RRR",
            "SSS",
            "TTT",
            "UUU",
            "VVV",
            "WWW",
            "XXX",
            "YYY",
            "ZZZ",
            "!!!",
            "@@@"
        ],
        hotKeys: [
            "q",
            "w",
            "e",
            "r",
            "a",
            "s",
            "d",
            "f",
            "z",
            "x",
            "c",
            "v",
            "u",
            "i",
            "o",
            "p",
            "j",
            "k",
            "l",
            ";",
            "m",
            ",",
            ".",
            "/"
        ]
    }),
    computed: {
        ...mapState([
            'windowHelpers'
        ]),
        selectedButtons: function() {
            let buttonNames = []
            this.toggles.forEach((tog) => {
                buttonNames.push(this.buttons[tog])
            })
            return buttonNames
        },
        panelWidth: function() {
           return this.windowHelpers.rightPanelWidth + 'px'
        }
    },
    watch: {
        'toggles': function() {
            console.log(this.selectedButtons)
        }
    },
    mounted() {
        this.enableHotKeys()
    },
    methods: {
        ...mapMutations([
        ]),
        buttonLabel(button) {
            let buttIndex = this.buttons.indexOf(button)
            let hotKeyLabel = this.hotKeys[buttIndex]
            let fullLabel = hotKeyLabel ? button + ' [' + hotKeyLabel + ']' : button;
            return fullLabel
        },
        nextSample() {

            // reset toggles
            this.toggles = []

            console.log('NEXT')
        },
        prevSample() {
            
            // reset toggles
            this.toggles = []

            console.log('PREV')
        },
        enableHotKeys() {
            window.addEventListener("keydown", e => {
            if (e.keyCode === 39 || e.keyCode === 13){
                this.nextSample()
            } else if (e.keyCode === 37){
                this.prevSample()
            } else if (this.hotKeys.includes(e.key)) {
                let buttonIndex = this.hotKeys.indexOf(e.key)
                if (!this.toggles.includes(buttonIndex)) {
                    this.toggles.push(buttonIndex)
                } else {
                    this.toggles.splice(this.toggles.indexOf(buttonIndex),1)
                }
            }
        });
        }
    }
}
</script>


<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>

.v-btn {
    text-color: #000000;
}

/*#card {
    width: 400px;
}
*/
</style>
