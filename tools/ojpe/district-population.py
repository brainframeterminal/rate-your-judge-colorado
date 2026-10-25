#!/usr/bin/env python3
"""Builds district-population.json. Inputs: Census 2020 PL 94-171 Colorado files (co2020.pl.zip unpacked in argv[1]) and the
district list saved from coloradojudicial.gov/trial-courts-district (argv[2]). No API key used. Prints cross-checks."""
import re,json,sys
D,H=sys.argv[1],sys.argv[2]
t=re.sub(r'\s+',' ',re.sub(r'<[^>]+>',' ',re.sub(r'<script.*?</script>|<style.*?</style>','',open(H,encoding='utf-8').read(),flags=re.S)))
i=t.find('Trial Courts by District'); seg=t[i:t.find('Colorado Judicial Branch &nbsp;',i)]
parts=re.split(r'(\d+)(?:st|nd|rd|th) Judicial District',seg); comp={}
for k in range(1,len(parts),2):
    comp[int(parts[k])]=re.findall(r'([A-Z][A-Za-z ]+?) County(?! Court)',parts[k+1])
comp[2]=['Denver']   # page lists Denver's courts, not "Denver County"; Denver is a consolidated city and county
p1={}
for l in open(D+'/co000012020.pl',encoding='latin-1'):
    f=l.split('|'); p1[f[4]]=int(f[5])          # P0010001 = total population
cty={}
for l in open(D+'/cogeo2020.pl',encoding='latin-1'):
    f=l.split('|')
    if f[2]=='050':
        assert p1[f[7]]==int(f[-7]), f      # same figure in geo header POP100
        cty[f[-11]]={'geoid':f[8],'name_census':f[-10],'pop':p1[f[7]]}
allc=[c for v in comp.values() for c in v]
print('counties in district list',len(allc),len(set(allc)),'missing from list',set(cty)-set(allc),'unknown',set(allc)-set(cty))
CEN='https://www2.census.gov/programs-surveys/decennial/2020/data/01-Redistricting_File--PL_94-171/Colorado/co2020.pl.zip'
def mk(cs): 
    return {'counties':[{'county':c,'geoid':cty[c]['geoid'],'census_name':cty[c]['name_census'],'pop_2020':cty[c]['pop']} for c in cs],'pop_2020':sum(cty[c]['pop'] for c in cs)}
dist={}
for n in range(1,24):
    dist[str(n)]=mk(comp[n]); dist[str(n)]['composition_since']='2025-01 (23 districts)'
d18=mk(comp[18]+comp[23]); d18['composition_since']='18th as in 2024: Arapahoe, Douglas, Elbert, Lincoln'
dist['18_as_of_2024']=d18
out={'as_of':'2026-10-23','measure':'2020 Census total population (P1_001N / P0010001), April 1 2020',
 'population_source':{'name':'U.S. Census Bureau, 2020 Census Redistricting Data (P.L. 94-171) Summary File, Colorado, table P1 (segment 1 P0010001); county rows = geo header SUMLEV 050; POP100 in the geo header agrees for all counties','url':CEN,
  'note':'The Census API (api.census.gov) needs a key, so the official P.L. 94-171 file was used instead. Sums are of the county figures; nothing rounded.'},
 'composition_source':{'name':'Colorado Judicial Branch, Trial Courts by District','url':'https://www.coloradojudicial.gov/trial-courts-district','note':'Lists 23 districts incl. 23rd = Douglas, Elbert, Lincoln; 18th = Arapahoe only. The page lists county/district courts per district (Denver listed as Denver District/Juvenile/Probate/County Court; Broomfield County under 17th). The 2024 18th is the list 18th + 23rd per the task statement.'},
 'districts':dist,'total_state':sum(v['pop'] for v in cty.values())}
json.dump(out,open('district-population.json','w'),indent=1,ensure_ascii=False)
for k,v in dist.items(): print(k,v['pop_2020'],[c['county'] for c in v['counties']])
print('state',out['total_state'],'sum23',sum(dist[str(n)]['pop_2020'] for n in range(1,24)))
