# Enriches data/courts.json: which courts sit in each courthouse + district grouping + the appellate courthouse.
import json
c = json.load(open('data/courts.json'))
WATER = {'Weld': 'Water Court Division 1', 'Pueblo': 'Water Court Division 2', 'Alamosa': 'Water Court Division 3', 'Montrose': 'Water Court Division 4',
         'Garfield': 'Water Court Division 5', 'Routt': 'Water Court Division 6', 'La Plata': 'Water Court Division 7'}
DENVER = {'Denver District Court': ['District Court'], 'Denver Juvenile Court': ['Juvenile Court'], 'Denver Probate Court': ['Probate Court'], 'Denver County Court': ['County Court']}
out = []
for x in c:
    if x.get('kind') == 'appellate': continue
    houses = DENVER.get(x['name']) or ['District Court', 'County Court'] + ([WATER[x['county']]] if x['county'] in WATER else [])
    out.append({**x, 'kind': 'trial', 'houses': houses})
out.append({'id': 'carr-judicial-center', 'county': 'Denver', 'district': 'Statewide', 'name': 'Colorado Supreme Court and Court of Appeals', 'kind': 'appellate',
            'address': '2 East 14th Avenue, Denver, CO 80203', 'lat': 39.738374, 'lon': -104.987338, 'houses': ['Supreme Court', 'Court of Appeals']})
json.dump(out, open('data/courts.json', 'w'), ensure_ascii=False, indent=0)
print(len(out), 'courthouses;', sum(1 for o in out if o['kind'] == 'trial'), 'trial,', sum(1 for o in out if o['kind'] == 'appellate'), 'appellate')
