import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
    getSessionState,
    saveSessionToFile,
    loadSessionFromFile,
    saveSessionInteractive,
    loadSessionInteractive
} from '../../src/utils/sessionUtils.js';
import { ipcRenderer } from '../mocks/electron.js';

const FIXTURE = path.join(__dirname, '../fixtures/session-v0.json');

function fakeStore(stateOverrides = {}) {
    const store = {
        state: {
            imgPathList: ['/p/a.jpg'],
            runningData: [],
            imgSrc: '/p/a.jpg',
            ...stateOverrides
        },
        commits: [],
        commit(mutation, payload) {
            this.commits.push([mutation, payload]);
        }
    };
    return store;
}

let tmpDir;
beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quadrator-test-'));
    ipcRenderer.invoke.reset();
});
afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('getSessionState', () => {
    it('extracts only the session-relevant slices of the store', () => {
        const store = {
            state: {
                imgPathList: ['/p/a.jpg'],
                runningData: [{ some: 'data' }],
                imgSrc: '/p/a.jpg',
                buttons: ['should not be included'],
                imgElem: { tagName: 'IMG' }
            }
        };
        expect(getSessionState(store)).toEqual({
            imgPathList: ['/p/a.jpg'],
            runningData: [{ some: 'data' }],
            currentImgSrc: '/p/a.jpg'
        });
    });
});

describe('save/load round trip', () => {
    it('loads back exactly what was saved', async () => {
        const session = {
            imgPathList: ['/p/a.jpg', '/p/b.jpg'],
            runningData: [{ inputStatus: { sampleNumber: 2 }, quadratData: { name: 'a' } }],
            currentImgSrc: '/p/a.jpg'
        };
        const file = path.join(tmpDir, 'session.json');
        await saveSessionToFile(file, session);
        const loaded = await loadSessionFromFile(file);
        expect(loaded).toEqual(session);
    });
});

describe('loadSessionFromFile validation', () => {
    it('rejects JSON missing required keys', async () => {
        const file = path.join(tmpDir, 'bad.json');
        await fs.writeFile(file, JSON.stringify({ foo: 'bar' }));
        await expect(loadSessionFromFile(file)).rejects.toThrow('Invalid or corrupt session file.');
    });

    it('rejects non-JSON content', async () => {
        const file = path.join(tmpDir, 'not-json.json');
        await fs.writeFile(file, 'this is not json{');
        await expect(loadSessionFromFile(file)).rejects.toThrow();
    });

    it('rejects a missing file', async () => {
        await expect(loadSessionFromFile(path.join(tmpDir, 'nope.json'))).rejects.toThrow();
    });
});

describe('saveSessionInteractive', () => {
    it('captures the active quadrat and writes the session to the chosen file', async () => {
        const file = path.join(tmpDir, 'session.json');
        ipcRenderer.invoke.impl = (channel) => (channel === 'saveFile' ? file : undefined);
        const store = fakeStore({ runningData: [{ some: 'data' }] });

        const saved = await saveSessionInteractive(store);

        expect(saved).toBe(true);
        expect(store.commits).toEqual([['UPDATE_RUNNING_DATA', undefined]]);
        const written = JSON.parse(await fs.readFile(file, 'utf8'));
        expect(written).toEqual({
            imgPathList: ['/p/a.jpg'],
            runningData: [{ some: 'data' }],
            currentImgSrc: '/p/a.jpg'
        });
    });

    it('does nothing when the save dialog is cancelled', async () => {
        ipcRenderer.invoke.impl = () => null; // user cancelled
        const store = fakeStore();
        const saved = await saveSessionInteractive(store);
        expect(saved).toBe(false);
        expect(store.commits).toEqual([]);
    });
});

describe('loadSessionInteractive', () => {
    it('restores the chosen session file into the store', async () => {
        ipcRenderer.invoke.impl = (channel) => (channel === 'openFile' ? [FIXTURE] : undefined);
        const store = fakeStore({ runningData: [] });

        const loaded = await loadSessionInteractive(store);

        expect(loaded).toBe(true);
        expect(store.commits).toHaveLength(1);
        const [mutation, payload] = store.commits[0];
        expect(mutation).toBe('RESTORE_SESSION');
        expect(payload.imgPathList.length).toBeGreaterThan(0);
        // no confirmation question when there is no data to lose
        expect(ipcRenderer.invoke.calls.map(c => c[0])).toEqual(['openFile']);
    });

    it('asks for confirmation when data exists and aborts on No', async () => {
        ipcRenderer.invoke.impl = (channel) =>
            (channel === 'question' ? { response: 0 } : [FIXTURE]);
        const store = fakeStore({ runningData: [{ some: 'data' }] });

        const loaded = await loadSessionInteractive(store);

        expect(loaded).toBe(false);
        expect(store.commits).toEqual([]);
        expect(ipcRenderer.invoke.calls.map(c => c[0])).toEqual(['question']);
    });

    it('returns false when the file dialog is cancelled', async () => {
        ipcRenderer.invoke.impl = () => [];
        const store = fakeStore();
        const loaded = await loadSessionInteractive(store);
        expect(loaded).toBe(false);
        expect(store.commits).toEqual([]);
    });

    it('propagates errors from an invalid session file', async () => {
        const bad = path.join(tmpDir, 'bad.json');
        await fs.writeFile(bad, JSON.stringify({ nope: true }));
        ipcRenderer.invoke.impl = (channel) => (channel === 'openFile' ? [bad] : undefined);
        const store = fakeStore();
        await expect(loadSessionInteractive(store)).rejects.toThrow('Invalid or corrupt session file.');
        expect(store.commits).toEqual([]);
    });
});

describe('v0 fixture compatibility', () => {
    // The current (unversioned) session format must keep loading - these
    // fixtures anchor backward compatibility through the planned migration.
    // Any session-v0*.json dropped into tests/fixtures is picked up here.
    const { readdirSync } = require('node:fs');
    const fixtureDir = path.join(__dirname, '../fixtures');
    const fixtures = readdirSync(fixtureDir).filter(f => /^session-v0.*\.json$/.test(f));

    it('has at least one captured fixture', () => {
        expect(fixtures.length).toBeGreaterThan(0);
    });

    it.each(fixtures)('loads the captured real-world session %s', async (name) => {
        const session = await loadSessionFromFile(path.join(fixtureDir, name));
        expect(session.imgPathList.length).toBeGreaterThan(0);
        expect(session.runningData.length).toBeGreaterThan(0);
        expect(typeof session.currentImgSrc).toBe('string');

        session.runningData.forEach(record => {
            expect(record.inputStatus).toBeDefined();
            expect(record.quadratData).toBeDefined();
            expect(Array.isArray(record.inputStatus.nodes)).toBe(true);
            expect(Array.isArray(record.quadratData.samples)).toBe(true);
        });
    });
});
