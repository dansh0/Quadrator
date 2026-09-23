import { InMemoryPlatformAdapter, PlatformAdapter, PlatformIOError } from '@quadrator/core';
import { describe, expect, it } from 'vitest';
import { ElectronPlatformAdapter } from '../src/platform/electron.ts';

/** A bridge whose every method rejects like an IPC error clone. */
function failingBridge(): PlatformAdapter {
  const fail = () =>
    Promise.reject(new Error("Error invoking remote method 'session:open': ENOENT"));
  return {
    capabilities: { persistentFileIds: true, canOverwrite: true },
    openSession: fail,
    saveSessionAs: fail,
    saveSession: fail,
    openSpeciesCsv: fail,
    pickImages: fail,
    loadImage: fail,
    relinkImage: fail,
    exportCsv: fail,
    loadSettings: fail,
    saveSettings: fail,
  };
}

describe('ElectronPlatformAdapter', () => {
  it('passes results and cancellations through unchanged', async () => {
    // the in-memory adapter stands in for the preload bridge
    const bridge = new InMemoryPlatformAdapter();
    bridge.queueSessionOpen('{"v":1}', { id: '/s.json', name: 's.json' });
    const adapter = new ElectronPlatformAdapter(bridge);

    expect(adapter.capabilities).toEqual(bridge.capabilities);
    expect((await adapter.openSession())?.text).toBe('{"v":1}');
    expect(await adapter.openSession()).toBeNull(); // cancel stays null
    expect(await adapter.pickImages()).toEqual([]);

    await adapter.saveSettings({ a: 1 });
    expect(await adapter.loadSettings()).toEqual({ a: 1 });
  });

  it('normalizes bridge failures into PlatformIOError with context', async () => {
    const adapter = new ElectronPlatformAdapter(failingBridge());

    await expect(adapter.openSession()).rejects.toThrow(PlatformIOError);
    await expect(adapter.openSession()).rejects.toThrow(/open session failed/);
    await expect(
      adapter.loadImage({ id: '/img/a.jpg', name: 'a.jpg' })
    ).rejects.toThrow(/load image a\.jpg failed: .*ENOENT/);
    await expect(adapter.saveSettings({})).rejects.toThrow(PlatformIOError);
  });
});
