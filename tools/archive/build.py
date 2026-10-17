#!/usr/bin/env python3
"""Our own copies of the court documents the site links to. Builds data/archive/{coa,ojpe}/ + manifest.json from the local caches:
  coa  ← ~/.cache/ryg-coa/pdf (the weekly Court of Appeals announcements behind every appeals/opinions row)
  ojpe ← tools/ojpe/2024-report-urls.tsv + the PDFs fetched for it (state judicial-performance survey reports)
manifest.json = [{dir, name, url (official, no #fragment), sha256, bytes, saved}] — the server maps url → /archive/<dir>/<name>.
Run:  python3 tools/archive/build.py [--ojpe-dir DIR]     then tools/archive/sync.sh uploads what the server lacks."""
import hashlib, json, os, re, shutil, sys, urllib.parse, datetime
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, 'data', 'archive'); COA = os.path.expanduser('~/.cache/ryg-coa')
BASE = 'https://www.coloradojudicial.gov'
san = lambda s: re.sub(r'[^\w.-]', '_', s)
def add(rows, d, name, url, src):
    os.makedirs(os.path.join(OUT, d), exist_ok=True); dst = os.path.join(OUT, d, name)
    if not os.path.exists(dst) or os.path.getsize(dst) != os.path.getsize(src): shutil.copy2(src, dst)
    b = open(dst, 'rb').read()
    rows.append({'dir': d, 'name': name, 'url': url, 'sha256': hashlib.sha256(b).hexdigest(), 'bytes': len(b),
                 'saved': datetime.datetime.fromtimestamp(os.path.getmtime(src)).strftime('%Y-%m-%d')})
rows = []
# coa: the cache file name is san(unquote(path after /files/)) — same rule as collect_coa.py text_of()
links = {}
for e in json.load(open(os.path.join(COA, 'entries.json'))):
    u = e['source'].split('#')[0]; links[san(urllib.parse.unquote(u.split('/files/')[1]))] = u
for name in sorted(os.listdir(os.path.join(COA, 'pdf'))):
    if not name.endswith('.pdf'): continue
    url = links.get(name)
    if not url: print('no official url for', name, file=sys.stderr); continue
    add(rows, 'coa', name, url, os.path.join(COA, 'pdf', name))
# ojpe: survey reports (only those whose PDF was fetched)
od = sys.argv[sys.argv.index('--ojpe-dir') + 1] if '--ojpe-dir' in sys.argv else None
tsv = os.path.join(ROOT, 'tools', 'ojpe', '2024-report-urls.tsv')
old = {(r['dir'], r['name']): r for r in json.load(open(os.path.join(OUT, 'manifest.json')))} if os.path.exists(os.path.join(OUT, 'manifest.json')) else {}
if not od:   # the weekly refresh has no OJPE folder: carry the reports already archived over unchanged
    rows += [r for (d, n), r in old.items() if d == 'ojpe' and os.path.exists(os.path.join(OUT, d, n))]
if od and os.path.exists(tsv):
    for line in open(tsv):
        slug, url = line.rstrip('\n').split('\t'); src = os.path.join(od, slug + '.pdf')
        if os.path.exists(src): add(rows, 'ojpe', 'ojpe-2024-' + slug + '.pdf', url, src)
json.dump(rows, open(os.path.join(OUT, 'manifest.json'), 'w'), indent=0)
print(f"archive: {sum(r['dir']=='coa' for r in rows)} coa + {sum(r['dir']=='ojpe' for r in rows)} ojpe files, {sum(r['bytes'] for r in rows)/1e6:.1f} MB → {OUT}")
