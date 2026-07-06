import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { getSessionState, saveSessionToFile, loadSessionFromFile } from '../../src/utils/sessionUtils.js';

const FIXTURE = path.join(__dirname, '../fixtures/session-v0.json');

let tmpDir;
beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quadrator-test-'));
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

describe('v0 fixture compatibility', () => {
    // The current (unversioned) session format must keep loading - this
    // fixture anchors backward compatibility through the planned migration.
    it('loads the captured real-world v0 session', async () => {
        const session = await loadSessionFromFile(FIXTURE);
        expect(session.imgPathList.length).toBeGreaterThan(0);
        expect(session.runningData.length).toBeGreaterThan(0);
        expect(typeof session.currentImgSrc).toBe('string');

        const first = session.runningData[0];
        expect(first.inputStatus).toBeDefined();
        expect(first.quadratData).toBeDefined();
        expect(Array.isArray(first.inputStatus.nodes)).toBe(true);
        expect(Array.isArray(first.quadratData.samples)).toBe(true);
    });
});
