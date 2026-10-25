"""Shared page parser for judicialperformance.colorado.gov per-judge evaluation pages (cached HTML)."""
import re, html as H, unicodedata
ORD = {'First':1,'Second':2,'Third':3,'Fourth':4,'Fifth':5,'Sixth':6,'Seventh':7,'Eighth':8,'Ninth':9,'Tenth':10,'Eleventh':11,'Twelfth':12,'Thirteenth':13,
       'Fourteenth':14,'Fifteenth':15,'Sixteenth':16,'Seventeenth':17,'Eighteenth':18,'Nineteenth':19,'Twentieth':20,'Twenty-First':21,'Twenty-Second':22,'Twenty-Third':23}
def clean(s):
    s = re.sub(r'<script.*?</script>|<style.*?</style>', ' ', s, flags=re.S)
    s = re.sub(r'<[^>]+>', ' ', s)
    return re.sub(r'\s+', ' ', H.unescape(s).replace('\xa0', ' ')).strip()
def ascii_(s): return unicodedata.normalize('NFKD', s).encode('ascii','ignore').decode()
def parse_page(h):
    r = {}
    m = re.search(r'<h1>(.*?)</h1>', h, re.S); r['h1'] = clean(m.group(1)) if m else None
    i = h.find('field--name-field-card-body')
    m = re.search(r'<h2[^>]*>(.*?)</h2>\s*<h3[^>]*>(.*?)</h3>', h[i:i+3000], re.S) if i >= 0 else None
    r['court'] = clean(m.group(1)) if m else None
    r['honorable'] = clean(m.group(2)) if m else None
    m = re.search(r'Recommendation:\s*(?:</strong>)?(.*?)</p>', h, re.S)
    r['rec_on_page'] = clean(m.group(1)) if m else None
    m = re.search(r'Retention Year:\s*(\d{4})', clean(h)); r['retention_year'] = int(m.group(1)) if m else None
    r['pdfs'] = []
    for m in re.finditer(r'<a [^>]*href="([^"]+\.pdf)"[^>]*>(.*?)</a>', h, re.S|re.I):
        lab = clean(m.group(2))
        if re.search(r'Survey', lab): r['pdfs'].append((lab, m.group(1)))
    # narrative: main-content HTML after the last survey-report link
    i1 = h.find('<h1'); e = h.find('</main>', i1); seg = h[i1:e if e > 0 else None]
    cut = 0
    for p in r['pdfs']:
        k = seg.find(p[1])
        if k >= 0: cut = max(cut, seg.find('</a>', k) + 4)
    t = clean(seg[cut:]) if cut else clean(seg)
    if not cut: t = re.sub(r'^.*?Recommendation:\s*(?:Does Not Meet|Meets)\s*Performance Standards?\s*', '', t)
    t = re.sub(r'^\(PDF\)\s*', '', t)
    t = re.sub(r'^(?:\(PDF\)\s*)?Need an accessible PDF.*?Contact Us\s*', '', t, flags=re.I)
    t = re.sub(r'^(?:\(PDF\)\s*)+', '', t)
    k = t.find('Statistical Report'); t = t[:k].strip() if k > 0 else t
    r['insufficient_raw'] = [m.group(0).strip() for m in re.finditer(r'\*?\s*Insufficient\s+Responses?\s+to\s+Publish(?:\s+\d{4})?\s+Survey\s+Reports?', t, re.I)]
    r['insufficient'] = [int(re.search(r'\d{4}', x).group(0)) if re.search(r'\d{4}', x) else 0 for x in r['insufficient_raw']]   # 0 = no year printed (all reports)
    t = re.sub(r'\*?\s*Insufficient\s+Responses?\s+to\s+Publish(?:\s+\d{4})?\s+Survey\s+Reports?\s*', '', t, flags=re.I)
    t = re.sub(r'^Reports:\s*\*?\s*', '', t).strip()
    r['text'] = t
    return r
def sentences(t): return re.split(r'(?<=[.!?])(?<!Gov\.)(?<!Jr\.)(?<!Sr\.)(?<!Dr\.)(?<!Mr\.)(?<!Ms\.)(?<!Mrs\.)(?<!\b[A-Z]\.)(?<!St\.)\s+(?=[A-Z“"])', t)
def words_window(t, pat, n=25):
    m = re.search(pat, t)
    if not m: return None
    w = t.split(); pre = len(t[:m.start()].split()); a = max(0, pre - 8)
    return ' '.join(w[a:a+n])
