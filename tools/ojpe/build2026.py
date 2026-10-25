#!/usr/bin/env python3
"""Adds the 2026 cycle to bluebook.json from cached html/2026 pages; adds appointed.by (only when a page prints it) for every entry.
Idempotent: re-running replaces the 2026 cycle and the by-fields. Usage: python3 build2026.py [--dry]"""
import sys, re, json, glob, os, collections, unicodedata
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ojpelib import *
HERE = os.path.dirname(os.path.abspath(__file__)); DRY = '--dry' in sys.argv
BASE = 'https://judicialperformance.colorado.gov'
bb = json.load(open(HERE + '/bluebook.json'))
roster = json.load(open(HERE + '/../../data/roster-2026-10-15.json'))['judges']
roster_a = json.load(open(HERE + '/../../data/roster-appellate-2026-10-15.json'))['judges']
def alnum(s): return re.sub(r'[^a-z]', '', ascii_(s).lower())
SUFFIX = re.compile(r',?\s+(Jr\.?|Sr\.?|III|II|IV)$', re.I)
def split_name(n):   # "First Middle Last[, Jr.]" -> (first, last); a quoted nickname joins first with "|"
    nick = re.findall(r'["\u201c](\w+)["\u201d]', n); n = re.sub(r'["\u201c][^"\u201d]*["\u201d]', '', n)
    n = SUFFIX.sub('', n.replace('Honorable', '').strip()); w = n.split()
    return ('|'.join([w[0]] + nick), w[-1]) if w else ('', '')
def first_ok(a, b):
    def one(x, y):
        x, y = alnum(x), alnum(y)
        return bool(x and y and (x == y or (len(x) == 1 and y[0] == x) or (len(y) == 1 and x[0] == y)))
    return any(one(x, y) for x in a.split('|') for y in b.split('|'))
def dist_of(court):
    m = re.match(r'(\w+(?:-\w+)?) Judicial District', court or '')
    return ORD.get(m.group(1)) if m else None
def county_of(court):
    m = re.search(r' - (.+?) County', court or ''); return m.group(1).lower() if m else None
def court_consistent(c1, c2):
    a1 = bool(re.search(r'Supreme|Appeals', c1 or '')); a2 = bool(re.search(r'Supreme|Appeals', c2 or ''))
    if a1 or a2: return a1 and a2
    d1, d2 = dist_of(c1), dist_of(c2)
    eq = {18: {18, 23}, 23: {18, 23}}
    if d1 is None and not a1 and c1 and 'Judicial District' not in c1: return True   # old court field blank/garbled: name decides
    return d1 is not None and d2 is not None and (d2 in eq.get(d1, {d1}))
def roster_match(name, court):
    """strict as before: last name AND first name/initial AND same court (appellate) or same judicial district/county."""
    f, l = split_name(name); out = []
    for i, j in enumerate(roster):
        jf, jl = split_name(j['name'])
        if alnum(jl) != alnum(l) or not first_ok(f, jf): continue
        d = dist_of(court); cty = county_of(court)
        if d is not None and (str(j.get('district')) == str(d) or (d in (18, 23) and str(j.get('district')) in ('18', '23'))):
            if j.get('court_level') == 'county' and cty and j.get('county') and cty != j['county'].lower() and 'County Court' in (court or ''): continue
            out.append(204 + i)
    for i, j in enumerate(roster_a):
        jf, jl = split_name(j['name'])
        if alnum(jl) == alnum(l) and first_ok(f, jf) and re.search(r'Supreme|Appeals', court or ''): out.append(574 + i)
    return out
def slugify(s): return re.sub(r'[^a-z0-9]+', '-', ascii_(s).lower()).strip('-')
def url_slug(u): return re.sub(r'-?\d{4}-evaluation$', '', u.rsplit('/', 1)[-1])

# ---------- listing (recommendation words exactly as the state's listing prints them)
lh = open(HERE + '/html/2026/_full-list.html').read()
secs = [(m.start(), clean(m.group(1))) for m in re.finditer(r'<button[^>]*accordion-button[^>]*>(.*?)</button>', lh, re.S)]
listing = {}
for m in re.finditer(r'<tr>\s*<td[^>]*>.*?href="([^"]*2026-evaluation)"[^>]*>(.*?)</a>.*?</td>\s*<td[^>]*>(.*?)</td>', lh, re.S):
    listing[m.group(1)] = dict(section=[s for p, s in secs if p < m.start()][-1], name=clean(m.group(2)), rec=clean(m.group(3)))
