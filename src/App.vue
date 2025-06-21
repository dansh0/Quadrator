<template>
    <v-app :style="{background: $vuetify.theme.themes[theme].background}">
        <v-content class="fill-height">
            <v-container fluid class="fill-height ma-1 px-1 pt-1 pb-3">
                <v-row class="fill-height" align="stretch" no-gutters>
                    <!-- Left: ImageViewer -->
                    <v-col class="fill-height" style="box-sizing: border-box;">
                        <ImageViewer/>
                    </v-col>
                    <!-- Right: ZoomPanel + RightPanel stacked -->
                    <v-col class="fill-height d-flex ma-0 pl-2" style="box-sizing: border-box;">
                        <RightPanel/>
                    </v-col>
                </v-row>
            </v-container>
        </v-content>
    </v-app>
</template>

<script>
import ImageViewer from './components/ImageViewer';
import RightPanel from './components/RightPanel';
import { mapState, mapMutations } from 'vuex';

console.log(window)

export default {
    name: 'App',
    components: {
        ImageViewer,
        RightPanel
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

// Disable scrolling and prevent white bar
html, body {
    overflow: hidden;
    margin: 0;
    padding: 0;
    height: 100vh;
    width: 100vw;
}

#app {
    height: 100vh;
    width: 100vw;
    overflow: hidden;
}

.v-application {
    overflow: hidden !important;
}

.v-content {
    overflow: hidden !important;
}

.v-container {
    overflow: hidden !important;
}

.v-row {
    overflow: hidden !important;
}

.v-col {
    overflow: hidden !important;
}
</style>
