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
                }],
                "win": {
                    "icon": "src/assets/favicon.ico",
                    "target": [
                        {
                            "target": "nsis",
                            "arch": ["x64"]
                        }
                    ]
                },
                "mac": {
                    "icon": "src/assets/favicon.ico",
                    "target": [
                        {
                            "target": "dmg",
                            "arch": ["x64"]
                        }
                    ]
                },
                "linux": {
                    "icon": "src/assets/favicon.ico",
                    "target": [
                        {
                            "target": "AppImage",
                            "arch": ["x64"]
                        }
                    ]
                }
            }
        }
    },
}