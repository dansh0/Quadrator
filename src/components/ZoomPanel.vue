<template>
    <v-card :style="{'width':panelWidth}" color=tertiary max-height=200 height="100%" >
        <v-container v-if="imgSrc" fluid class="pa-0">
            <v-row class="mx-2 justify-center">
                <v-img width="200px" height="180px" contain :src="imgSrc" class="my-2"/>
            </v-row>
        </v-container>
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';

export default {
    name: 'ZoomPanel',
    props: {
    },
    data: () => ({
        
    }),
    computed: {
        ...mapState([
            'imgSrc',
            'windowHelpers'
        ]),
        panelWidth: function() {
           return this.windowHelpers.rightPanelWidth + 'px'
        }
    },
    watch: {

    },
    mounted() {
    },
    methods: {
        ...mapMutations([
        ]),
    }
}
</script>


<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>


</style>
