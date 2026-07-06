import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { exportDataToCSV, exportDataInteractive } from '../../src/utils/exportUtils.js';
import { ipcRenderer } from '../mocks/electron.js';

const HEADER = 'Quadrat Title,Image Path,ID Date,Species Code,Species,Group Name,Species Count,Species Coverage %';

function fakeEntry(csvText) {
    return { inputStatus: {}, quadratData: { toCSV: () => csvText } };
}

let tmpDir;
beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quadrator-test-'));
    ipcRenderer.invoke.reset();
});
afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('exportDataToCSV', () => {
    it('writes a header plus data rows to a new file', async () => {
        const file = path.join(tmpDir, 'out.csv');
        await exportDataToCSV(file, [fakeEntry('a,b\n'), fakeEntry('c,d\n')], []);
        const content = await fs.readFile(file, 'utf8');
        expect(content).toBe(`${HEADER}\na,b\nc,d\n`);
    });

    it('appends without a duplicate header to an existing file', async () => {
        const file = path.join(tmpDir, 'out.csv');
        await exportDataToCSV(file, [fakeEntry('a,b\n')], []);
        await exportDataToCSV(file, [fakeEntry('c,d\n')], []);
        const content = await fs.readFile(file, 'utf8');
        expect(content).toBe(`${HEADER}\na,b\nc,d\n`);
        expect(content.match(/Quadrat Title/g)).toHaveLength(1);
    });

    it('skips gaps in runningData instead of crashing', async () => {
        const file = path.join(tmpDir, 'out.csv');
        const sparse = [fakeEntry('a,b\n')];
        sparse[2] = fakeEntry('c,d\n'); // index 1 is a hole
        await exportDataToCSV(file, sparse, []);
        const content = await fs.readFile(file, 'utf8');
        expect(content).toContain('a,b');
        expect(content).toContain('c,d');
    });

    it('rejects when the file cannot be written', async () => {
        const file = path.join(tmpDir, 'no-such-dir', 'out.csv');
        await expect(exportDataToCSV(file, [fakeEntry('a,b\n')], [])).rejects.toThrow();
    });
});

describe('exportDataInteractive', () => {
    function fakeStore() {
        return {
            state: {
                runningData: [fakeEntry('a,b\n')],
                buttons: []
            },
            commits: [],
            commit(mutation) { this.commits.push(mutation); }
        };
    }

    it('captures the active quadrat and exports to the chosen file', async () => {
        const file = path.join(tmpDir, 'out.csv');
        ipcRenderer.invoke.impl = (channel) =>
            (channel === 'appendFile' ? { filePath: file } : undefined);
        const store = fakeStore();

        const exported = await exportDataInteractive(store);

        expect(exported).toBe(true);
        expect(store.commits).toEqual(['UPDATE_RUNNING_DATA']);
        const content = await fs.readFile(file, 'utf8');
        expect(content).toBe(`${HEADER}\na,b\n`);
    });

    it('does nothing when the file dialog is cancelled', async () => {
        // Electron's showSaveDialog resolves { canceled: true, filePath: undefined }
        ipcRenderer.invoke.impl = () => ({ filePath: undefined });
        const store = fakeStore();
        const exported = await exportDataInteractive(store);
        expect(exported).toBe(false);
    });
});
