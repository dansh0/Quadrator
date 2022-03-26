<template>
    <v-card :style="{'width':panelWidth, 'height':panelHeight}" color=tertiary>
        <v-container v-if="!imgSrc" fill-height grid-list-md text-xs-center>
            <v-row class="mx-3 justify-center">
                <v-btn color=primary x-large @click="loadImage()">Load Image</v-btn>
            </v-row>
        </v-container>
        <v-container v-if="imgSrc" grid-list-md text-xs-center>
            <v-row class="mx-3 mb-3 justify-center">
                <v-btn color=primary @click="loadImage()">Load Image</v-btn>
            </v-row>
            <v-row align="center" class="mx-1 mb-1">
                <v-img max-width="100%" max-height="100%" :src="imgSrc"/>
            </v-row>
        </v-container>
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';
const { ipcRenderer } = require('electron');

export default {
    name: 'ImageViewer',
    props: {
        
    },
    computed: {
        ...mapState([
            'imgSrc',
            'windowHelpers'
        ]),
        panelWidth: function() {
            return this.windowHelpers.leftPanelWidth + 'px'
        },
        panelHeight: function() {
            if (!this.imgSrc) {
                return this.windowHelpers.height + 'px'
            } else {
                return '100%'
            }
        }
    },
    watch: {
    },
    mounted() {
        // window.addEventListener('resize', () => {
        //     console.log(window.innerWidth);
        //     console.log(this.windowHelpers)
        //     this.windowWidth = window.innerWidth;
        //     let leftPanel = this.windowWidth - this.windowHelpers.rightPanelWidth - 100
        //     this.windowHelpers.leftPanelWidth = leftPanel>100 ? leftPanel : 100;
        // })
        this.newQuadrat() // TEMP
    },
    methods: {
        ...mapMutations([
            'changeImgSrc',
            'newQuadrat'
        ]),
        loadImage() {
            ipcRenderer.invoke('openFile')
            .then((filePath) => {
                console.log(filePath)
                this.changeImgSrc(filePath);
                this.newQuadrat();
            });
        }
    }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style lang="scss" scoped>


</style>
