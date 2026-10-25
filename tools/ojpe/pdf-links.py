#!/usr/bin/env python3
"""Lists every judge-year retention survey PDF the state links (from cached pages) -> pdf-jobs.tsv (year, slug, url, local) and
surveys-interim-links.json (interim reports, listed only). Run after build2026.py."""
import sys, os, json, re, glob, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ojpelib import *
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = 'https://judicialperformance.colorado.gov'
bb = json.load(open(HERE + '/bluebook.json')); jobs = []; interim = {}; insuff = {}; nopage = []
def pf(e, c): return find_page(HERE, e, c)
for e in bb:
    for c in e['cycles']:
        y = c['year']; f = pf(e, c)
        if not f:
            nopage.append((e['slug'], y, c['url'])); continue
        P = parse_page(open(f).read())
        ret = [p for p in P['pdfs'] if re.match(rf'{y}\s*Retention', p[0])]
        for lab, href in P['pdfs']:
            if re.search('Interim', lab): interim.setdefault(e['slug'], {})[re.match(r'(\d{4})', lab).group(1)] = urllib.parse.urljoin(BASE, href)
        if P['insufficient_raw'] and not any(re.match(rf'{y}\s*Retention', q[0]) for q in P['pdfs']): insuff.setdefault(e['slug'], {})[y] = dict(page=c['url'], printed=[x.lstrip('* ').strip() for x in P['insufficient_raw']])
        if ret: jobs.append((y, e['slug'], urllib.parse.urljoin(BASE, ret[0][1]), f'pdf/{y}/{e["slug"]}.pdf', c['url']))
        elif c.get('report_pdf'): jobs.append((y, e['slug'], c['report_pdf'], f'pdf/{y}/{e["slug"]}.pdf', c['url']))
        else: insuff.setdefault(e['slug'], []).append(('nolink', y)) if False else None
with open(HERE + '/pdf-jobs.tsv', 'w') as fh:
    for j in sorted(jobs): fh.write('\t'.join(map(str, j)) + '\n')
json.dump(interim, open(HERE + '/surveys-interim-links.json', 'w'), indent=1)
json.dump(insuff, open(HERE + '/_insufficient.json', 'w'), indent=1)
import collections
print('jobs by year', dict(collections.Counter(j[0] for j in jobs)), '| cycle pages not cached:', len(nopage))
have = {(e['slug'], c['year']) for e in bb for c in e['cycles']}
linked = {(j[1], j[0]) for j in jobs}
print('judge-years without a retention link:', len(have - linked), sorted(have - linked)[:40])