flog = {}
for l in open(HERE + '/html/2026/_fetch-log.txt'):
    p = l.split(); flog[p[2]] = p[1]            # listing slug -> final URL
# ---------- index existing entries
by_urlslug = collections.defaultdict(list)
for e in bb:
    for c in e['cycles']: by_urlslug[url_slug(c['url'])].append(e)
    for s in [e['slug']] + e.get('merged_slugs', []): by_urlslug[s].append(e)
report = dict(new=[], merged_by_url=[], merged_by_name=[], name_court_conflict=[], no_official=[], does_not_meet=[], footnote=[])
n_new = 0
for lurl, L in sorted(listing.items()):
    lslug = lurl.rsplit('/', 1)[-1]; f = HERE + '/html/2026/' + lslug + '.html'
    final = flog.get(lslug, lurl); h = open(f).read(); P = parse_page(h)
    assert P['retention_year'] == 2026 and P['rec_on_page'], f
    t = P['text']; court = P['court']; honorable = P['honorable'].replace('Honorable', '').strip()
    rec = L['rec'].split('**')[0].strip()
    if '**' in L['rec']: report['footnote'].append((honorable, L['rec']))
    v, m = vote_of(t)
    rq = words_window(t, r'(?:DOES NOT )?MEETS? PERFORMANCE STANDARDS')
    cyc = dict(year=2026, recommendation=rec, recommendation_quote=rq, vote=v, vote_quote=vote_quote(t) if v else None, url=final, page=None,
               report_pdf=None, court_printed=court, recommendation_on_page=P['rec_on_page'])
    if not v:
        pm = re.search(r'vote of (\d{2,})\b', t[:700])
        mm = next((re.match('(.*)', x) for x in sentences(t[:900]) if re.search(r'\bvot(?:ed|e|es|ing)\b', x) and re.search(r'\d|[Ss]even|[Ee]ight|[Ff]our|[Ff]ive|[Ss]ix|[Nn]ine|[Zz]ero', x)), None)
        cyc['note'] = 'no "N-M" vote printed' + ('; text prints "vote of %s"' % pm.group(1) if pm else '') + ('; narrative says: "%s"' % ' '.join(mm.group(0).split()[:25]) if mm else '')
        if mm: cyc['vote_quote'] = ' '.join(mm.group(0).split()[:25])
    if '**' in L['rec']:
        sm = re.search(r'State Commission on Judicial Performance agrees by a vote of (\d+)-(\d+)', t)
        if sm:
            cyc['vote'] = f'{sm.group(1)}-{sm.group(2)}'; cyc['vote_quote'] = words_window(t, r'State Commission on Judicial Performance agrees')
        dm = re.search(r'The Commission voted (\d+) to (\d+) that Judge[^.]*does not meet performance standards\.', t)
        if dm: cyc['district_commission'] = dict(recommendation='Does Not Meet Performance Standards', vote=f'{dm.group(1)}-{dm.group(2)}', vote_quote=' '.join(dm.group(0).split()[:25]),
                 quote2=words_window(t, r'finds that the Honorable Judge[^.]*Does Not Meet Performance Standards'))
        cyc['note'] = 'listing prints "' + L['rec'].replace('**', '').strip() + '": the State Commission issued its own narrative after a Rule 21 complaint; the figures above are the State Commission\'s, the district commission separately found Does Not Meet'
        v = cyc['vote']
    ret = [x for x in P['pdfs'] if x[0].startswith('2026')]
    if ret: cyc['report_pdf'] = ret[0][1] if ret[0][1].startswith('http') else BASE + ret[0][1]
    # match
    hits = {id(e): e for k in (url_slug(final), url_slug(lurl)) for e in by_urlslug.get(k, [])}
    ent = None
    if len(hits) == 1: ent = list(hits.values())[0]; report['merged_by_url'].append(honorable)
    elif len(hits) > 1: print('AMBIG url', honorable, [e['slug'] for e in hits.values()])
    else:
        f1, l1 = split_name(honorable); cands = []
        for e in bb:
            ef, el = split_name(e['name_on_report'])
            if alnum(el) == alnum(l1) and first_ok(f1, ef): cands.append(e)
        ok = [e for e in cands if court_consistent(e['court_on_report'], court)]
        if len(ok) == 1: ent = ok[0]; report['merged_by_name'].append((honorable, ent['slug'], ent['court_on_report'], court))
        elif cands: report['name_court_conflict'].append((honorable, court, [(e['slug'], e['court_on_report'], e['official_id']) for e in cands]))
    ap_y, ap_s, ap_b = appointed_year(t)
    by, byq = appointed_by(t)
    if ent is None:
        first, last = split_name(honorable); ln = honorable.replace(first, '', 1).strip() if False else last
        slug = slugify(P['h1'].split(' 2026 Evaluation')[0].split(',')[0]) + '-' + slugify(P['h1'].split(',')[1].split()[0]) if ',' in P['h1'] else slugify(honorable)
        used = {e['slug'] for e in bb}
        if slug in used: slug = slug + '-' + slugify(P['h1'].split(',')[1].split()[1][:1] if len(P['h1'].split(',')[1].split()) > 1 else 'x'); 
        ids = roster_match(honorable, court)
        ent = dict(slug=slug, official_id=ids[0] if len(ids) == 1 else None, name_on_report=honorable, court_on_report=court, cycles=[], appointed=None)
        if len(ids) > 1: ent['possible_official_ids'] = ids
        bb.append(ent); report['new'].append(honorable); n_new += 1
    else:
        if not ent.get('official_id') and not ent.get('possible_official_ids'):
            ids = roster_match(honorable, court)
            if len(ids) == 1: ent['official_id'] = ids[0]
    ent['cycles'] = [c for c in ent['cycles'] if c['year'] != 2026]; ent['cycles'].insert(0, cyc)
    if not ent.get('official_id') and not ent.get('possible_official_ids'): report['no_official'].append((honorable, court))
    if ap_y and not (ent.get('appointed') or {}).get('year'):
        prev = ent.get('appointed') or {}
        ent['appointed'] = dict(year=ap_y, court=None, quote=' '.join(ap_s.split()[:25]), basis=ap_b, court_match='no court named', note='from 2026 page', from_cycle=2026)
        if prev:   # was null with competing candidates: keep what the earlier extraction recorded
            ent['appointed']['earlier_extraction'] = {k: v for k, v in prev.items() if k not in ('by', 'by_quote', 'by_url', 'by_cycle')}
    if 'DOES NOT' in rec.upper(): report['does_not_meet'].append((honorable, court, cyc['vote'], rq, final, cyc.get('vote_quote')))

