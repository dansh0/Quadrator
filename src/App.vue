<template>
    <v-app :style="{background: $vuetify.theme.themes[theme].background}">
        <v-content class="center-y">
            <v-container fluid class="pa-1">
                <v-row>
                    <div height=100% class="pa-1 pl-4">
                        <ImageViewer />
                    </div>
                    <div height=100% id="right" class="pa-1 pr-4">
                        <v-container fluid class="px-1 py-0">
                            <v-row v-if="imgSrc">
                                <v-col cols=12 class="px-1 pt-0 pb-1">
                                    <ZoomPanel />
                                </v-col>
                            </v-row>
                            <v-row>
                                <v-col cols=12 class="px-1 py-0">
                                    <RightPanel />
                                </v-col>
                            </v-row>
                        </v-container>
                    </div>
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
        this.windowHelpers.leftPanelWidth = window.innerWidth - this.windowHelpers.rightPanelWidth -20;

        // set up listener to repeat left panel calc whenever needed
        window.addEventListener('resize', () => {
            console.log(window.innerWidth);
            console.log(this.windowHelpers)
            this.windowHelpers.leftPanelWidth = window.innerWidth - this.windowHelpers.rightPanelWidth -20;
            this.windowHelpers.height = window.innerHeight;
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

    },
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
