// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// vitest runs with the project root as cwd
const FIXTURE = JSON.parse(readFileSync('tests/fixtures/session-v0.json', 'utf8'));

// The store module is a singleton with mutable state, so import a fresh copy
// (and matching class identities) for every test.
let store, Quadrat, InputState;
beforeEach(async () => {
    vi.resetModules();
    ({ store } = await import('../../src/store.js'));
    ({ Quadrat } = await import('../../src/dataModel/quadrat.js'));
    ({ InputState } = await import('../../src/InputState.js'));
});

describe('NEW_QUADRAT', () => {
    it('creates a quadrat sized from the sampling settings', () => {
        store.state.imgSrc = '/p/a.jpg';
        store.commit('NEW_QUADRAT');
        expect(store.state.quadratData).toBeInstanceOf(Quadrat);
        expect(store.state.quadratData.samples).toHaveLength(5 * 5);
        expect(store.state.quadratData.imgSrc).toBe('/p/a.jpg');
        expect(store.state.inputStatus).toBeInstanceOf(InputState);
        expect(store.state.inputStatus.sampleNumber).toBe(0);
    });
});

describe('CHANGE_IMG_SRC / SET_ACTIVE_TAB', () => {
    it('update their fields', () => {
        store.commit('CHANGE_IMG_SRC', '/p/b.jpg');
        expect(store.state.imgSrc).toBe('/p/b.jpg');
        store.commit('SET_ACTIVE_TAB', 2);
        expect(store.state.activeTab).toBe(2);
    });
});

describe('UPDATE_RUNNING_DATA', () => {
    function loadImage(src) {
        store.state.imgPathList.push(src);
        store.commit('CHANGE_IMG_SRC', src);
        store.commit('NEW_QUADRAT');
    }

    it('pushes a new entry for a newly loaded image', () => {
        loadImage('/p/a.jpg');
        store.commit('UPDATE_RUNNING_DATA');
        expect(store.state.runningData).toHaveLength(1);
        expect(store.state.runningData[0].quadratData).toBe(store.state.quadratData);
        expect(store.state.runningData[0].inputStatus).toBe(store.state.inputStatus);
    });

    it('updates the existing entry on subsequent commits', () => {
        loadImage('/p/a.jpg');
        store.commit('UPDATE_RUNNING_DATA');
        const firstQuadrat = store.state.quadratData;
        store.commit('NEW_QUADRAT'); // re-randomize same image
        store.commit('UPDATE_RUNNING_DATA');
        expect(store.state.runningData).toHaveLength(1);
        expect(store.state.runningData[0].quadratData).not.toBe(firstQuadrat);
    });

    it('tracks two images independently', () => {
        loadImage('/p/a.jpg');
        store.commit('UPDATE_RUNNING_DATA');
        loadImage('/p/b.jpg');
        store.commit('UPDATE_RUNNING_DATA');
        expect(store.state.runningData).toHaveLength(2);
        expect(store.state.runningData[0].quadratData.imgSrc).toBe('/p/a.jpg');
        expect(store.state.runningData[1].quadratData.imgSrc).toBe('/p/b.jpg');
    });

    // KNOWN QUIRK (audit B3): entries are linked to images by indexOf on the
    // path, so a duplicate path collapses onto the first entry. This test pins
    // the CURRENT behavior; the migration replaces it with stable quadrat IDs.
    it('collapses duplicate image paths onto the first entry (characterization)', () => {
        loadImage('/p/a.jpg');
        store.commit('UPDATE_RUNNING_DATA');
        loadImage('/p/a.jpg'); // same path loaded again
        store.commit('UPDATE_RUNNING_DATA');
        expect(store.state.runningData).toHaveLength(1);
    });
});

describe('SWAP_QUADRAT', () => {
    it('makes the given record the active quadrat', () => {
        const record = {
            quadratData: new Quadrat(4, '/p/x.jpg'),
            inputStatus: new InputState()
        };
        store.commit('SWAP_QUADRAT', record);
        expect(store.state.quadratData).toBe(record.quadratData);
        expect(store.state.inputStatus).toBe(record.inputStatus);
    });
});

describe('RESTORE_SESSION', () => {
    it('rebuilds class instances from the real v0 fixture', () => {
        store.commit('RESTORE_SESSION', FIXTURE);

        expect(store.state.imgPathList).toEqual(FIXTURE.imgPathList);
        expect(store.state.runningData).toHaveLength(FIXTURE.runningData.length);
        store.state.runningData.forEach(rec => {
            expect(rec.quadratData).toBeInstanceOf(Quadrat);
            expect(rec.inputStatus).toBeInstanceOf(InputState);
            // methods must be intact after restore
            expect(typeof rec.quadratData.toCSV).toBe('function');
        });
        expect(store.state.imgSrc).toBe(FIXTURE.currentImgSrc);
        expect(store.state.quadratData).toBe(
            store.state.runningData[FIXTURE.imgPathList.indexOf(FIXTURE.currentImgSrc)].quadratData
        );
    });

    it('creates a fresh quadrat when the current image has no saved data', () => {
        const session = {
            imgPathList: ['/p/a.jpg', '/p/b.jpg'],
            runningData: [
                {
                    inputStatus: { sampleNumber: 0, nodes: [] },
                    quadratData: { numOfSamples: 25, imgSrc: '/p/a.jpg', samples: [] }
                }
            ],
            currentImgSrc: '/p/b.jpg' // in path list but not in runningData
        };
        store.commit('RESTORE_SESSION', session);
        expect(store.state.imgSrc).toBe('/p/b.jpg');
        expect(store.state.quadratData).toBeInstanceOf(Quadrat);
        expect(store.state.quadratData.samples).toHaveLength(25);
    });
});
