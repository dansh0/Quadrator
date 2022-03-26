<template>
    <v-card width="100%" height="100%" >
        <v-card-title class="">
            Select Species ID
        </v-card-title>
        <v-container grid-list-md text-s-center>
            <v-layout row wrap>
                <v-flex><v-btn large label="This Button">[1] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[2] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[3] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[4] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[5] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[6] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[7] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[8] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[9] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[q] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[w] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[e] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[r] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[t] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[y] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[u] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[i] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[o] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[p] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[a] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[s] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[d] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[f] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[g] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[h] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[i] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[j] AAA</v-btn></v-flex>
                <v-flex><v-btn large label="This Button">[k] AAA</v-btn></v-flex>
            </v-layout>
            <v-row>
                <v-col cols=10 class="ml-5">
                    <v-select v-if="toggleValue" v-model="selectValue" outlined :items="selectValues" label="Filter By Category"></v-select>
                </v-col>
            </v-row>
        </v-container>
    </v-card>
</template>


<script>
import { mapState, mapMutations } from 'vuex';

export default {
    name: 'ImageViewer',
    props: {
    },
    data: () => ({
        labelValue: "The best!",
        toggleValue: true,
        toggleValue2: false,
        selectValue: 'No Filter',
        selectValues: [
            'No Filter',
            'Green',
            'Red'
        ],
    }),
    computed: {
        ...mapState([
            
        ])
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
