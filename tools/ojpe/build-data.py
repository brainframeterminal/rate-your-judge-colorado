#!/usr/bin/env python3
"""bluebook.json (OJPE extraction, 10-23) → data/ojpe.json, what the server reads: for each official on the site, the state's
retention-evaluation result per cycle and the year they took the bench, each with the state page it came from.

    python3 tools/ojpe/build-data.py      # writes data/ojpe.json; prints counts
Recommendation codes: meets (2016 wording "Retain") · not ("Does not meet performance standards", 2016 "Do not retain") · '' unknown.
Never guesses: an unmatched report or a missing field stays out."""
import json, os, re
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(os.path.dirname(HERE))
MONTHS = {m: i for i, m in enumerate(['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'], 1)}

def code(rec):
    r = (rec or '').upper()
    if 'NOT' in r and ('MEET' in r or 'RETAIN' in r): return 'not'
    if 'MEET' in r or r.strip() == 'RETAIN': return 'meets'
    return ''

def exact_day(quote, year):   # "took the bench October 1, 2023" → 2023-10-01 when the quote prints the day of THAT year
    m = re.search(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),\s+(\d{4})', quote or '', re.I)
    if m and int(m.group(3)) == year: return f'{year}-{MONTHS[m.group(1).lower()]:02d}-{int(m.group(2)):02d}'
    return None

# manual-matches.json: reports the strict matcher left out (nickname, spelling, or a judge whose court on our site differs), checked by hand 10-23
MANUAL = {m['name_on_report']: m['official_id'] for m in json.load(open(os.path.join(HERE, 'manual-matches.json')))}
MOVED = {m['name_on_report'] for m in json.load(open(os.path.join(HERE, 'manual-matches.json'))) if 'court differs' in m['why']}   # evaluated at an earlier court: say which
out = {}
for x in json.load(open(os.path.join(HERE, 'bluebook.json'))):
    oid = x.get('official_id') or MANUAL.get(x['name_on_report'])
    if not oid: continue
    rec = out.setdefault(str(oid), {'cycles': []})   # one judge can appear as two entries (a spelling change between cycles): merge them
    for c in x['cycles']:
        if code(c.get('recommendation')) and not any(o['year'] == c['year'] for o in rec['cycles']):
            rec['cycles'].append({'year': c['year'], 'rec': code(c.get('recommendation')), 'vote': c.get('vote'), 'url': c['url'],
                                  **({'vote_text': c['vote_quote'][:220]} if not c.get('vote') and c.get('vote_quote') and re.search(r'\bvoted\b', c['vote_quote']) else {}),
                                  **({'as': x['court_on_report']} if x['name_on_report'] in MOVED else {})})
    rec['cycles'].sort(key=lambda c: -c['year'])
    ap = x.get('appointed') or {}
    if ap.get('year') and not rec.get('appointed'):
        src = next((c['url'] for c in sorted(x['cycles'], key=lambda c: -c['year'])), None)
        rec['appointed'] = {'year': ap['year'], 'day': exact_day(ap.get('quote'), ap['year']), 'url': src}
# ---- the latest survey table per judge (printed numbers only), with the judicial district's 2020 Census population
SURVEYS = json.load(open(os.path.join(HERE, 'surveys.json'))) if os.path.exists(os.path.join(HERE, 'surveys.json')) else {}
POP = json.load(open(os.path.join(HERE, 'district-population.json'))) if os.path.exists(os.path.join(HERE, 'district-population.json')) else None
ORD = {w: i for i, w in enumerate('first second third fourth fifth sixth seventh eighth ninth tenth eleventh twelfth thirteenth fourteenth fifteenth sixteenth seventeenth eighteenth nineteenth twentieth twenty-first twenty-second twenty-third'.split(), 1)}
as_int = lambda v: int(str(v).replace(',', '')) if re.fullmatch(r'[\d,]+', str(v or '').strip()) else None

