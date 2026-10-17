# Projects Colorado county polygons (US Census via plotly/datasets) to SVG paths: public/co-map.json
import json, math
g = json.load(open('tools/co-counties.geojson'))
courts = json.load(open('data/courts.json'))
dist = {c['county']: c['district'] for c in courts if c['district'] != 'Statewide'}   # the Carr Judicial Center (appellate courts) sits in Denver but belongs to no district
K = math.cos(math.radians(39)); X0, Y1 = -109.06, 41.0
def pt(lon, lat): return ((lon - X0) * K * 100, (Y1 - lat) * 100)
out = []
for f in g['features']:
    name = f['properties']['NAME']; polys = f['geometry']['coordinates'] if f['geometry']['type'] == 'MultiPolygon' else [f['geometry']['coordinates']]
    d = ''
    for poly in polys:
        for ring in poly:
            last = None; pts = []
            for lon, lat in ring:
                x, y = pt(lon, lat)
                if last is None or abs(x - last[0]) + abs(y - last[1]) > 0.5: pts.append((x, y)); last = (x, y)
            if len(pts) > 2: d += 'M' + 'L'.join(f'{x:.1f} {y:.1f}' for x, y in pts) + 'Z'
    cx = sum(pt(*p)[0] for p in polys[0][0]) / len(polys[0][0]); cy = sum(pt(*p)[1] for p in polys[0][0]) / len(polys[0][0])
    out.append({'county': name, 'district': dist.get(name), 'd': d, 'cx': round(cx, 1), 'cy': round(cy, 1)})
# district tone: neighbouring districts never share a tint, so districts read as areas before anyone has rated
# (adjacency = two counties of different districts share a vertex; greedy colouring, most-connected first)
import re
pts = {o['county']: {(round(float(x)), round(float(y))) for x, y in re.findall(r'([\d.]+) ([\d.]+)', o['d'])} for o in out}
adj = {}
for a in out:
    for b in out:
        if a['district'] and b['district'] and a['district'] != b['district'] and len(pts[a['county']] & pts[b['county']]) >= 2:
            adj.setdefault(a['district'], set()).add(b['district'])
tone = {}
for d in sorted(adj, key=lambda d: -len(adj[d])):
    tone[d] = next(i for i in range(8) if all(tone.get(n) != i for n in adj[d]))
for o in out: o['tone'] = tone.get(o['district'], 0)
json.dump({'w': 545, 'h': 401, 'counties': out}, open('public/co-map.json', 'w'), separators=(',', ':'))
print('tones used:', max(tone.values()) + 1, tone)
print(len(out), 'counties', sum(1 for o in out if not o['district']), 'without district:', [o['county'] for o in out if not o['district']][:10])
