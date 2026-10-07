import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { check, scoreXml } from '../../server/omrcheck.mjs';

export { check, scoreXml, unzip } from '../../server/omrcheck.mjs';

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  for (const file of process.argv.slice(2)) {
    const r = check(scoreXml(readFileSync(file)));
    const pct = (n) => `${Math.round((n * 100) / Math.max(1, r.measures))}%`;
    console.log(`${basename(file)}
  key ${r.keys.join(', ') || '0'} · time ${r.times.join(', ')} · ${r.measures} measures · ${r.notes} notes
  measures with wrong length: ${r.wrongLength.length} (${pct(r.wrongLength.length)}) ${r.wrongLength.slice(0, 20).join(' ')}
  measures with a silent staff: ${r.emptyStaff.length} ${r.emptyStaff.slice(0, 20).join(' ')}`);
  }
}