# loose pass (never sets official_id): same first name + same district + a name part of the last name shared
for e in bb:
    if e.get('official_id') or e.get('possible_official_ids') or not any(c['year'] == 2026 for c in e['cycles']): continue
    f, l = split_name(e['name_on_report']); d = dist_of(e['court_on_report']); poss = []
    for i, j in enumerate(roster):
        jf, jl = split_name(j['name'])
        if first_ok(f, jf) and str(j.get('district')) == str(d) and set(re.split(r'[- ]', ascii_(l).lower())) & set(re.split(r'[- ]', ascii_(jl).lower())): poss.append(204 + i)
    if poss: e['possible_official_ids'] = poss; e.setdefault('note', 'official_id left empty: same first name and district, last name only partly equal (%s)' % l)
# ---------- appointed.by from every cached page of every cycle (newest cycle first); only what the page prints
def page_file(e, c): return find_page(HERE, e, c)
n_by = 0; n_pages = 0
for e in bb:
    ap = e.get('appointed')
    for c in sorted(e['cycles'], key=lambda c: -c['year']):
        pf = page_file(e, c)
        if not pf: continue
        n_pages += 1; t = parse_page(open(pf).read())['text']
        by, q = appointed_by(t)
        if by:
            if ap is None: ap = e['appointed'] = dict(year=None, court=None, quote=None, basis=None, court_match=None)
            ap.update(by=by, by_quote=q, by_url=c['url'], by_cycle=c['year']); n_by += 1; break
        elif ap: 
            for k in ('by', 'by_quote', 'by_url', 'by_cycle'): ap.pop(k, None)
print('pages read for by:', n_pages, '| entries with appointed.by:', n_by)
if not DRY:
    json.dump(bb, open(HERE + '/bluebook.json', 'w'), indent=1, ensure_ascii=False)
json.dump(report, open(HERE + '/_report2026.json', 'w'), indent=1, ensure_ascii=False)
print({k: len(v) for k, v in report.items()}, 'entries now', len(bb))
