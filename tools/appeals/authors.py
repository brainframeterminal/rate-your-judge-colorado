#!/usr/bin/env python3
"""Court of Appeals decisions → the appellate judge who WROTE each one ("Opinion by JUDGE WELLING"), for the profile
block "Opinions written". Same announcements, same outcome rules and privacy as match.py (case type only, no names).

    python3 authors.py <officials.json with title+court_id> <entries.json> <out.json>
Only current Court of Appeals judges on the site get rows; senior judges sitting by assignment are not on our list.
"""
import json, re, sys
from match import outcome, norm, toks, case_kind, collapse

TYPO = {"FREYE": "FREYRE"}                       # the court's own misspellings of a judge's name

def main(off_path, entries_path, out_path):
    coa = [o for o in json.load(open(off_path)) if o.get("court_id") == "carr-judicial-center" and o["name"].startswith("Judge ")]
    entries = json.load(open(entries_path))
    rows, unknown = [], {}
    for e in entries:
        a = e.get("author")
        if not a or a == "PER CURIAM": continue
        if e.get("section") == "modified": continue   # re-issued text, never a new opinion (see match.py)
        oc = outcome(e.get("disposition", ""))
        if not oc: continue
        at = toks(TYPO.get(norm(a).upper(), a))        # "J. JONES" → ['j','jones'], "LIPINSKY" → ['lipinsky']
        cands = [o for o in coa if at[-1] in toks(o["name"]) and (len(at) == 1 or toks(o["name"])[0][0] == at[0][0])]   # toks() already drops "Judge"
        if len(cands) != 1: unknown[a] = unknown.get(a, 0) + 1; continue
        o = cands[0]
        panel = re.sub(r"\*", "", e.get("panel", "")).strip().rstrip(".")
        rows.append({"_key": (o["id"], e["coa_no"]), "official": o["id"], "case_name": case_kind(e.get("lower_case", "")),
            "citation": e["citation"] or (f"Nos. {e['coa_no']}" if re.search(r"[&,]", e["coa_no"]) else f"No. {e['coa_no']}"),
            "decided": e["day"], "outcome": oc, "url": e["source"] + (f"#page={e['page']}" if e.get("page") else ""),
            "published": 0 if e.get("unpublished") else 1,
            "note": f"{e.get('court', 'Trial court')}. " + (f"{panel}." if re.search(r"concur|dissent", panel, re.I) else ""),
            "source": "COA announcement", "checked": e["day"]})
    out = collapse(rows)                                                  # same rule as the appeals record: one row per decision
    json.dump(out, open(out_path, "w"), indent=1)
    from collections import Counter
    print(f"{len(out)} written decisions for {len({r['official'] for r in out})} judges; not on our list: {dict(sorted(unknown.items(), key=lambda x: -x[1]))}")

if __name__ == "__main__":
    main(*sys.argv[1:4])
