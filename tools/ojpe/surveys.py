#!/usr/bin/env python3
"""Extract the invitation/response table printed in each OJPE survey report PDF -> surveys.json (numbers exactly as printed, nothing computed).
Usage: python3 surveys.py   (needs pdftotext; reads bluebook.json, pdf-jobs.tsv, _insufficient.json, pdf/<year>/<slug>.pdf)"""
import os, re, json, subprocess, sys, collections
HERE = os.path.dirname(os.path.abspath(__file__))
def pages(path, n=40):
    out = subprocess.run(['pdftotext', '-layout', '-l', str(n), path, '-'], capture_output=True, text=True).stdout
    return out.split('\f')
def norm(s): return re.sub(r'\s+', ' ', s).strip()
def printed_page(pg):
    m = re.search(r'Report for (?:Judge|Justice)[^\n]*?\s(\d{1,3})\s*$', pg.rstrip(), re.M)
    return m.group(1) if m else None
def group_of(label):
    l = label.lower()
    if 'total attorney' in l: return 'total_attorneys'
    if 'total non' in l: return 'total_non_attorneys'
    if 'court attorney' in l: return 'court_attorneys'
    if 'attorney survey website' in l: return 'attorneys'
    if l.startswith('attorney') or l == 'attorneys': return 'attorneys'
    if 'court staff' in l or l.startswith('staff'): return 'court_staff'
    if l.startswith('other non'): return 'other_non_attorneys'
    if 'non-attorney' in l or 'non attorney' in l: return 'non_attorneys'
    if 'citizen' in l or 'public' in l: return 'public'
    if 'juror' in l: return 'jurors'
    if l.startswith('total'): return 'total'
    return norm(label).lower().replace(' ', '_')
NUM = r'(N/A|-|[\d,]+)'
def fam_invitation(pgs):     # 2022?/2024/2026 "Invitation Sent / Number of Responses"
    for i, pg in enumerate(pgs):
        if re.search(r'Invitation\s+Number of', pg):
            lines = pg.split('\n'); rows = []; hdr = None
            for k, ln in enumerate(lines):
                if re.search(r'Respondent Type', ln): hdr = k
            if hdr is None: continue
            for ln in lines[hdr:hdr + 25]:
                m = re.match(r'^\s*([A-Za-z][A-Za-z\- ()/]+?)\s{2,}' + NUM + r'\s+' + NUM + r'\s*$', ln)
                if m:
                    rows.append(dict(group=group_of(m.group(1)), sent=m.group(2), answered=m.group(3), method_words=norm(m.group(1)), snippet=norm(ln)))
            if rows:
                hdrtxt = norm(' '.join(lines[max(0, hdr - 2):hdr + 2]))
                return i, rows, hdrtxt
    return None
def fam_response_rates(pgs):   # 2016/2018 "Response Rates" with Total Sent / Undeliverable / Complete
    for i, pg in enumerate(pgs):
        if re.search(r'Response Rates', pg) and re.search(r'Total\s+Sent', pg):
            lines = pg.split('\n'); rows = []; st = None
            for k, ln in enumerate(lines):
                if re.search(r'Total\s+Sent', ln): st = k
            if st is None: continue
            j = st + 1
            while j < len(lines) and j < st + 20:
                ln = lines[j]
                m = re.match(r'^\s*([A-Za-z][A-Za-z\-/ ()]*?)\s{2,}([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+(\S+%?|-)\s+(\S+%?|-)\s*$', ln)
                if m:
                    label = m.group(1)
                    rows.append(dict(group=group_of(label), sent=m.group(2), answered=m.group(4), method_words='Total Sent / Complete (' + norm(label) + ')', undeliverable_or_na=m.group(3), response_rate=m.group(5), without_sufficient_knowledge=m.group(6), snippet=norm(ln)))
                else:
                    mn = re.match(r'^\s*([\d,]+|-)\s+([\d,]+|-)\s+([\d,]+|-)\s+(\S+%?|-)\s+(\S+%?|-)\s*$', ln)   # numbers only: label wrapped above/below
                    if mn:
                        prev = next((lines[k].strip() for k in range(j - 1, st, -1) if lines[k].strip()), ''); nxt = next((lines[k].strip() for k in range(j + 1, min(j + 4, len(lines))) if lines[k].strip()), '')
                        if prev and nxt and not re.search(r'\d', prev + nxt):
                            label = prev + ' ' + nxt if prev.endswith('-') else prev + ' ' + nxt
                            label = re.sub(r'-\s+', '-', label)
                            rows.append(dict(group=group_of(label), sent=mn.group(1), answered=mn.group(3), method_words='Total Sent / Complete (' + norm(label) + ')', undeliverable_or_na=mn.group(2), response_rate=mn.group(4), without_sufficient_knowledge=mn.group(5), snippet=norm(prev + ' | ' + ln + ' | ' + nxt)))
                j += 1
            if rows: return i, rows, norm(' '.join(lines[max(0, st - 4):st + 2]))
    return None
