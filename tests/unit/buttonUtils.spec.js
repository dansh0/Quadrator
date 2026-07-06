import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import { loadButtonsFromPath } from '../../src/utils/buttonUtils.js';

const FIXTURE = path.join(__dirname, '../fixtures/buttons.csv');

let tmpDir;
beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'quadrator-test-'));
});
afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('loadButtonsFromPath', () => {
    it('parses the real species CSV fixture', async () => {
        const buttons = [];
        await loadButtonsFromPath(FIXTURE, buttons);

        expect(buttons.length).toBeGreaterThan(0);
        buttons.forEach(b => {
            expect(b.code).toBeTruthy();
            expect(b.species).toBeTruthy();
        });
        expect(buttons[0]).toMatchObject({
            code: 'Anom',
            species: 'Anthopleura_sp',
            group1: 'Animal',
            group2: 'Intertidal sessile'
        });
    });

    it('filters out rows without a species value', async () => {
        const file = path.join(tmpDir, 'buttons.csv');
        await fs.writeFile(file, [
            'code,species,group1,group2,color,colorSelected',
            'A,SpeciesA,G1,G2,#fff,#000',
            'B,,G1,G2,#fff,#000', // no species - must be dropped
            'C,SpeciesC,G1,G2,#fff,#000'
        ].join('\n'));
        const buttons = [];
        await loadButtonsFromPath(file, buttons);
        expect(buttons.map(b => b.code)).toEqual(['A', 'C']);
    });

    it('replaces previous contents while keeping the array reference', async () => {
        const buttons = [{ code: 'OLD', species: 'Old' }];
        const ref = buttons;
        await loadButtonsFromPath(FIXTURE, buttons);
        expect(buttons).toBe(ref); // same reference (Vuex reactivity depends on it)
        expect(buttons.find(b => b.code === 'OLD')).toBeUndefined();
    });

    it('rejects when the file does not exist', async () => {
        await expect(
            loadButtonsFromPath(path.join(tmpDir, 'missing.csv'), [])
        ).rejects.toThrow();
    });
});
