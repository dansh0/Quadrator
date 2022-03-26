// const { defineConfig } = require('@vue/cli-service')

// module.exports = defineConfig({
//   transpileDependencies: true
// })

module.exports = {
    publicPath: "/",
    transpileDependencies: [
        "vuetify"
    ],
    pluginOptions: {
        electronBuilder: {
            nodeIntegration: true
        }
    },
}