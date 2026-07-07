/**
 * CSV results export: one complete file per export (header + every tagged
 * quadrat). The legacy app appended to an existing file instead; that was
 * dropped because browser shells cannot append and silent duplicate rows
 * were easy to produce — accumulate across surveys by exporting to new
 * files and concatenating deliberately.
 */
import {
  CSV_HEADER,
  PlatformAdapter,
  SessionV1,
  SpeciesEntry,
  quadratCsvRows,
} from '@quadrator/core';

export function buildSessionCsv(
  session: SessionV1,
  species: readonly SpeciesEntry[],
  now: Date = new Date()
): string {
  const lines = [CSV_HEADER];
  for (const q of session.quadrats) {
    lines.push(
      ...quadratCsvRows(
        {
          name: q.name,
          imagePath: q.imagePath,
          numOfSamples: q.samples.length,
          samples: q.samples,
        },
        species,
        now
      )
    );
  }
  return lines.join('\n') + '\n';
}

/** Interactive export of every quadrat in the session. False = cancelled. */
export async function exportSessionCsv(
  platform: PlatformAdapter,
  session: SessionV1,
  species: readonly SpeciesEntry[],
  now: Date = new Date()
): Promise<boolean> {
  const ref = await platform.exportCsv(buildSessionCsv(session, species, now), 'quadrat-data.csv');
  return ref !== null;
}