def survey_of(slugs, court_text):
    best = None
    for slug in slugs:
        for y, v in (SURVEYS.get(slug) or {}).items():
            rows = v.get('rows') or []
            if not rows or (best and int(y) <= best[0]): continue
            main, extra, total = [], [], None
            for r in rows:
                s, a, w = as_int(r.get('sent')), as_int(r.get('answered')), r.get('method_words') or ''
                if r['group'] == 'total': total = a; continue
                if int(y) >= 2024:
                    if re.search(r'^attorney email', w, re.I) and s: main.append({'group': 'attorneys', 'sent': s, 'answered': a or 0, 'method': w})
                    elif re.search(r'^non-attorney email', w, re.I) and s: main.append({'group': 'non-attorneys', 'sent': s, 'answered': a or 0, 'method': w})
                    elif not re.search(r'^total', r['group']) and (a or s): extra.append({'label': w, 'sent': s, 'answered': a or 0})
                elif r['group'] in ('attorneys', 'total_non_attorneys') and s:
                    main.append({'group': 'attorneys' if r['group'] == 'attorneys' else 'non-attorneys', 'sent': s, 'answered': a or 0, 'method': w,
                                 **({'undeliverable': as_int(r.get('undeliverable_or_na'))} if as_int(r.get('undeliverable_or_na')) is not None else {})})
            if main:
                counted = sum(g['answered'] for g in main) + sum(e['answered'] for e in extra)
                if total is not None and total > counted: extra.append({'key': 'sv.rest', 'label': "Other answers counted in the report's total", 'sent': None, 'answered': total - counted})   # e.g. 2022 non-attorneys without a printed invitation count
                best = (int(y), {'year': int(y), 'pdf': v['pdf'], 'local': v.get('local'), 'page_url': v.get('page_url'), 'groups': main, 'extra': extra,
                                 'answered_total': total if total is not None else counted})
    if not best: return None
    sv = best[1]
    m = re.match(r'\s*([A-Za-z-]+)\s+Judicial District', court_text or '')
    n = ORD.get(m.group(1).lower()) if m else None
    if POP and n:
        key = '18_as_of_2024' if n == 18 and sv['year'] <= 2024 else str(n)
        d = POP['districts'].get(key)
        if d: sv['district'] = {'number': n, 'year': sv['year'], 'population': d['pop_2020'], 'counties': [c['county'] for c in d.get('counties', [])], 'source': POP['population_source']['url']}
    return sv

ENTRIES = {}
for x in json.load(open(os.path.join(HERE, 'bluebook.json'))):
    oid = x.get('official_id') or MANUAL.get(x['name_on_report'])
    if oid: ENTRIES.setdefault(str(oid), []).append(x)
for oid, xs in ENTRIES.items():
    if oid not in out: continue
    latest = max((c for x in xs for c in x['cycles']), key=lambda c: c['year'], default={})
    court = next((x['court_on_report'] for x in xs if x.get('court_on_report')), '') if not re.search('Judicial District', latest.get('court_printed') or '') else latest['court_printed']
    sv = survey_of([x['slug'] for x in xs], court)
    if sv: out[oid]['survey'] = sv
    by = next((x['appointed'].get('by') for x in xs if (x.get('appointed') or {}).get('by')), None)
    if by and out[oid].get('appointed'): out[oid]['appointed']['by'] = by

for cn in json.load(open(os.path.join(HERE, 'cycle-notes.json'))):   # a cycle the one-word result cannot describe (hand-checked)
    for c in out.get(str(cn['official_id']), {}).get('cycles', []):
        if c['year'] == cn['year']: c['note'] = {'en': cn['en'], 'es': cn['es']}
for ov in json.load(open(os.path.join(HERE, 'appointed-overrides.json'))):   # the state's own pages disagree on the year: show none
    if ov.get('drop_appointed') and str(ov['official_id']) in out: out[str(ov['official_id'])].pop('appointed', None)
out = {k: v for k, v in out.items() if v['cycles'] or v.get('appointed')}
json.dump(out, open(os.path.join(ROOT, 'data', 'ojpe.json'), 'w'), indent=0, sort_keys=True)
print(len(out), 'officials;', sum(1 for v in out.values() if v['cycles']), 'with a result;', sum(1 for v in out.values() if v.get('appointed')), 'with a year on the bench;',
      sum(1 for v in out.values() if v.get('appointed', {}).get('day')), 'with the exact day;', [k for k, v in out.items() if any(c['rec'] == 'not' for c in v['cycles'])], 'not meets')
