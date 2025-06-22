<template>
    <v-app :style="{background: $vuetify.theme.themes[theme].background}">
        <v-content class="fill-height">
            <v-container fluid class="fill-height ma-1 px-1 pt-1 pb-3">
                <v-row class="fill-height" align="stretch" no-gutters>
                    <!-- Left: ImageViewer -->
                    <v-col class="fill-height" style="box-sizing: border-box;">
                        <ImageViewer 
                            ref="imageViewer"
                            @load-new-image="handleLoadNewImage"
                            @load-existing-image="handleLoadExistingImage"
                            @init-new-quadrat-svg="handleInitNewQuadratSVG"
                            @trigger-load-session="handleTriggerLoadSession"
                        />
                    </v-col>
                    <!-- Right: RightPanel -->
                    <v-col class="fill-height ma-0 pl-2" style="box-sizing: border-box;">
                        <RightPanel 
                            ref="rightPanel"
                            @load-new-image="handleLoadNewImage"
                            @load-existing-image="handleLoadExistingImage"
                            @init-new-quadrat-svg="handleInitNewQuadratSVG"
                        />
                    </v-col>
                </v-row>
            </v-container>
        </v-content>
    </v-app>
</template>

<script>
import ImageViewer from './components/ImageViewer';
import RightPanel from './components/RightPanel';
import { mapState, mapMutations, mapActions } from 'vuex';
import _ from 'lodash';
import { getSessionState } from './utils/sessionUtils';

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
        window.addEventListener('resize', this.updatePanelSize);
        window.addEventListener('maximize', this.updatePanelSize);
        window.addEventListener('unmaximize', this.updatePanelSize);

        // Add keydown listener for Ctrl+S
        window.addEventListener('keydown', this.handleKeyDown);
    },
    beforeDestroy() {
        // Clean up the event listener when the component is destroyed
        window.removeEventListener('keydown', this.handleKeyDown);
    },
    computed:{
        ...mapState([
            'imgSrc',
            'windowHelpers',
            'runningData',
            'imgPathList'
        ]),
        theme(){
            return (this.$vuetify.theme.dark) ? 'dark' : 'light';
        },
        sessionState() {
            return {
                runningData: this.runningData,
                imgPathList: this.imgPathList,
                currentImgSrc: this.imgSrc
            };
        }
    },
    watch: {
        'imgSrc': function() {
            this.updatePanelSize();
        },
        // Watch for any changes in the state and trigger a debounced save
        '$store.state': {
            handler() {
                // This check prevents saving an empty session right at the start
                if (this.$store.state.imgPathList && this.$store.state.imgPathList.length > 0) {
                    this.throttledSave();
                }
            },
            deep: true // Necessary to watch for changes inside the object
        }
    },
    created() {
        // Create the throttled function when the component is created.
        this.throttledSave = _.throttle(() => {
            const sessionState = getSessionState(this.$store);
            localStorage.setItem('lastSession', JSON.stringify(sessionState));
            console.log('Session auto-saved.');
        }, 5000, { 'leading': true, 'trailing': false });
    },
    methods: {
        ...mapMutations([
            'UPDATE_RUNNING_DATA'
        ]),
        handleKeyDown(event) {
            if (event.ctrlKey && event.key === 's') {
                event.preventDefault(); // Prevent the browser's default save dialog
                // Call the save method on the child component
                if (this.$refs.rightPanel) {
                    this.$refs.rightPanel.triggerSaveSession();
                }
            }
        },
        handleTriggerLoadSession() {
            if (this.$refs.rightPanel) {
                this.$refs.rightPanel.triggerLoadSessionFromFile();
            }
        },
        updatePanelSize() {
            if (this.imgSrc) {
                this.windowHelpers.leftPanelWidth = window.innerWidth - this.windowHelpers.rightPanelWidth - 25;
            } else {
                this.windowHelpers.leftPanelWidth = window.innerWidth - 25;
            }
            this.windowHelpers.height = window.innerHeight - 25;
        },

        // Handle events from RightPanel and pass to ImageViewer
        handleLoadNewImage(filePath) {
            this.$refs.imageViewer.loadNewImage(filePath);
        },

        handleLoadExistingImage(filePath) {
            this.$refs.imageViewer.loadExistingImage(filePath);
        },

        handleInitNewQuadratSVG() {
            this.$refs.imageViewer.initNewQuadratSVG();
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
