#!/usr/bin/env python3
"""Colorado Court of Appeals weekly announcements → one record per decision (published AND unpublished).

Primary source: coloradojudicial.gov/court-appeals/court-appeals-case-announcements (paginated), one PDF per announcement
day. Each entry gives the COA case number, the trial court and its case number, "Honorable <name>, Judge", the parties and
the disposition in capitals. We keep the exact source PDF URL for every record, so each one can be checked.

    python3 collect_coa.py [--since 2021-01-01]      → ~/.cache/ryg-coa/{pdf/, entries.json}
Polite: one request every 2 s; PDFs are cached, so re-runs only fetch new weeks.
"""
import json, os, re, subprocess, sys, time, urllib.request, urllib.parse
BASE = "https://www.coloradojudicial.gov"
INDEX = BASE + "/court-appeals/court-appeals-case-announcements?page={}"
CACHE = os.path.expanduser("~/.cache/ryg-coa"); os.makedirs(CACHE + "/pdf", exist_ok=True)
UA = {"User-Agent": "Mozilla/5.0 (Macintosh) rateyourjudgecolorado.com appeals research"}
SINCE = sys.argv[sys.argv.index("--since") + 1] if "--since" in sys.argv else "2021-01-01"
_last = [0.0]

def fetch(url, binary=False):
    for _ in range(4):
        w = 2 - (time.time() - _last[0]);  time.sleep(max(0, w)); _last[0] = time.time()
        try:
            with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=90) as r:
                b = r.read(); return b if binary else b.decode("utf-8", "replace")
        except Exception as e:
            err = e; time.sleep(10)
    raise RuntimeError(f"{url}: {err}")

def date_of(link):
    # MM-DD-YY anywhere in the FILE name, last one wins: older uploads glue a hex id in front ("87F22401-18-24 .pdf") and one
    # week is "10-31-2024.pdf". A "/MM-DD-YY" pattern skipped both and silently lost 31 weeks.
    ms = re.findall(r"(\d{2})-(\d{2})-(\d{4}|\d{2})(?!\d)", urllib.parse.unquote(link).rsplit("/", 1)[-1])
    if not ms: return None
    mo, dd, yy = ms[-1]
    return f"{yy if len(yy) == 4 else '20' + yy}-{mo}-{dd}"

# 1) every announcement file listed on the index pages
links, empty = {}, 0
for page in range(0, 80):
    html = fetch(INDEX.format(page))
    found = sorted(set(re.findall(r'(/sites/default/files/20\d{2}-\d{2}/[^"]+\.(?:pdf|docx))', html)))
    new = [l for l in found if l not in links]
    for l in found: links.setdefault(l, date_of(l))
    print(f"index page {page}: {len(found)} files, {len(new)} new", flush=True)
    empty = empty + 1 if not new else 0
    if empty >= 2: break
# one file per announcement day; prefer PDF over DOCX
byday = {}
for l, d in links.items():
    if not d or d < SINCE: continue
    if d not in byday or (byday[d].endswith(".docx") and l.endswith(".pdf")): byday[d] = l
print(f"{len(byday)} announcement days since {SINCE}", flush=True)

# 2) download + text
def text_of(link):
    name = re.sub(r"[^\w.-]", "_", urllib.parse.unquote(link.split("/files/")[1]))
    f = os.path.join(CACHE, "pdf", name)
    if not os.path.exists(f):
        open(f, "wb").write(fetch(BASE + link, binary=True))
    if f.endswith(".pdf"):
        return subprocess.run(["pdftotext", "-layout", f, "-"], capture_output=True, text=True).stdout
    return subprocess.run(["textutil", "-convert", "txt", "-stdout", f], capture_output=True, text=True).stdout

