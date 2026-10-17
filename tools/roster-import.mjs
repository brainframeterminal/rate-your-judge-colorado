// Replace the invented pilot people with REAL Colorado officials.
//   node tools/roster-import.mjs <roster.json> [--wipe-demo] [--dry]
// roster.json (built from official sources only): { judges: [{ name, court_level: district|county, district, county|null, court_id|null,
//   title, source_url, source_date }] (+ court_level 'appellate' with prefix 'Justice'|'Judge' and a display title), district_attorneys: [{ name, district, source_url }],
//   deputy_prosecutors: [{ name, title, district, county|null, source_url, source_date }] }
// - a judge with a known county sits at that county's courthouse; a district judge with no county is listed at every
//   courthouse of the district (scope 'district'); the elected DA is listed at every courthouse of the district.
// - --wipe-demo deletes every demo person AND all their ratings, votes, reports and moderation entries, so no pilot
//   number can land on a real official. Uses DATABASE_URL on the server, else JUDEX_DB, else data/judex.db.
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from '../db.js';

const args = process.argv.slice(2), file = args.find(a => !a.startsWith('--')), DRY = args.includes('--dry'), WIPE = args.includes('--wipe-demo');
if (!file) { console.error('usage: node tools/roster-import.mjs <roster.json> [--wipe-demo] [--dry]'); process.exit(2); }
const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const courts = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'courts.json'), 'utf8'));
const byId = new Map(courts.map(c => [c.id, c])), byCounty = new Map(courts.map(c => [String(c.county || '').toLowerCase(), c]));
const seatOf = d => courts.filter(c => String(c.district) === String(d)).sort((a, b) => a.id.localeCompare(b.id))[0];
const R = JSON.parse(fs.readFileSync(file, 'utf8'));
const db = await openDb({ url: process.env.DATABASE_URL, file: process.env.JUDEX_DB || path.join(ROOT, 'data', 'judex.db') });
const today = new Date().toISOString().slice(0, 10);

if (WIPE) {
  const demo = (await db.prepare('SELECT id FROM officials WHERE demo = 1').all()).map(r => r.id);
  const revs = demo.length ? (await db.prepare(`SELECT id FROM reviews WHERE official_id IN (${demo.map(() => '?').join(',')})`).all(...demo)).map(r => r.id) : [];
  console.log(`demo people ${demo.length}, their reviews ${revs.length}`);
  if (!DRY) {
    const inList = (ids, sql) => ids.length ? db.prepare(sql.replace('IN (?)', `IN (${ids.map(() => '?').join(',')})`)).run(...ids) : null;
    for (const t of ['votes', 'reports', 'mod_log']) await inList(revs, `DELETE FROM ${t} WHERE review_id IN (?)`);
    await inList(demo, 'DELETE FROM reviews WHERE official_id IN (?)');
    await inList(demo, 'DELETE FROM appeals WHERE official_id IN (?)');
    await db.prepare('DELETE FROM officials WHERE demo = 1').run();
  }
}

const have = new Set((await db.prepare('SELECT name, court_id FROM officials').all()).map(o => o.name + '|' + o.court_id));
const ins = db.prepare('INSERT INTO officials (court_id, type, name, demo, scope, source, checked, title) VALUES (?,?,?,0,?,?,?,?)');
let n = 0, skip = 0;
const add = async (court, type, name, scope, src, title = '') => {
  if (!court || !name) { skip++; console.log('SKIP (no court/name)', type, name); return; }
  if (have.has(name + '|' + court.id)) return;
  have.add(name + '|' + court.id); n++;
  if (!DRY) await ins.run(court.id, type, name, scope, src || '', today, title);
};
for (const j of R.judges || []) {
  const nm = String(j.name || '').trim().replace(/^(Hon\.?|Honorable|Judge|Justice)\s+/i, '');
  if (!nm || /magistrate|senior|retired|referee/i.test(j.title || '')) { skip++; continue; }
  const court = (j.court_id && byId.get(j.court_id)) || (j.county && byCounty.get(String(j.county).toLowerCase())) || null;
  if (j.court_level === 'appellate') { await add(court, 'judge', (j.prefix || 'Judge') + ' ' + nm, 'court', j.source_url, j.title || ''); continue; }   // Supreme Court / Court of Appeals: title shown instead of the building
  if (court) await add(court, 'judge', 'Judge ' + nm, 'court', j.source_url);
  else await add(seatOf(j.district), 'judge', 'Judge ' + nm, 'district', j.source_url);
}
for (const d of R.district_attorneys || []) {
  const nm = String(d.name || '').trim();
  await add(seatOf(d.district), 'prosecutor', 'District Attorney ' + nm, 'district', d.source_url || d.office_url);
}
// deputy district attorneys: official sources only, each verified; a known county office = that county's
// courthouse, otherwise the whole district (like the elected DA). Rank is kept in the source file, the name says "Deputy DA".
for (const p of R.deputy_prosecutors || []) {
  const nm = String(p.name || '').trim().replace(/^(Chief |Senior |Assistant )*(Deputy )?(District Attorney|DA)\s+/i, '');
  const court = (p.county && byCounty.get(String(p.county).toLowerCase())) || null;
  if (court && String(court.district) === String(p.district)) await add(court, 'prosecutor', 'Deputy DA ' + nm, 'court', p.source_url);
  else await add(seatOf(p.district), 'prosecutor', 'Deputy DA ' + nm, 'district', p.source_url);
}
console.log(`${DRY ? 'would add' : 'added'} ${n} real officials, skipped ${skip}`);
await db.close();