def fam_completes(pgs):   # "Appendix 2: Judge Response Counts by Type of Respondent"
    TOK = r'(?:[\d,]+%?|-|N/A|Unknown)'
    for i, pg in enumerate(pgs):
        if re.search(r'Respondent Type', pg) and re.search(r'Total Sent', pg) and re.search(r'Completes', pg):
            lines = pg.split('\n'); st = next(k for k, ln in enumerate(lines) if re.search(r'Respondent Type', ln)); rows = []
            hdr = norm(" ".join(lines[max(0, st - 1):st + 2])); five = 'Undeliverable' in hdr
            for ln in lines[st + 1:st + 25]:
                m = re.match(r'^\s*([A-Za-z][A-Za-z\-/ ()]*?)\s{2,}((?:' + TOK + r'\s+){3,4}' + TOK + r')\s*$' if five else r'^\s*([A-Za-z][A-Za-z\-/ ()]*?)\s{2,}((?:' + TOK + r'\s+){2,3}' + TOK + r')\s*$', ln)
                if not m: continue
                t = m.group(2).split()
                if five and len(t) == 5: d = dict(sent=t[0], responses=t[1], undeliverable_or_na=t[2], answered=t[3], cooperation_rate=t[4])
                elif not five and len(t) == 4: d = dict(sent=t[0], responses=t[1], answered=t[2], cooperation_rate=t[3])
                elif not five and len(t) == 3: d = dict(sent=t[0], responses=t[1], answered=t[2], cooperation_rate=None)
                else: continue
                rows.append(dict(group=group_of(m.group(1)), method_words='Total Sent / Completes (' + norm(m.group(1)) + ')', **d, snippet=norm(ln)))
            if rows: return i, rows, hdr
    return None
FAMS = [fam_invitation, fam_response_rates, fam_completes]
def parse(path):
    pgs = pages(path)
    for f in FAMS:
        r = f(pgs)
        if r:
            i, rows, hdr = r
            return dict(page=i + 1, printed_page=printed_page(pgs[i]), table_header=hdr, rows=rows, family=f.__name__)
    return None
if __name__ == '__main__':
    only = sys.argv[1:]   # optional year filter
    jobs = [l.rstrip('\n').split('\t') for l in open(HERE + '/pdf-jobs.tsv')]
    insuff = json.load(open(HERE + '/_insufficient.json'))
    bb = json.load(open(HERE + '/bluebook.json'))
    out = {}; fails = collections.defaultdict(list); stats = collections.Counter()
    for y, slug, url, local, page in jobs:
        if only and y not in only: continue
        ent = out.setdefault(slug, {}); rec = dict(pdf=url, local=local if os.path.exists(HERE + '/' + local) else None, page_url=page)
        if rec['local']:
            r = parse(HERE + '/' + local)
            if r: rec.update(r); stats[y, 'parsed'] += 1
            else: rec.update(page=None, rows=[], status='table not parsed'); stats[y, 'unparsed'] += 1; fails[y].append(slug)
        else: rec.update(page=None, rows=[], status='pdf not downloaded'); stats[y, 'nofile'] += 1
        ent[y] = rec
    for slug, d in insuff.items():
        for y, v in d.items():
            out.setdefault(slug, {})[str(y)] = dict(pdf=None, local=None, page=None, rows=[], status='no report linked: state page prints "%s"' % '; '.join(v['printed']), page_url=v['page'])
    json.dump(out, open(HERE + '/surveys.json', 'w'), indent=1, ensure_ascii=False)
    print(sorted(stats.items())); print({k: v[:12] for k, v in fails.items()})
