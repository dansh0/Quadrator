// const { defineConfig } = require('@vue/cli-service')

// module.exports = defineConfig({
//   transpileDependencies: true
// })

// The main process is bundled by webpack 4 (nested inside vue-cli-plugin-electron-builder),
// which hardcodes MD4 hashing in several places. OpenSSL 3 (Node >= 17) removed MD4, so
// serve/build crash with ERR_OSSL_EVP_UNSUPPORTED. Redirect md4 -> sha256 for the build
// process only; this file is never loaded by the packaged app.
const crypto = require('crypto');
const origCreateHash = crypto.createHash;
crypto.createHash = (algorithm, options) =>
    origCreateHash(algorithm === 'md4' ? 'sha256' : algorithm, options);

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