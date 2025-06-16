<template>
    <v-app :style="{background: $vuetify.theme.themes[theme].background}">
        <v-content class="fill-height">
            <v-container fluid class="fill-height">
                <v-row class="fill-height" align="stretch" no-gutters>
                    <!-- Left: ImageViewer -->
                    <v-col class="fill-height" style="box-sizing: border-box;">
                        <ImageViewer/>
                    </v-col>
                    <!-- Right: ZoomPanel + RightPanel stacked -->
                    <v-col class="fill-height d-flex flex-column" style="box-sizing: border-box;">
                        <div style="height:200px;">
                            <ZoomPanel style="border-left: 12px solid rgb(34, 34, 41) !important;"/>
                        </div>
                        <div class="flex-grow-1 d-flex flex-column">
                            <RightPanel style="border-top: 12px solid rgb(34, 34, 41) !important; border-left: 12px solid rgb(34, 34, 41) !important;"/>
                        </div>
                    </v-col>
                </v-row>
            </v-container>
        </v-content>
    </v-app>
</template>

<script>
import ImageViewer from './components/ImageViewer';
import RightPanel from './components/RightPanel';
import ZoomPanel from './components/ZoomPanel';
import { mapState, mapMutations } from 'vuex';

console.log(window)

export default {
    name: 'App',
    components: {
        ImageViewer,
        RightPanel,
        ZoomPanel
    },
    data: () => ({
    }),
    mounted() {
        window.fstore = this.$store.state;

        // calc left panel
        this.updatePanelSize();

        // set up listener to repeat left panel calc whenever needed
        window.addEventListener('resize', () => {
            this.updatePanelSize();
            
        })
        window.addEventListener('maximize', () => {
            this.updatePanelSize();
            
        })
        window.addEventListener('unmaximize', () => {
            this.updatePanelSize();
            
        })
    },
    computed:{
        ...mapState([
            'imgSrc',
            'windowHelpers'
        ]),
        theme(){
            return (this.$vuetify.theme.dark) ? 'dark' : 'light';
        },
    },
    watch: {
        'imgSrc': function() {
            this.updatePanelSize();
        }
    },
    methods: {
        updatePanelSize() {
            if (this.imgSrc) {
                this.windowHelpers.leftPanelWidth = window.innerWidth - this.windowHelpers.rightPanelWidth - 25;
            } else {
                this.windowHelpers.leftPanelWidth = window.innerWidth - 25;
            }
            this.windowHelpers.height = window.innerHeight - 25;
        }
    }
}
</script>

<style lang="scss">

// do not show scroll bar on app
::-webkit-scrollbar {
    width: 0;
}

#app {/*
    font-family: Avenir, Helvetica, Arial, sans-serif;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-align: center;
    color: #2c3e50;
    margin-top: 60px;*/
}
</style>
