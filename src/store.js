import Vue from 'vue'
import Vuex from 'vuex'
import { Quadrat } from './dataModel/quadrat.js'

Vue.use(Vuex)

const store = new Vuex.Store({
    state: {
        count: 0,
        // imgSrc: undefined,
        imgSrc: "C:\\Users\\dan\\Documents\\Fortify\\quadrator\\images\\fish.jpg",
        windowHelpers: {
            rightPanelWidth: 400,
            leftPanelWidth: 300,
            height: 400
        },
        buttons: [
            {'code': "AAA", 'species': "AAAAAAAAA"},
            {'code': "BBB", 'species': "BBBBBBBBB"},
            {'code': "CCC", 'species': "CCCCCCCCC"},
            {'code': "DDD", 'species': "DDDDDDDDD"},
            {'code': "EEE", 'species': "EEEEEEEEE"},
            {'code': "FFF", 'species': "FFFFFFFFF"},
            {'code': "GGG", 'species': "GGGGGGGGG"},
            {'code': "HHH", 'species': "HHHHHHHHH"},
            {'code': "III", 'species': "IIIIIIIII"},
            {'code': "JJJ", 'species': "JJJJJJJJJ"},
            {'code': "KKK", 'species': "KKKKKKKKK"},
            {'code': "LLL", 'species': "LLLLLLLLL"},
            {'code': "MMM", 'species': "MMMMMMMMM"},
            {'code': "NNN", 'species': "NNNNNNNNN"},
            {'code': "OOO", 'species': "OOOOOOOOO"},
            {'code': "PPP", 'species': "PPPPPPPPP"},
            {'code': "QQQ", 'species': "QQQQQQQQQ"},
            {'code': "RRR", 'species': "RRRRRRRRR"},
            {'code': "SSS", 'species': "SSSSSSSSS"},
            {'code': "TTT", 'species': "TTTTTTTTT"},
            {'code': "UUU", 'species': "UUUUUUUUU"},
            {'code': "VVV", 'species': "VVVVVVVVV"},
            {'code': "WWW", 'species': "WWWWWWWWW"},
            {'code': "XXX", 'species': "XXXXXXXXX"},
            {'code': "YYY", 'species': "YYYYYYYYY"},
            {'code': "ZZZ", 'species': "ZZZZZZZZZ"},
            {'code': "!!!", 'species': "!!!!!!!!!"},
            {'code': "@@@", 'species': "@@@@@@@@@"}
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
        ],
        quadratSettings: {
            'numOfSamples': 25,
            'nEdge': 4,
        },
        inputStatus: {
            'sampleNumber': 0
        },
        quadratData: {},
        runningData: [] // list of quadrats
    },
    actions: {
    },
    mutations: {
        newQuadrat (state) {
            let quadrat = new Quadrat(state.quadratSettings.numOfSamples, state.imgSrc)
            state.quadratData = quadrat;
        },
        changeImgSrc (state, imagePath) {
            state.imgSrc = imagePath;
        }
    },
    getters: {

    }
})


export { store }