import {
  CsvParseError,
  HotkeyError,
  InMemoryPlatformAdapter,
  SpeciesValidationError,
} from '@quadrator/core';
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

  async function loaded(csv = SPECIES_CSV) {
    const platform = new InMemoryPlatformAdapter();
    platform.queueSpeciesOpen(csv);
    const store = useSpeciesStore();
    await store.loadFromFile(platform);
    return { platform, store };
  }

  const persistedCsv = async (platform: InMemoryPlatformAdapter) =>
    ((await platform.loadSettings()) as { speciesCsvText: string }).speciesCsvText;

  it('explicit hotkeys from the CSV win; the rest fill in around them', async () => {
    const { store } = await loaded(
      'code,species,hotkey\nUlva,Ulva sp.,\nBarn,Barnacle,q\nMyt,Mussel,\n'
    );
    expect(store.hotkeyFor('Barn')).toBe('q');
    expect(store.hotkeyFor('Ulva')).toBe('w');
    expect(store.hotkeyFor('Myt')).toBe('e');
  });

  it('loadFromFile rejects a list with duplicate codes or keys, keeping the current set', async () => {
    const { platform, store } = await loaded();
    platform.queueSpeciesOpen('code,species\nA,Alpha\nA,Again\n');
    await expect(store.loadFromFile(platform)).rejects.toThrow(SpeciesValidationError);
    platform.queueSpeciesOpen('code,species,hotkey\nA,Alpha,q\nB,Beta,q\n');
    await expect(store.loadFromFile(platform)).rejects.toThrow(/row 2, hotkey/);
    expect(store.codes).toEqual(['Ulva', 'Barn', 'Myt']);
  });

  it('init still loads a persisted list with duplicate codes, but not one with a key clash', async () => {
    const platform = new InMemoryPlatformAdapter();
    await platform.saveSettings({ speciesCsvText: 'code,species\nA,Alpha\nA,Again\n' });
    const store = useSpeciesStore();
    await store.init(platform);
    expect(store.codes).toEqual(['A', 'A']);

    await platform.saveSettings({ speciesCsvText: 'code,species,hotkey\nA,Alpha,q\nB,Beta,q\n' });
    store.$reset();
    await store.init(platform);
    expect(store.entries).toEqual([]);
  });

  it('assignHotkey binds a free key and persists it as CSV', async () => {
    const { platform, store } = await loaded();
    const change = await store.assignHotkey(platform, 'Myt', '1');
    expect(change).toEqual({ code: 'Myt', key: '1', swappedWith: null, moved: [] });
    expect(store.hotkeyFor('Myt')).toBe('1');
    expect(await persistedCsv(platform)).toContain('Myt,Mytilus sp.,Animal,Sessile,#2196f3,#1565c0,1');

    // survives a restart
    const again = useSpeciesStore();
    again.$reset();
    await again.init(platform);
    expect(again.hotkeyFor('Myt')).toBe('1');
  });

  it('taking a held key swaps the two species, explicit or automatic', async () => {
    const { platform, store } = await loaded();
    // Ulva holds q automatically; Myt (e) takes it.
    const change = await store.assignHotkey(platform, 'Myt', 'q');
    expect(change.swappedWith).toEqual({ code: 'Ulva', key: 'e' });
    expect([store.hotkeyFor('Ulva'), store.hotkeyFor('Barn'), store.hotkeyFor('Myt')]).toEqual([
      'e',
      'w',
      'q',
    ]);

    // and back again, now both explicit
    await store.assignHotkey(platform, 'Ulva', 'q');
    expect([store.hotkeyFor('Ulva'), store.hotkeyFor('Myt')]).toEqual(['q', 'e']);
  });

  it('clearing a key reports automatic keys it shifted', async () => {
    const { platform, store } = await loaded(
      'code,species,hotkey\nUlva,Ulva sp.,1\nBarn,Barnacle,\nMyt,Mussel,\n'
    );
    expect([store.hotkeyFor('Barn'), store.hotkeyFor('Myt')]).toEqual(['q', 'w']);
    const change = await store.assignHotkey(platform, 'Ulva', null);
    expect(change).toEqual({ code: 'Ulva', key: 'q', swappedWith: null, moved: ['Barn', 'Myt'] });
    expect([store.hotkeyFor('Barn'), store.hotkeyFor('Myt')]).toEqual(['w', 'e']);
  });

  it('assignHotkey refuses keys that could never be pressed', async () => {
    const { platform, store } = await loaded();
    await expect(store.assignHotkey(platform, 'Ulva', 'Enter')).rejects.toThrow(HotkeyError);
    await expect(store.assignHotkey(platform, 'nope', 'q')).rejects.toThrow(HotkeyError);
    expect(store.hotkeyFor('Ulva')).toBe('q');
  });

  it('replaceEntries validates, then persists the list as CSV', async () => {
    const { platform, store } = await loaded();
    const next = store.entries.slice(0, 2).map((e) => ({ ...e }));
    next[1]!.code = 'Barnacle';
    await store.replaceEntries(platform, next);
    expect(store.codes).toEqual(['Ulva', 'Barnacle']);
    expect(await persistedCsv(platform)).toMatch(/^code,species,group1,group2,color,colorSelected,hotkey\n/);

    next[1]!.code = 'Ulva';
    await expect(store.replaceEntries(platform, next)).rejects.toThrow(SpeciesValidationError);
    expect(store.codes).toEqual(['Ulva', 'Barnacle']);
  });
});
