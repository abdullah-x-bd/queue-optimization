"""General sparse constructions for the strict synchronous row family."""
from math import ceil
from collections import defaultdict
from dataclasses import asdict
from baseline import Instance, network, verify, solve

def time_bound(a, active=None):
    m=a.rows if active is None else active
    delta=2 if a.merge_storage==1 else 1
    b=max(a.p,2)
    q,r=divmod(a.N-1,m)
    return a.p+5+max(b,m*delta)*q+delta*r

def necessary_counters(a):
    delta=2 if a.merge_storage==1 else 1
    return min(a.N,a.rows,ceil(max(a.p,2)/delta))

def pack(a,moves,starts,releases,label):
    K,Q,gates,arcs=network(a)
    H=max(t+1 for t,u,v,k in moves if v=='X1')
    lookup={(u,v):g for u,v,g in arcs}
    used={lookup[u,v] for _,u,v,_ in moves if lookup[u,v] is not None}
    result={'name':label,'instance':asdict(a),'H':H,'budget':None,'status':0,
      'gates':[gates[g][0] for g in sorted(used)],'mask':sum(1<<g for g in used),
      'moves':sorted(moves),'starts':sorted(starts),'releases':sorted(releases)}
    n={v:(a.N if v=='X0' else 0) for v in K};busy={j:0 for j in range(1,a.rows+1)}
    result['occupancies']={v:[n[v]] for v in K}
    result['counter_occupancies']={str(j):[0] for j in busy}
    mm=defaultdict(list);ss=defaultdict(list);rr=defaultdict(list)
    for t,u,v,k in moves:mm[t].append((u,v,k))
    for t,j in starts:ss[t].append(j)
    for t,j in releases:rr[t].append(j)
    for t in range(H):
        for u,v,k in mm[t]:n[u]-=k;n[v]+=k
        for j in ss[t]:n[f'B{j}']-=1;busy[j]+=1
        for j in rr[t]:n[f'E{j}']+=1;busy[j]-=1
        for v in K:result['occupancies'][v].append(n[v])
        for j in busy:result['counter_occupancies'][str(j)].append(busy[j])
    result['verification']=verify(result)
    assert H==time_bound(a),(a,H,time_bound(a))
    return result

def sparse_witness(a):
    r=necessary_counters(a);delta=2 if a.merge_storage==1 else 1
    P=max(max(a.p,2),r*delta)
    moves=[];starts=[];releases=[]
    for i in range(a.N):
        k,h=divmod(i,r)
        if delta==2:
            root=1;dist=h;counter=h+1;source=k*P+h
        elif r==1:
            root=counter=1;dist=0;source=k*P
        else:
            left=ceil(r/2);side=h%2;dist=h//2
            root=left+side;counter=root+(-1 if side==0 else 1)*dist
            source=k*P+dist+side
        start=2+k*P+delta*h
        moves.extend([[source,'X0',f'A{root}',1],[source+1,f'A{root}',f'B{root}',1]])
        step=1 if counter>=root else -1
        for d in range(dist):
            u=root+step*d;v=u+step
            moves.append([source+2+d,f'B{u}',f'B{v}',1])
        assert source+2+dist==start
        release=start+a.p
        starts.append([start,counter]);releases.append([release,counter])
        moves.extend([[release+1,f'E{counter}','M',1],[release+2,'M','X1',1]])
    return pack(a,moves,starts,releases,'general_sparse_construction')

def single_feed_slack_witness(a):
    """An exact low-connection solution in a service-limited finite-batch case."""
    m=a.rows;b=max(a.p,2)
    assert m>=2 and a.merge_storage>=2 and b>=2*m-1 and a.N>m and (a.N-1)%m==0
    moves=[];starts=[];releases=[]
    for i in range(a.N):
        k,h=divmod(i,m);source=k*b+h;start=2+k*b+2*h;j=h+1
        moves.extend([[source,'X0','A1',1],[source+1,'A1','B1',1]])
        for d in range(h):moves.append([source+2+d,f'B{d+1}',f'B{d+2}',1])
        release=start+a.p;starts.append([start,j]);releases.append([release,j])
        moves.extend([[release+1,f'E{j}','M',1],[release+2,'M','X1',1]])
    result=pack(a,moves,starts,releases,'single_feed_service_slack_construction')
    assert len(result['gates'])==m+1
    return result

def check_constructions():
    count=0
    for m in range(1,9):
        for p in range(1,15):
            for N in range(1,41):
                for K in (1,2):
                    a=Instance(N=N,p=p,rows=m,source_storage=N,merge_storage=K,source_rate=1 if K==1 else 2)
                    r=necessary_counters(a)
                    assert r==next(k for k in range(1,m+1) if time_bound(a,k)==time_bound(a))
                    z=sparse_witness(a)
                    expected=r+1 if K==1 or r==1 else r+2
                    assert len(z['gates'])==expected,(a,z['gates'],expected)
                    count+=1
    return count

if __name__=='__main__':
    import json
    from pathlib import Path
    count=check_constructions()
    print('independent construction checks:',count,flush=True)
    params=[(2,3,8,1,1),(4,7,9,1,1),(5,9,11,1,1),
            (2,2,7,2,2),(4,4,9,2,2),(4,4,9,2,1),
            (3,4,4,2,1),(3,4,4,2,2),(3,4,12,2,2),
            (4,6,5,2,2),(3,7,8,2,1),(3,7,8,2,2)]
    checks=[]
    for m,p,N,K,Q in params:
        a=Instance(N=N,p=p,rows=m,source_storage=N,merge_storage=K,source_rate=Q)
        z=solve(a,time_bound(a),limit=120)
        if z['status']==0:z['verification']=verify(z)
        checks.append(z)
        Path(__file__).with_name('portal_results.json').write_text(json.dumps({'construction_checks':count,'milp':checks},indent=2))
        print((m,p,N,K,Q),'T',z['H'],'status',z['status'],'portals',z.get('objective'),'seconds',round(z['seconds'],2),flush=True)