VOTE = [r'unanimously\s+agrees?,?\s+(\d+)\s*[-–]\s*(\d+)', r'agrees?\s*\((\d+)\s*[-–]\s*(\d+)', r'by a vote of (\d+)\s*[-–to]+\s*(\d+)', r'votes? (?:of )?(\d+)\s*[-–]\s*(\d+)', r'voted (\d+)\s*[-–]\s*(\d+)', r'\((\d+)\s*[-–]\s*(\d+)\)', r'vote (?:was )?(\d+)\s*[-–]\s*(\d+)', r'(\d+)\s*[-–]\s*(\d+) (?:vote|that)', r'by a (\d+)\s*[-–]\s*(\d+) vote']
def vote_of(t):
    t = t[:700]
    for p in VOTE:
        m = re.search(p, t)
        if m: return f'{m.group(1)}-{m.group(2)}', m
    m = re.search(r'(?:unanim|agree)[^.]{0,40}?\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b', t)
    if m: return f'{m.group(1)}-{m.group(2)}', m
    return None, None
def vote_quote(t):
    v, m = vote_of(t)
    if not m: return None
    w = t.split(); pre = len(t[:m.start()].split()); a = max(0, pre - 10)
    return ' '.join(w[a:a+25])
NAMEBIT = r"[A-Z][A-Za-z.'\-]+"
BYRE = re.compile(r"(?:(?:former |then[- ])?(?:Governor|Gov\.)\s+(" + NAMEBIT + r"(?:\s+(?:" + NAMEBIT + r")){0,3}))")
def appointed_by(t):
    """Only what the page prints: a sentence with 'appoint' that names 'Governor X'. Returns (by, quote)."""
    for s in sentences(t):
        if re.search(r'appoint', s, re.I) and re.search(r'\b(Governor|Gov\.)\s', s):
            m = BYRE.search(s)
            if not m: continue
            name = m.group(0)
            name = re.sub(r'^(former |then[- ])', '', name)
            name = re.sub(r'[.,]$', '', name)
            # drop trailing month words etc.
            name = re.sub(r'\s+(January|February|March|April|May|June|July|August|September|October|November|December)\b.*$', '', name)
            w = s.split(); q = ' '.join(w[:25]) if len(w) <= 25 else None
            if q is None:
                pre = len(s[:m.start()].split()); a = max(0, min(pre - 10, len(w) - 25)); q = ' '.join(w[a:a+25])
            return name, q
    return None, None
def appointed_year(t):
    for s in sentences(t):
        if re.search(r'appointed|joined the|has served as .{0,60} since|served .{0,60}since', s, re.I):
            ys = re.findall(r'\b(19[5-9]\d|20[0-2]\d)\b', s)
            if len(ys) >= 1 and re.search(r'appointed', s, re.I):
                return int(ys[0]), s, 'appointment'
    for s in sentences(t):
        if re.search(r'since (19|20)\d\d|joined', s, re.I) and re.search(r'judge|bench|court', s, re.I):
            ys = re.findall(r'\b(19[5-9]\d|20[0-2]\d)\b', s)
            if ys: return int(ys[0]), s, 'tenure statement'
    return None, None, None

import os, glob as _glob
_FL = {}
def find_page(HERE, e, c):
    """cached html file for entry e's cycle c (None if not cached)."""
    y = c['year']; us = c['url'].rsplit('/', 1)[-1]
    if y == 2026 and not _FL:
        for l in open(HERE + '/html/2026/_fetch-log.txt'):
            p = l.split(); _FL[p[1].rsplit('/', 1)[-1]] = p[2]
    cands = [f'{HERE}/html/{y}/{us}.html']
    if y == 2026 and us in _FL: cands.insert(0, f'{HERE}/html/2026/{_FL[us]}.html')
    cands += [f'{HERE}/html/{y}/{s}-{y}-evaluation.html' for s in [e['slug']] + e.get('merged_slugs', [])]
    return next((x for x in cands if os.path.exists(x)), None)
