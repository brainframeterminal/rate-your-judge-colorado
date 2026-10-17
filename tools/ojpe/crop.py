import subprocess,re,sys,html
D=sys.argv[1]
for s in ['cortez-rodriguez-kimberly','eiring-deni','schutte-anita']:
    f=f'{D}/pdf/{s}.pdf'; pg=3
    x=subprocess.run(['pdftotext','-bbox-layout','-f',str(pg),'-l',str(pg),f,'-'],capture_output=True,text=True).stdout
    words=[(float(a),float(b),float(c),float(d),html.unescape(w)) for a,b,c,d,w in re.findall(r'<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)</word>',x)]
    rt=[w for w in words if w[4]=='Respondent'][0]; inv=[w for w in words if w[4]=='Invitation'][0]
    tot=[w for w in words if w[4]=='Total' and w[1]>rt[1]]; bottom=max(w[3] for w in tot)
    rows=[w for w in words if inv[1]-4<=w[1]<=bottom]
    x0=min(w[0] for w in rows); x1=max(w[2] for w in rows); top=inv[1]
    r=220; k=r/72; pad=9
    X=int((x0-pad)*k); Y=int((top-pad-2)*k); W=int((x1-x0+2*pad)*k); H=int((bottom-top+2*pad+2)*k)
    subprocess.run(['pdftoppm','-png','-r',str(r),'-f',str(pg),'-l',str(pg),'-x',str(X),'-y',str(Y),'-W',str(W),'-H',str(H),'-singlefile',f,f'{D}/t-{s}'])
    print(s, round(x0), round(x1), round(top), round(bottom))
