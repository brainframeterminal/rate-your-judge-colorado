#!/usr/bin/env python3
"""Match Court of Appeals decisions (collect_coa.py → entries.json) to the REAL officials on the site and write an import
file for tools/appeals-import.mjs.

Matching is strict on purpose (a wrong judge on a public page is worse than a missing decision):
  same judicial district (from the trial court named in the announcement) AND same last name AND same first name
  (or first initial when the announcement uses one) — and only one roster judge may match.
Outcome from the announcement's own disposition line:
  dismissed · vacated · reversed · affirmed_in_part · affirmed · remanded   ("affirmed and remanded with directions" = affirmed)

    python3 match.py <roster.json from the live DB: /api export or tools output> <entries.json> <out.json>
"""
import json, re, sys, unicodedata

def norm(s):   # apostrophes go entirely: the sheets write O’Shea (U+2019, dropped by the ASCII fold) and the roster O'Shea —
    return re.sub(r"['`]", "", unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower())   # 55 decisions lost until 2026-10-17
def toks(name):
    n = re.sub(r"^(chief justice|justice|judge|district attorney)\s+", "", norm(name).strip())
    n = re.sub(r"\(.*?\)", " ", n); n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", " ", n)
    return [t for t in re.split(r"[\s.,]+", n) if t]
def parts(name):
    n = re.sub(r"^(chief justice|justice|judge|district attorney)\s+", "", norm(name).strip())
    n = re.sub(r"\(.*?\)", " ", n); n = re.sub(r"\b(jr|sr|ii|iii|iv)\b\.?", " ", n)
    toks = [t for t in re.split(r"[\s.,]+", n) if t]
    return (toks[0] if toks else "", toks[-1] if toks else "")

KINDS = {"CR": "Criminal", "CV": "Civil", "DR": "Domestic relations", "JV": "Dependency and neglect", "JD": "Juvenile delinquency", "JA": "Adoption",
         "PR": "Probate", "CW": "Water", "MH": "Mental health", "M": "Misdemeanor", "T": "Traffic", "C": "County civil", "S": "Small claims", "SC": "Small claims", "CA": "County court", "JR": "Relinquishment"}
def case_kind(lc):      # → the link text on the profile; public/i18n.js has the Spanish for each ('ak.<text>')
    m = re.search(r"\d{2,4}\s?([A-Z]{1,2})\s?\d", lc or "")
    k = KINDS.get(m.group(1)) if m else None
    return f"{k} appeal" if k else "Appeal"

def outcome(d):
    """The announcement's disposition line → one outcome. Fair to the trial judge: a part of the APPEAL dismissed (not heard)
    or a cross-appeal dismissed is not a correction of the ruling; a part reversed with the rest standing is "partly"."""
    d = d.upper()
    for a, b in (("AFFRIMED", "AFFIRMED"), ("AFIRMED", "AFFIRMED"), ("AFFIMRED", "AFFIRMED"), ("REVERESED", "REVERSED")):   # the court's own typos
        d = d.replace(a, b)
    if not d or "LIMITED REMAND" in d: return None                    # a limited remand is not a decision on the ruling
    d = d.replace("CROSS-APPEAL DISMISSED", "")
    d = re.sub(r"\bSET ASIDE\b", "VACATED", d)
    ev = re.findall(r"\b(AFFIRMED|REVERSED|VACATED|DISMISSED|DISAPPROVED|APPROVED)( IN PART)?", d)
    pos = [p for v, p in ev if v in ("AFFIRMED", "APPROVED")]
    neg = [(v, p) for v, p in ev if v in ("REVERSED", "VACATED", "DISAPPROVED")]
    dis = [p for v, p in ev if v == "DISMISSED"]
    if pos and neg: return "affirmed_in_part"
    if neg:
        if all(p for _, p in neg): return "affirmed_in_part"         # only parts reversed/vacated: the rest stands
        vs = {v for v, _ in neg}
        return "reversed" if "REVERSED" in vs else "vacated" if "VACATED" in vs else "disapproved"
    if pos:
        return "affirmed_in_part" if any(pos) and not any(dis) else "affirmed"
    if dis: return "dismissed"
    if "REMANDED" in d: return "remanded"
    return None                                                        # motion/petition denied, show-cause discharged…

def collapse(rows, window=120):
    """One row per DECISION. The same appeal announced again within `window` days is the same decision (opinion modified on
    rehearing, unpublished opinion later selected for publication): keep the latest text, with the published citation if
    any version in that run had one. Announcements further apart are separate decisions (e.g. 21CA1713: vacated 2023, then
    affirmed 2026 after remand) and both stay — the old merge stamped the 2023 citation on the 2026 ruling."""
    import datetime as dt
    by = {}
    for r in rows: by.setdefault(r["_key"], []).append(r)
    out = []
    for k, rs in by.items():
        rs.sort(key=lambda r: r["decided"]); runs = [[rs[0]]]
        for r in rs[1:]:
            gap = (dt.date.fromisoformat(r["decided"]) - dt.date.fromisoformat(runs[-1][-1]["decided"])).days
            (runs[-1].append(r) if gap <= window else runs.append([r]))
        cites = set()
        for run in runs:
            r = dict(run[-1]); del r["_key"]
            pub = [x["citation"] for x in run if re.match(r"^\d{4} COA", x["citation"])]
            if pub: r["citation"] = pub[-1]
            if r["citation"] in cites: r["citation"] += f" ({r['decided'][:4]})"   # same appeal number decided twice: keep the import key unique
            cites.add(r["citation"]); out.append(r)
    return out

