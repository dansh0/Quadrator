// Minimal mock of the electron renderer API surface used by the app.
// Wired in via the `electron` alias in vitest.config.js.
// Tests can inspect/override calls through `ipcRenderer.invoke.calls` or by
// replacing `ipcRenderer.invoke.impl`.

function createInvoke() {
    const invoke = (...args) => {
        invoke.calls.push(args);
        return Promise.resolve(invoke.impl ? invoke.impl(...args) : undefined);
    };
    invoke.calls = [];
    invoke.impl = null;
    invoke.reset = () => {
        invoke.calls = [];
        invoke.impl = null;
    };
    return invoke;
}

export const ipcRenderer = {
    invoke: createInvoke()
};

export default { ipcRenderer };
