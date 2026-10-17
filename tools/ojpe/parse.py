import re,subprocess,sys,glob,json,os
D=sys.argv[1]; out=[]
for f in sorted(glob.glob(D+'/pdf/*.pdf')):
    t=subprocess.run(['pdftotext','-layout','-l','4',f,'-'],capture_output=True,text=True).stdout
    m=re.search(r'For (Judge|Justice) ([^,]+), (\d+) individuals completed',t)
    row={'slug':os.path.basename(f)[:-4],'who':(m.group(1)+' '+m.group(2)) if m else None,'total':int(m.group(3)) if m else None}
    for key,pat in [('att','Attorney email invite'),('nonatt','Non-attorney email Invite'),('juror','Juror Survey'),('citizen','Citizen Feedback'),('staff','Court Staff Email Invite')]:
        mm=re.search(re.escape(pat)+r'[^\n\d-]*\s+([\d,]+|N/A|-|Unknown)\s+([\d,]+)',t,re.I)
        if mm: row[key]=[mm.group(1).replace(',',''), int(mm.group(2).replace(',',''))]
    out.append(row)
json.dump(out,open(D+'/table.json','w'),indent=0)
ok=[r for r in out if r.get('nonatt') or r.get('att')]
print(len(out),'parsed,',len(ok),'with rows')
def rate(x):
    try: return x[1]/int(x[0])
    except: return None
cand=[]
for r in ok:
    for k in ('att','nonatt'):
        v=r.get(k)
        if v and v[0].isdigit() and int(v[0])>=50: cand.append((rate(v),k,int(v[0]),v[1],r['who'],r['total'],r['slug']))
cand.sort()
for c in cand[:14]: print('%.3f %-6s sent=%5d resp=%3d  %s  total=%s  [%s]'%c)
print('--- smallest totals')
for r in sorted([r for r in out if r['total'] is not None], key=lambda r:r['total'])[:8]: print(r['total'], r['who'], r.get('att'), r.get('nonatt'), r['slug'])
