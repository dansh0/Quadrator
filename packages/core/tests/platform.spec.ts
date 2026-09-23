import { describe, expect, it } from 'vitest';
import { InMemoryPlatformAdapter } from '../src/platform/memory.ts';
import { PlatformIOError } from '../src/platform/adapter.ts';

describe('InMemoryPlatformAdapter', () => {
  it('open dialogs return queued responses in order, then null (cancel)', async () => {
    const a = new InMemoryPlatformAdapter();
    a.queueSessionOpen('{"first": true}');
    a.queueSessionOpen('{"second": true}', { id: '/two.json', name: 'two.json' });

    expect((await a.openSession())?.text).toBe('{"first": true}');
    expect((await a.openSession())?.ref.name).toBe('two.json');
    expect(await a.openSession()).toBeNull();

    expect(await a.openSpeciesCsv()).toBeNull();
    a.queueSpeciesOpen('code,species\nA,Alpha\n');
    expect((await a.openSpeciesCsv())?.text).toContain('Alpha');
  });

  it('records saved sessions and exports with their chosen targets', async () => {
    const a = new InMemoryPlatformAdapter();

    // cancelled save: no target queued
    expect(await a.saveSessionAs('{}', 'session.json')).toBeNull();
    expect(a.savedSessions).toHaveLength(0);

    a.queueSaveTarget({ id: '/out/reef.json', name: 'reef.json' });
    const ref = await a.saveSessionAs('{"x":1}', 'session.json');
    expect(ref?.id).toBe('/out/reef.json');
    expect(a.savedSessions).toEqual([{ ref, text: '{"x":1}' }]);

    // overwrite path (no dialog)
    await a.saveSession(ref!, '{"x":2}');
    expect(a.savedSessions[1]).toEqual({ ref, text: '{"x":2}' });

    a.queueSaveTarget({ id: '/out/reef.csv', name: 'reef.csv' });
    await a.exportCsv('h1,h2\n', 'reef.csv');
    expect(a.exportedCsvs[0]?.text).toBe('h1,h2\n');
  });

  it('saveSession throws PlatformIOError when the adapter cannot overwrite', async () => {
    const a = new InMemoryPlatformAdapter({ canOverwrite: false });
    await expect(
      a.saveSession({ id: '/s.json', name: 's.json' }, '{}')
    ).rejects.toThrow(PlatformIOError);
  });

  it('picked images become loadable; unknown images throw PlatformIOError', async () => {
    const a = new InMemoryPlatformAdapter();
    a.queueImagePick([
      { id: '/img/a.jpg', name: 'a.jpg' },
      { id: '/img/b.jpg', name: 'b.jpg' },
    ]);

    const picked = await a.pickImages();
    expect(picked.map((r) => r.name)).toEqual(['a.jpg', 'b.jpg']);
    await expect(a.loadImage(picked[0]!)).resolves.toBe('memory:///img/a.jpg');

    await expect(a.loadImage({ id: '/img/gone.jpg', name: 'gone.jpg' })).rejects.toThrow(
      PlatformIOError
    );
    expect(await a.pickImages()).toEqual([]); // cancel
  });

  it('relinkImage: queued answer becomes loadable, null means declined', async () => {
    const a = new InMemoryPlatformAdapter();
    const missing = { id: '/old/a.jpg', name: 'a.jpg' };

    expect(await a.relinkImage(missing)).toBeNull();

    a.queueRelink({ id: '/new/a.jpg', name: 'a.jpg' });
    const relinked = await a.relinkImage(missing);
    expect(relinked?.id).toBe('/new/a.jpg');
    await expect(a.loadImage(relinked!)).resolves.toBe('memory:///new/a.jpg');
  });

  it('settings round-trip; null when never saved', async () => {
    const a = new InMemoryPlatformAdapter();
    expect(await a.loadSettings()).toBeNull();
    await a.saveSettings({ numOfSampleRows: 5, numOfSampleCols: 5 });
    expect(await a.loadSettings()).toEqual({ numOfSampleRows: 5, numOfSampleCols: 5 });
  });
});
