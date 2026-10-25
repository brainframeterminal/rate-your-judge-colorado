// Load verified appellate decisions into the `appeals` table (a trial judge's "Appeals record"), or with --table opinions
// into `opinions` (an appellate judge's own written decisions, from tools/appeals/authors.py).
//   node tools/appeals-import.mjs <file.json> [--dry] [--prune-source "COA announcement"]
//   --prune-source: after loading, delete rows from that source that are no longer in the file (the weekly refresh replaces its
//   own rows this way: insert first, prune after, so a profile never shows a half-loaded record; rows from other sources stay)
// File: [{ "official": <id> | "name": "<exact officials.name>", "court": "coa" | "csc", "case_name": "...", "citation": "2024 COA 90",
//          "decided": "YYYY-MM-DD", "outcome": "affirmed|affirmed_in_part|reversed|vacated|disapproved|remanded|dismissed", "url": "https://…opinion",
//          "note": "one plain sentence on what the higher court held", "source": "where it was verified", "checked": "YYYY-MM-DD" }]
// Rule: every row must be checked against the opinion itself before it goes in (the trial judge is named in the opinion's
// caption). Upserts by (official, citation). Uses DATABASE_URL on the server, else JUDEX_DB, else data/judex.db (same as server.js).
// The appeals table is created by server.js at start: deploy first, then import.
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';

const [file, flag] = process.argv.slice(2);
const pi = process.argv.indexOf('--prune-source'), prune = pi > 0 ? process.argv[pi + 1] : null;
const T = process.argv.includes('--table') && process.argv[process.argv.indexOf('--table') + 1] === 'opinions' ? 'opinions' : 'appeals';
if (!file) { console.error('usage: node tools/appeals-import.mjs <file.json> [--dry]'); process.exit(2); }
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
const OUT = ['affirmed', 'affirmed_in_part', 'reversed', 'vacated', 'disapproved', 'remanded', 'dismissed'];
const db = await openDb({ url: process.env.DATABASE_URL, file: process.env.JUDEX_DB || path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'data', 'judex.db') });
let ok = 0, bad = 0;
for (const r of rows) {
  const o = r.official ? await db.prepare('SELECT id, name, demo FROM officials WHERE id = ?').get(r.official)
                       : await db.prepare('SELECT id, name, demo FROM officials WHERE name = ?').get(r.name);
  const why = !o ? 'no such official' : T === 'appeals' && !['coa', 'csc'].includes(r.court) ? 'court' : !OUT.includes(r.outcome) ? 'outcome'
    : !/^\d{4}-\d\d-\d\d$/.test(r.decided || '') ? 'date' : !/^https:\/\//.test(r.url || '') ? 'url' : !r.case_name || !r.citation ? 'name/citation' : '';
  if (why) { bad++; console.log('SKIP', why, r.citation || r.case_name); continue; }
  if (flag !== '--dry') {
    if (r.source) await db.prepare(`DELETE FROM ${T} WHERE official_id = ? AND citation = ? AND source = ?`).run(o.id, r.citation, r.source);   // audit 10-25: a row of one source never replaces another's
    else await db.prepare(`DELETE FROM ${T} WHERE official_id = ? AND citation = ?`).run(o.id, r.citation);
    if (T === 'opinions') await db.prepare('INSERT INTO opinions (official_id, case_name, citation, decided, outcome, url, published, note, source, checked) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(o.id, r.case_name, r.citation, r.decided, r.outcome, r.url, r.published ? 1 : 0, r.note || '', r.source || '', r.checked || '');
    else await db.prepare('INSERT INTO appeals (official_id, court, case_name, citation, decided, outcome, url, note, source, checked) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(o.id, r.court, r.case_name, r.citation, r.decided, r.outcome, r.url, r.note || '', r.source || '', r.checked || '');
  }
  ok++; console.log(flag === '--dry' ? 'OK (dry)' : 'OK', o.name, '·', r.citation, '·', r.outcome, o.demo ? '· (demo person: hidden in production)' : '');
}
console.log(`${ok} loaded, ${bad} skipped`);
if (prune && flag !== '--dry' && !bad) {
  const keep = new Set(rows.map(r => `${r.official}|${r.citation}`));
  const old = await db.prepare(`SELECT id, official_id, citation FROM ${T} WHERE source = ?`).all(prune);
  let gone = 0; for (const a of old) if (!keep.has(`${a.official_id}|${a.citation}`)) { await db.prepare(`DELETE FROM ${T} WHERE id = ?`).run(a.id); gone++; }
  console.log(`pruned ${gone} '${prune}' rows no longer in the file`);
}
await db.close();
