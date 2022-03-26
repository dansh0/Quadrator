import Vue from 'vue';
import Vuetify from 'vuetify';
import '@mdi/font/css/materialdesignicons.css';
import colors from 'vuetify/lib/util/colors';
import 'vuetify/dist/vuetify.min.css'

Vue.use(Vuetify);

export default new Vuetify({
    icons: {
        iconfont: 'mdi'
    },
    theme: {
        dark: true,
        themes: {
            light: {
                primary: "#1397e3",
                secondary: "#eeeeee",
                tertiary: "#30859c",
                error: "#c46354",
                green: colors.teal.darken1,
                dimText: "#616161",
                brightText: colors.grey.darken4,
                yellow: colors.yellow.darken1,
                background: "#ff0000"
            },
            dark: {
                primary: "#128767",
                secondary: "#bcf6ff",
                tertiary: "#444449",
                accent: "#3ab1cb",
                error: "#c46354",
                green: colors.green.accent4,
                dimText: colors.grey,
                brightText: colors.grey.lighten4,
                background: "#222229"
            }
        }
    }
});