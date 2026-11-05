import json, math, sys
d=sys.argv[1]
R={x['id']:x for x in json.load(open(d+'/railways.json'))}
S={x['id']:x for x in json.load(open(d+'/stations.json'))}
G=[ # filter group name, color, line ids
 ('山手線','#80C342',['Yamanote']),
 ('京浜東北線','#00B2E5',['KeihinTohokuNegishi']),
 ('中央線快速','#F15A22',['ChuoRapid']),
 ('中央・総武線各停','#FFD400',['ChuoSobuLocal']),
 ('埼京線・川越線','#00B48D',['SaikyoKawagoe','Kawagoe']),
 ('湘南新宿ライン','#E31F26',['ShonanShinjuku']),
 ('宇都宮線','#F68B1E',['Utsunomiya']),
 ('高崎線','#F68B1E',['Takasaki']),
 ('東海道線','#F68B1E',['Tokaido']),
 ('横須賀線','#007AC1',['Yokosuka']),
 ('総武快速線','#007AC1',['SobuRapid']),
 ('常磐線','#00B261',['JobanRapid','Joban']),
 ('常磐線各停','#A8A39D',['JobanLocal']),
 ('京葉線','#C9252F',['Keiyo']),
 ('武蔵野線','#F15A22',['Musashino','KeiyoFutamataBranch','KeiyoKoyaBranch']),
 ('南武線','#FFD400',['Nambu']),
 ('横浜線','#80C342',['Yokohama']),
 ('青梅線','#F15A22',['Ome']),
 ('五日市線','#F15A22',['Itsukaichi']),
 ('八高線','#A8A39D',['Hachiko']),
 ('中央本線','#0074BE',['Chuo']),
 ('相鉄直通線','#00B48D',['SotetsuDirect']),
]
LAT0=35.75; kx=111.32*math.cos(math.radians(LAT0)); ky=110.95
stations=[]; key={}
def sidx(sid):
    st=S[sid]; n=st['title']['ja']; lon,lat=st['coord']
    x=(lon-139.70)*kx; y=-(lat-LAT0)*ky
    for i in key.get(n,[]):
        s=stations[i]
        if math.hypot(s['x']-x,s['y']-y)<1.5: return i
    stations.append({'n':n,'x':x,'y':y,'g':[]}); key.setdefault(n,[]).append(len(stations)-1)
    return len(stations)-1
groups=[]; lines=[]
for gi,(name,color,ids) in enumerate(G):
    groups.append({'n':name,'c':color})
    for lid in ids:
        rr=R['JR-East.'+lid]; seq=[sidx(s) for s in rr['stations']]
        for i in seq:
            if gi not in stations[i]['g']: stations[i]['g'].append(gi)
        lines.append({'g':gi,'s':seq})
for s in stations: s['x']=round(s['x'],3); s['y']=round(s['y'],3)
json.dump({'groups':groups,'stations':stations,'lines':lines},open(sys.argv[2],'w'),ensure_ascii=False,separators=(',',':'))
print(len(stations), sum(len(l['s']) for l in lines))
# report merged duplicate names
from collections import Counter
c=Counter(s['n'] for s in stations); print([k for k,v in c.items() if v>1])
for n in ['新宿','東京','大宮','武蔵浦和','西船橋','八王子']:
    i=key[n][0]; print(n,[groups[g]['n'] for g in stations[i]['g']])
