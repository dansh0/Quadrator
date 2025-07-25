// const { defineConfig } = require('@vue/cli-service')

// module.exports = defineConfig({
//   transpileDependencies: true
// })

module.exports = {
    // In an electron build we need relative paths so font & image assets resolve correctly.
    // Use absolute path during web dev for dev-server, switch to relative path for production builds.
    publicPath: process.env.NODE_ENV === 'production' ? './' : '/',
    transpileDependencies: [
        "vuetify"
    ],
    pluginOptions: {
        electronBuilder: {
            nodeIntegration: true,
            builderOptions: {
                "extraResources": [
                    {
                        "from": "./src/assets/buttons.csv",
                        "to": "./buttons.csv"
                    },
                    {
                        "from": "./src/assets/buttons_template.csv",
                        "to": "./buttons_template.csv"
                    }
                ],
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