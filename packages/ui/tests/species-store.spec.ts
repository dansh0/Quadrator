import { CsvParseError, InMemoryPlatformAdapter } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSpeciesStore } from '../src/stores/species.ts';
import { SPECIES_CSV } from './helpers.ts';

describe('species store', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('loadFromFile parses entries and persists CSV text + preference', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSpeciesOpen(SPECIES_CSV);

    const store = useSpeciesStore();
    expect(await store.loadFromFile(platform)).toBe(true);
    expect(store.codes).toEqual(['Ulva', 'Barn', 'Myt']);

    const persisted = (await platform.loadSettings()) as { speciesCsvText: string };
    expect(persisted.speciesCsvText).toBe(SPECIES_CSV);
  });

  it('init restores the persisted button set; corrupt text degrades to empty', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: false, speciesCsvText: SPECIES_CSV });

    const store = useSpeciesStore();
    await store.init(platform);
    expect(store.codes).toEqual(['Ulva', 'Barn', 'Myt']);
    expect(store.hotkeysEnabled).toBe(false);

    await platform.saveSettings({ hotkeysEnabled: true, speciesCsvText: 'not,a\nbuttons file' });
    const store2 = useSpeciesStore();
    store2.$reset();
    await store2.init(platform);
    expect(store2.entries).toEqual([]);
  });

  it('a malformed chosen file throws and leaves the current set untouched', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSpeciesOpen(SPECIES_CSV);
    const store = useSpeciesStore();
    await store.loadFromFile(platform);

    platform.queueSpeciesOpen('wrong,header\n1,2\n');
    await expect(store.loadFromFile(platform)).rejects.toThrow(CsvParseError);
    expect(store.codes).toEqual(['Ulva', 'Barn', 'Myt']);

    // cancel is a plain false
    expect(await store.loadFromFile(platform)).toBe(false);
  });

  it('maps codes to hotkeys in button order', async () => {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSpeciesOpen(SPECIES_CSV);
    const store = useSpeciesStore();
    await store.loadFromFile(platform);

    expect(store.hotkeyFor('Ulva')).toBe('q');
    expect(store.hotkeyFor('Barn')).toBe('w');
    expect(store.codeForKey('e')).toBe('Myt');
    expect(store.codeForKey('9')).toBeNull();
    expect(store.hotkeyFor('nope')).toBeNull();
  });

  it('setHotkeysEnabled persists without clobbering other settings keys', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ hotkeysEnabled: true, speciesCsvText: null, futureKey: 42 });

    const store = useSpeciesStore();
    await store.init(platform);
    await store.setHotkeysEnabled(platform, false);

    const persisted = (await platform.loadSettings()) as Record<string, unknown>;
    expect(persisted['hotkeysEnabled']).toBe(false);
    expect(persisted['futureKey']).toBe(42); // passthrough keys survive
  });
});
