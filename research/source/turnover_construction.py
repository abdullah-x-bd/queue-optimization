from synthesis import family,verify
from collections import defaultdict
import json
from pathlib import Path

def witness(N,m,p,K):
    s=family(N=N,ps=(p,)*m,K=K,Q=1,receiving='turnover');C=s['cells'];J=s['counters']
    P=max(p,m);q,r=divmod(N-1,m);H=p+5+P*q+r
    index={(a['u'],a['v']):i for i,a in enumerate(s['arcs'])}
    moves=[];starts=[];releases=[]
    for i in range(N):
        k,j=divmod(i,m);j+=1;t=2+k*P+j-1;release=t+p
        for tm,u,v in [(t-2,'S',f'A{j}'),(t-1,f'A{j}',f'B{j}'),(release+1,f'E{j}','M'),(release+2,'M','X')]:moves.append([tm,index[u,v],1])
        starts.append([t,str(j)]);releases.append([release,str(j)])
    n={v:N if v=='S' else 0 for v in C};busy={j:0 for j in J}
    occ={v:[n[v]] for v in C};bo={j:[0] for j in J};mm=defaultdict(list);ss=defaultdict(list);rr=defaultdict(list)
    for t,e,k in moves:mm[t].append((e,k))
    for t,j in starts:ss[t].append(j)
    for t,j in releases:rr[t].append(j)
    for t in range(H):
        for e,k in mm[t]:a=s['arcs'][e];n[a['u']]-=k;n[a['v']]+=k
        for j in ss[t]:n[J[j]['input']]-=1;busy[j]+=1
        for j in rr[t]:n[J[j]['output']]+=1;busy[j]-=1
        for v in C:occ[v].append(n[v])
        for j in J:bo[j].append(busy[j])
    z={'spec':s,'H':H,'status':0,'gates':[g for g in s['gates'] if g.startswith(('entry','lane'))],
       'cells':list(C),'counters':list(J),'cost':0,'area':0,
       'limits':dict.fromkeys(['gate_budget','cost_budget','area_budget','active_limit']),
       'moves':moves,'starts':starts,'releases':releases,'occupancies':occ,'busy':bo}
    z['verification']=verify(z);return z

if __name__=='__main__':
    count=0
    for N in range(1,31):
        for m in range(1,7):
            for p in range(1,11):
                for K in [1,2]:witness(N,m,p,K);count+=1
    Path(__file__).with_name('turnover_checks.json').write_text(json.dumps({'construction_checks':count,'example':witness(12,3,3,1)},indent=2))
    print('turnover independently checked',count,flush=True)
