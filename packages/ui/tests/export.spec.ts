import { CSV_HEADER, InMemoryPlatformAdapter, parseSpeciesCsv } from '@quadrator/core';
import { createPinia, setActivePinia } from 'pinia';
import { beforeEach, describe, expect, it } from 'vitest';
import { buildSessionCsv, exportSessionCsv } from '../src/export.ts';
import { SPECIES_CSV, seedSession, taggedQuadrat } from './helpers.ts';

const NOW = new Date('2026-07-07T12:00:00.000Z');
const species = parseSpeciesCsv(SPECIES_CSV);

describe('session CSV export', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('exports every tagged quadrat under one header, untagged rows omitted', () => {
    const q1 = taggedQuadrat('q1', 2);
    q1.samples[0]!.codes.push('Ulva', 'Barn');
    q1.samples[1]!.codes.push('Ulva');
    const q2 = taggedQuadrat('q2', 2); // untagged: contributes no rows
    const q3 = taggedQuadrat('q3', 1);
    q3.samples[0]!.codes.push('???'); // unknown code fallback
    const session = seedSession([q1, q2, q3]);

    const csv = buildSessionCsv(session, species, NOW);
    const lines = csv.trimEnd().split('\n');

    expect(lines[0]).toBe(CSV_HEADER);
    expect(lines).toHaveLength(4); // header + Ulva + Barn + unknown
    expect(lines[1]).toContain('q1,/img/q1.jpg');
    expect(lines[1]).toContain('Ulva,Ulva sp.,Algae - Intertidal,2,100');
    expect(lines[2]).toContain('Barn,Cirripedia spp,Animal - Sessile,1,50');
    expect(lines[3]).toContain('???,UNKNOWN CODE,,1,100');
    expect(csv.endsWith('\n')).toBe(true);
  });

  it('interactive export writes through the adapter; cancel returns false', async () => {
    const q = taggedQuadrat('q1', 1);
    q.samples[0]!.codes.push('Myt');
    const session = seedSession([q]);
    const platform = new InMemoryPlatformAdapter();

    expect(await exportSessionCsv(platform, session, species, NOW)).toBe(false); // cancelled

    platform.queueSaveTarget({ id: '/out/data.csv', name: 'data.csv' });
    expect(await exportSessionCsv(platform, session, species, NOW)).toBe(true);
    expect(platform.exportedCsvs[0]?.text).toBe(buildSessionCsv(session, species, NOW));
  });
});
