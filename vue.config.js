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
            nodeIntegration: true,
            builderOptions: {
                "extraResources": [{
                    "from": "./src/assets/buttons.csv",
                    "to": "./buttons.csv"
                }]
            }
        }
    },
}