def matcher(officials):
    """(trial judge name, trial court name) -> (official, None) or (None, 'unmatched' | 'ambiguous' | 'nodistrict').
    Shared by the weekly announcements (main below) and the CourtListener opinions (tools/courtlistener/build.py)."""
    courts = {c["id"]: c for c in json.load(open("data/courts.json"))}
    county_district = {}
    for c in courts.values():
        if c.get("county"): county_district[norm(c["county"])] = str(c["district"])
    county_district["denver"] = "2"
    judges = [o for o in officials if o["type"] == "judge"]
    by_last = {}
    for o in judges:
        f, l = parts(o["name"]); by_last.setdefault((str(courts[o["court_id"]]["district"]), l), []).append((f, o))
    def district_of(court):
        cm = re.match(r"(?:city and county of\s+)?(.+?)\s+(?:county\s+)?(?:district|county|juvenile|probate|water)\s+court", norm(court))
        county = cm.group(1).replace(" county", "").strip() if cm else ""
        county = {"araoahoe": "arapahoe", "dever": "denver"}.get(county, county)     # typos in the announcements
        return county_district.get(county)
    def find(judge, court):
        dist = district_of(court)
        if not dist: return None, "nodistrict"
        f, l = parts(judge)
        cands = [o for (ff, o) in by_last.get((dist, l), []) if ff == f or (len(f) == 1 and ff.startswith(f)) or (len(ff) == 1 and f.startswith(ff))]
        if not cands:     # same district, name written differently: "W. Troy Hause" = Troy Hause, "A. Nathaniel Baca" = Nathaniel Baca,
            # "Stephanie M.G. Gagliano" = Stevie M.G. Gagliano (first names share 3+ letters AND the same middle initials —
            # NOT just initials: Martin A. Gonzales and Michael A. Gonzales are two judges in Alamosa)
            et = toks(judge)[:-1]
            def same(o):
                rt = toks(o["name"])[:-1]
                return (len(rt[0]) > 1 and rt[0] in et) or (len(et[0]) > 1 and et[0] in rt) or \
                       (min(len(rt[0]), len(et[0])) >= 3 and (et[0].startswith(rt[0]) or rt[0].startswith(et[0]))) or \
                       (len(rt) > 1 and len(rt[0]) > 2 and rt[0][:3] == et[0][:3] and [t[0] for t in rt[1:]] == [t[0] for t in et[1:]])
            cands = [o for (ff, o) in by_last.get((dist, l), []) if et and same(o)]
        if not cands:     # judge moved courts or sat by assignment (Douglas County left the 18th for the 23rd in 2025): accept only a FULL
            # first+last name (or the identical full name, e.g. "H. Clay Hurst") that is unique statewide
            full = toks(judge)
            st = [o for (dd, ll), lst in by_last.items() if ll == l for (ff, o) in lst if (len(f) > 1 and ff == f) or toks(o["name"]) == full]
            if len(st) == 1: cands = st
        if len(cands) != 1: return None, ("ambiguous" if cands else "unmatched")
        return cands[0], None
    return find

def main(roster_path, entries_path, out_path):
    find = matcher(json.load(open(roster_path)))          # [{id, name, type, court_id}] real officials only
    entries = json.load(open(entries_path)); rows, unmatched, ambiguous = [], 0, 0
    originals = {e["coa_no"] for e in entries if e.get("section") != "modified"}
    for e in entries:
        if e.get("section") == "modified" and e["coa_no"] in originals: continue   # a re-issued text of a decision we already have
        if not e.get("judge") or not e.get("court") or e.get("judge_role", "").lower().startswith(("magistrate", "juvenile", "district court magistrate")): continue
        oc = outcome(e.get("disposition", ""))
        if not oc: unmatched += 1; continue
        o, why = find(e["judge"], e["court"])
        if not o:
            if why == "ambiguous": ambiguous += 1
            else: unmatched += 1
            continue
        cands = [o]
        kind = case_kind(e.get("lower_case", ""))
        rows.append({"official": cands[0]["id"], "court": "coa", "case_name": kind,   # no party names: private people (divorces, estates, children) stay off a judge-rating page
                     "citation": e["citation"] or (f"Nos. {e['coa_no']}" if re.search(r"[&,]", e["coa_no"]) else f"No. {e['coa_no']}"), "decided": e["day"], "outcome": oc, "url": e["source"] + (f"#page={e['page']}" if e.get("page") else ""),
                     "note": f"{e['court']}. " + ("Unpublished opinion." if e.get("unpublished") else "Published opinion.") +     # the exact wording only when it says more than the pill
                             ("" if re.fullmatch(r"(JUDG?E?MENTS?|ORDERS?|SENTENCES?|JUDGMENT AND SENTENCE) AFFIRMED\.?", e["disposition"].strip()) else f" As announced: {e['disposition'].strip().rstrip('.').capitalize()}."),
                     "source": "COA announcement", "checked": e["day"], "_key": (cands[0]["id"], e["coa_no"])})
    rows = collapse(rows)
    json.dump(rows, open(out_path, "w"), indent=1)
    from collections import Counter
    print(f"{len(rows)} decisions matched to {len({r['official'] for r in rows})} judges; unmatched {unmatched}, ambiguous {ambiguous}")
    print("outcomes:", dict(Counter(r["outcome"] for r in rows)))

if __name__ == "__main__":
    main(*sys.argv[1:4])
