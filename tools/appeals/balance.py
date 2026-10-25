#!/usr/bin/env python3
"""Balance check for the Court of Appeals sheets: every line that ANNOUNCES a case must be either one the parser takes
(it starts with "Court of Appeals No") or a known refusal named in balance-known.txt. A ratio or a density barely moves
when a parser loses 1-2 % of blocks, so we count lines, not rates.

    python3 balance.py            → prints every unexplained line; exit 1 if there is one
Reads the cached sheets only (~/.cache/ryg-coa/pdf), no network.
"""
import glob, os, re, subprocess, sys
CACHE = os.path.expanduser("~/.cache/ryg-coa/pdf")
KNOWN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "balance-known.txt")
BROAD = re.compile(r"(?i)^(colorado\s+)?court\s+of\s+appeals?\s*(case\s+)?(nos?|numbers?)\b")
CA = re.compile(r"\b\d{2,4}CA\d{2,4}\b")       # a Court of Appeals number anywhere: catches "of Appeals No. 22CA1922" (word lost in the PDF)
TRIAL = re.compile(r"(?i)(District|County|Juvenile|Probate|Water)\s+Court.*Nos?\.")   # the trial court's own case line, not an announcement
NUMBER = re.compile(r"^\d{2}CA\d{4}(\s*(&|,|and)\s*\d{2}CA\d{4})*$")

def text(f):
    if f.endswith(".pdf"): return subprocess.run(["pdftotext", "-layout", f, "-"], capture_output=True, text=True).stdout
    return subprocess.run(["textutil", "-convert", "txt", "-stdout", f], capture_output=True, text=True).stdout

known = set()
if os.path.exists(KNOWN):
    known = {l.split("\t")[0] for l in open(KNOWN, encoding="utf-8") if l.strip() and not l.startswith("#")}
announced = taken = 0; unexplained, odd = [], []
for f in sorted(glob.glob(CACHE + "/*.pdf") + glob.glob(CACHE + "/*.docx")):
    sheet = os.path.basename(f)
    for l in text(f).splitlines():
        l = re.sub(r"\s+", " ", l).strip()
        if not (BROAD.match(l) or (CA.search(l) and not TRIAL.search(l))): continue
        announced += 1
        if l.startswith("Court of Appeals No"):
            taken += 1
            no = re.sub(r"^Court of Appeals Nos?\.\s*", "", l).strip()
            if not NUMBER.match(no): odd.append(f"{sheet}: {no}")
        elif f"{sheet}: {l}" not in known:
            unexplained.append(f"{sheet}: {l}")
print(f"{announced} lines announce a case; the parser takes {taken}; known refusals {announced - taken - len(unexplained)}; "
      f"unexplained {len(unexplained)}")
for o in odd: print("  taken, but the number looks wrong:", o)
for u in unexplained: print("  UNEXPLAINED:", u)
sys.exit(1 if unexplained else 0)
