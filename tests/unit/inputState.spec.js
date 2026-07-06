import { describe, it, expect } from 'vitest';
import { InputState } from '../../src/InputState.js';

describe('InputState', () => {
    it('starts at sample 0 with no nodes', () => {
        const s = new InputState();
        expect(s.sampleNumber).toBe(0);
        expect(s.nodes).toEqual([]);
        expect(s.edgesNodes).toEqual([]);
        expect(s.loadedIteration).toBe(0);
    });

    it('restores fields from saved data', () => {
        const saved = {
            sampleNumber: 7,
            nodes: [{ x: 0.1, y: 0.2 }],
            edgesNodes: [[{ x: 0, y: 0 }]],
            loadedIteration: 3
        };
        const s = InputState.inputStateFromSavedData(saved);
        expect(s.sampleNumber).toBe(7);
        expect(s.nodes).toEqual(saved.nodes);
        expect(s.edgesNodes).toEqual(saved.edgesNodes);
        expect(s.loadedIteration).toBe(3);
    });

    it('applies defaults for missing fields', () => {
        const s = InputState.inputStateFromSavedData({});
        expect(s.sampleNumber).toBe(0);
        expect(s.nodes).toEqual([]);
        expect(s.edgesNodes).toEqual([]);
        expect(s.loadedIteration).toBe(0);
    });
});
