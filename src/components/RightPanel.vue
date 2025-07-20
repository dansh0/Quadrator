<template>
    <v-card v-if="imgSrc" id="card" :style="{'width':panelWidth}" color="tertiary" height="100%" >
        <!-- Tabs -->
        <v-tabs v-model="localTab" background-color="primary" dark dense>
            <v-tab key="0">Image Prep</v-tab>
            <v-tab key="1">Species ID</v-tab>
            <v-tab key="2">Data Review</v-tab>
        </v-tabs>
        <v-tabs-items v-model="localTab">
            <v-tab-item key="0">
                <ImagePrepTab
                    ref="imagePrepTab"
                    v-if="localTab === 0"
                    @load-new-image="handleLoadNewImage"
                    @load-existing-image="handleLoadExistingImage"
                    @init-new-quadrat-svg="handleInitNewQuadratSVG"
                />
            </v-tab-item>
            <v-tab-item key="1">
                <SpeciesInputTab v-if="localTab === 1" />
            </v-tab-item>
            <v-tab-item key="2">
                <QATab v-if="localTab === 2" />
            </v-tab-item>
        </v-tabs-items>
    </v-card>
</template>

<script>
import { mapState, mapMutations } from 'vuex';
import ImagePrepTab from './tabs/ImagePrepTab.vue';
import SpeciesInputTab from './tabs/SpeciesInputTab.vue';
import QATab from './tabs/QATab.vue';

export default {
    name: 'RightPanel',
    components: {
        ImagePrepTab,
        SpeciesInputTab,
        QATab
    },
    computed: {
        ...mapState([
            'imgSrc',
            'windowHelpers',
            'activeTab'
        ]),
        panelWidth() {
            return this.windowHelpers.rightPanelWidth + 'px';
        },
        // Two-way computed property to keep local tab in sync with Vuex store
        localTab: {
            get() {
                return this.activeTab;
            },
            set(val) {
                this.SET_ACTIVE_TAB(val);
            }
        }
    },
    methods: {
        ...mapMutations([
            'SET_ACTIVE_TAB'
        ]),
        // Pass-throughs for child events coming from MenuButtons
        handleLoadNewImage(filePath) {
            this.$emit('load-new-image', filePath);
        },
        handleLoadExistingImage(filePath) {
            this.$emit('load-existing-image', filePath);
        },
        handleInitNewQuadratSVG() {
            this.$emit('init-new-quadrat-svg');
        },
        triggerSaveSession() {
            if (this.$refs.imagePrepTab && this.$refs.imagePrepTab.$refs.menuButtons) {
                this.$refs.imagePrepTab.$refs.menuButtons.saveSession();
            }
        },
        triggerLoadSessionFromFile() {
            if (this.$refs.imagePrepTab && this.$refs.imagePrepTab.$refs.menuButtons) {
                this.$refs.imagePrepTab.$refs.menuButtons.loadSession();
            }
        }
    }
}
</script>

<style scoped>
.v-btn {
    text-color: #000000;
}

/* Ensure the card fills the right panel area */
#card {
    display: flex;
    flex-direction: column;
}

.v-tabs {
    flex-grow: 0;
}

.theme--dark.v-tabs-items {
    background-color: #444449;
}
</style>