# 3) parse entries
COURT = re.compile(r"^(?P<court>.+?(?:District|County|Juvenile|Probate|Water)\s+Court(?:,\s*Water Division No\.\s*\d+)?)\s+Nos?\.\s*(?P<lcase>.+)$")
JUDGE = re.compile(r"^Honorable\s+(?P<name>.+?),\s*(?P<role>Judge|Chief Judge|Magistrate|Senior Judge|Juvenile Magistrate|District Court Magistrate)\b", re.I)
SECTION = re.compile(r"^(UNPUBLISHED OPINIONS|PUBLISHED OPINIONS|PETITIONS? FOR REHEARING|MODIFIED OPINIONS)\b")
SECTION_KIND = {"UNPUBLISHED OPINIONS": "unpublished", "PUBLISHED OPINIONS": "published", "MODIFIED OPINIONS": "modified"}   # rehearing → skipped
DISP = re.compile(r"^(JUD[A-Z]*MENTS?|ORDER|ORDERS|APPEAL|APPEALS|SENTENCE|SENTENCES|MOTION|MOTIONS|DECREE|CASE|DECISION|PETITION|RULING|AWARD|DISMISSED|REVERSED|AFFIRMED|VACATED)\b[A-Z ,;.'’()&-]*$")
out = []
for day, link in sorted(byday.items()):
    try: t = text_of(link)
    except Exception as e: print("SKIP", day, e, flush=True); continue
    lines, page_of = [], []                          # pdftotext ends each page with \f: remember the page, so a link opens on it
    for pn, pg in enumerate(t.split("\f"), 1):
        for l in pg.splitlines():
            l = re.sub(r"\s+", " ", l).strip()
            if l: lines.append(l); page_of.append(pn)
    section = "published"
    i = 0
    while i < len(lines):
        l = lines[i]
        m = SECTION.match(l)
        if m: section = SECTION_KIND.get(m.group(1), "rehearing")   # a rehearing list repeats old cases: not a decision
        if l.startswith("Court of Appeals No"):
            cite = re.sub(r"^(\d{4}) ?COA ?(\d+)$", r"\1 COA \2", lines[i - 1]) if i and re.match(r"^\d{4} ?COA ?\d+$", lines[i - 1]) else ""
            blk = []
            j = i + 1
            while j < len(lines) and not lines[j].startswith("Court of Appeals No") and not re.match(r"^\d{4} ?COA ?\d+$", lines[j]) and not SECTION.match(lines[j]):
                blk.append(lines[j]); j += 1
            rec = {"day": day, "source": BASE + link, "section": section, "coa_no": re.sub(r"^Court of Appeals Nos?\.\s*", "", l).strip(), "citation": cite, "page": page_of[i] if link.endswith(".pdf") else None}
            for b in blk:
                m = COURT.match(b)
                if m and "court" not in rec: rec["court"], rec["lower_case"] = m.group("court"), m.group("lcase")
                m = JUDGE.match(b)
                if m and "judge" not in rec: rec["judge"], rec["judge_role"] = m.group("name").strip(), m.group("role")
            # parties: lines between the judge line and the first disposition line
            try: k0 = next(k for k, b in enumerate(blk) if JUDGE.match(b)) + 1
            except StopIteration: k0 = 0
            disp, parties = [], []
            for b in blk[k0:]:
                # "Division II" / "Division A" ends the block; a PARTY can start with "Division" (Division of Motor Vehicles…)
                if re.match(r"^Division [IVXLC]+$|^Division [A-Z]$", b) or b.startswith("Opinion by") or b.startswith("Per Curiam"): break
                if DISP.match(b) or (disp and b.isupper()): disp.append(b)
                elif not disp: parties.append(b)
            rec["disposition"] = " ".join(disp)
            ps = " ".join(parties)
            m = re.match(r"(.+?),\s*(?:Plaintiff|Petitioner|Appellee|Appellant|Respondent|Intervenor|Claimant).*?\bv\.\s*(.+?),\s*(?:Defendant|Respondent|Appellee|Appellant|Plaintiff|Intervenor)", ps)
            rec["case_name"] = (f"{m.group(1).strip()} v. {m.group(2).strip()}" if m else ps[:160]).replace("The People of the State of Colorado", "People")
            rec["unpublished"] = section == "unpublished" or any("NOT PUBLISHED" in b for b in blk)
            for k, b in enumerate(blk):          # who wrote it and who sat: "Opinion by JUDGE WELLING" / "Kuhn and Meirink, JJ., concur"
                m = re.match(r"^Opinion by (CHIEF JUDGE|JUDGE|JUSTICE|SENIOR JUDGE)\s+(.+?)\*?$", b)
                if m: rec["author"], rec["author_title"], rec["panel"] = m.group(2).strip(), m.group(1), blk[k + 1] if k + 1 < len(blk) else ""; break
                if re.match(r"^per curiam\b", b, re.I): rec["author"] = "PER CURIAM"; break
            if section != "rehearing": out.append(rec)
            i = j; continue
        i += 1
    print(f"{day}: total {len(out)}", flush=True)
json.dump(out, open(os.path.join(CACHE, "entries.json"), "w"), indent=0)
print(f"DONE {len(out)} decisions from {len(byday)} announcement days → {CACHE}/entries.json", flush=True)
