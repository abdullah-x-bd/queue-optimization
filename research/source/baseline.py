"""Exact controlled finite-cell queue design, service blocking, and final exit.

Python 3.11+, numpy, scipy. See README and research note for event semantics.
Run: python finite_queue.py --output results.json
All times are integer model units, not calibrated seconds.
"""
from __future__ import annotations
import argparse, json, time
from collections import defaultdict
from dataclasses import dataclass, asdict
from pathlib import Path
import numpy as np
from scipy.optimize import milp, Bounds, LinearConstraint
from scipy.sparse import coo_matrix

@dataclass
class Instance:
    N: int = 12
    p: int = 3
    merge_storage: int = 2
    queue_storage: int = 2
    source_rate: int = 3
    rows: int = 3
    source_storage: int = 12

def network(a):
    m=a.rows
    assert 1<=a.N<=a.source_storage and a.p>=1
    K={'X0':a.source_storage,'M':a.merge_storage,'X1':a.N}
    Q={'X0':a.source_rate,'M':1,'X1':a.N}
    for j in range(1,m+1):
        for prefix,k in [('A',a.queue_storage),('B',a.queue_storage),('E',1)]:
            K[f'{prefix}{j}']=k;Q[f'{prefix}{j}']=1
    # One construction variable per physical interface. Lateral interfaces
    # admit either direction but their two flows share capacity one.
    gates=[]
    for j in range(1,m+1):gates.append((f'entry{j}',[("X0",f'A{j}')]))
    for j in range(1,m+1):gates.append((f'lane{j}',[(f'A{j}',f'B{j}')]))
    for pre in ('A','B'):
        for j in range(1,m):
            gates.append((f'{pre}{j}_{pre}{j+1}',[(f'{pre}{j}',f'{pre}{j+1}'),(f'{pre}{j+1}',f'{pre}{j}')]))
    arcs=[]
    for g,(name,eds) in enumerate(gates):
        for u,v in eds:arcs.append((u,v,g))
    for j in range(1,m+1):arcs.append((f'E{j}','M',None))
    arcs.append(('M','X1',None))
    return K,Q,gates,arcs

def solve(a,H,*,budget=None,fixed_mask=None,minimize_links=True,limit=60):
    K,Q,gates,arcs=network(a)
    meta=[];lb=[];ub=[];obj=[];row=[];lo=[];hi=[]
    def var(kind,key,upper,cost=0,lower=0):
        z=len(meta);meta.append((kind,key));lb.append(lower);ub.append(upper);obj.append(cost);return z
    def con(d,l=-np.inf,h=np.inf):
        row.append({k:v for k,v in d.items() if v});lo.append(l);hi.append(h)
    def plus(d,i,c=1):d[i]=d.get(i,0)+c
    n={(v,t):var('n',(v,t),k) for v,k in K.items() for t in range(H+1)}
    f={(e,t):var('f',(e,t),1) for e in range(len(arcs)) for t in range(H)}
    st={(j,t):var('start',(j,t),1) for j in range(1,a.rows+1) for t in range(H)}
    rel={(j,t):var('release',(j,t),1) for j in range(1,a.rows+1) for t in range(H)}
    occ={(j,t):var('counter',(j,t),1) for j in range(1,a.rows+1) for t in range(H+1)}
    y={g:var('gate',g,1,1 if minimize_links else 0) for g in range(len(gates))}
    for v in K:con({n[v,0]:1},a.N if v=='X0' else 0,a.N if v=='X0' else 0)
    con({n['X1',H]:1},a.N,a.N)
    for j in range(1,a.rows+1):con({occ[j,0]:1},0,0)
    if fixed_mask is not None:
        for g in y:con({y[g]:1},int(bool(fixed_mask>>g&1)),int(bool(fixed_mask>>g&1)))
    if budget is not None:con({v:1 for v in y.values()},h=budget)
    incoming=defaultdict(list);outgoing=defaultdict(list);bygate=defaultdict(list)
    for e,(u,v,g) in enumerate(arcs):
        incoming[v].append(e);outgoing[u].append(e)
        if g is not None:bygate[g].append(e)
    for t in range(H):
        for g,es in bygate.items():
            d={f[e,t]:1 for e in es};d[y[g]]=-1;con(d,h=0)
        for v,k in K.items():
            ins={f[e,t]:1 for e in incoming[v]};outs={f[e,t]:1 for e in outgoing[v]}
            if v.startswith('B'):plus(outs,st[int(v[1:]),t])
            if v.startswith('E'):plus(ins,rel[int(v[1:]),t])
            bal={n[v,t+1]:1,n[v,t]:-1}
            for z,c in ins.items():plus(bal,z,-c)
            for z,c in outs.items():plus(bal,z,c)
            con(bal,0,0)
            send=dict(outs);plus(send,n[v,t],-1);con(send,h=0)
            con(outs,h=Q[v])
            if v!='X1':
                recv=dict(ins);plus(recv,n[v,t]);con(recv,h=k)
                con(ins,h=Q[v])
        for j in range(1,a.rows+1):
            con({occ[j,t+1]:1,occ[j,t]:-1,st[j,t]:-1,rel[j,t]:1},0,0)
            # Completed customers may stay at the counter. Releasing one at t
            # permits a new start at t, but never before p full service units.
            eligible={rel[j,u]:1 for u in range(t+1)}
            for u in range(max(0,t-a.p+1)):plus(eligible,st[j,u],-1)
            con(eligible,h=0)
    rr=[];cc=[];vv=[]
    for r,d in enumerate(row):
        for c,v in d.items():rr.append(r);cc.append(c);vv.append(v)
    A=coo_matrix((vv,(rr,cc)),shape=(len(row),len(meta))).tocsc()
    before=time.monotonic()
    ans=milp(np.asarray(obj,float),integrality=np.ones(len(meta)),
        bounds=Bounds(lb,ub),constraints=LinearConstraint(A,lo,hi),
        options={'time_limit':limit,'mip_rel_gap':0})
    result={'instance':asdict(a),'H':H,'budget':budget,'fixed_mask':fixed_mask,
      'status':int(ans.status),'message':str(ans.message),
      'objective':None if ans.x is None else float(ans.fun),
      'dual_bound':None if getattr(ans,'mip_dual_bound',None) is None else float(ans.mip_dual_bound),
      'gap':None if getattr(ans,'mip_gap',None) is None else float(ans.mip_gap),
      'seconds':time.monotonic()-before,'variables':len(meta),'constraints':len(row)}
    if ans.x is not None:
        x=np.rint(ans.x).astype(int)
        assert np.max(np.abs(x-ans.x))<1e-5
        result['gates']=[gates[g][0] for g in y if x[y[g]]]
        result['mask']=sum(1<<g for g in y if x[y[g]])
        result['moves']=[[t,arcs[e][0],arcs[e][1],int(x[z])] for (e,t),z in f.items() if x[z]]
        result['starts']=[[t,j] for (j,t),z in st.items() if x[z]]
        result['releases']=[[t,j] for (j,t),z in rel.items() if x[z]]
        result['occupancies']={v:[int(x[n[v,t]]) for t in range(H+1)] for v in K}
        result['counter_occupancies']={str(j):[int(x[occ[j,t]]) for t in range(H+1)] for j in range(1,a.rows+1)}
        result['moves'].sort();result['starts'].sort();result['releases'].sort()
    return result

def verify(result):
    """Independent integer event simulation; does not use the MILP matrix."""
    assert result['status']==0
    a=Instance(**result['instance']);H=result['H'];K,Q,gates,arcs=network(a)
    n={v:(a.N if v=='X0' else 0) for v in K}
    busy={j:None for j in range(1,a.rows+1)}
    allowed={(u,v):g for u,v,g in arcs};chosen=set(result['gates'])
    moves=defaultdict(list);starts=defaultdict(list);releases=defaultdict(list)
    assert all(isinstance(t,int) and 0<=t<H for t,u,v,k in result['moves'])
    assert all(isinstance(t,int) and 0<=t<H and 1<=j<=a.rows for t,j in result['starts']+result['releases'])
    for t,u,v,k in result['moves']:moves[t].append((u,v,k))
    for t,j in result['starts']:starts[t].append(j)
    for t,j in result['releases']:releases[t].append(j)
    nservice=0;blocked=[];full_cells=[]
    for t in range(H+1):
        assert all(n[v]==result['occupancies'][v][t] for v in K)
        assert all(int(busy[j] is not None)==result['counter_occupancies'][str(j)][t] for j in busy)
        assert sum(n.values())+sum(s is not None for s in busy.values())==a.N
        assert all(0<=n[v]<=K[v] for v in K)
        if t==H:break
        ins=defaultdict(int);outs=defaultdict(int);gate_load=defaultdict(int)
        for u,v,k in moves[t]:
            assert (u,v) in allowed and k==1
            g=allowed[u,v]
            if g is not None:
                assert gates[g][0] in chosen;gate_load[g]+=k
            ins[v]+=k;outs[u]+=k
        assert all(z<=1 for z in gate_load.values())
        for j in busy:
            if busy[j] is not None and t>=busy[j]+a.p and n[f'E{j}']==K[f'E{j}']:
                blocked.append([t,j])
        for j in releases[t]:
            assert busy[j] is not None and t>=busy[j]+a.p
            busy[j]=None;ins[f'E{j}']+=1
        for j in starts[t]:
            assert busy[j] is None
            busy[j]=t;outs[f'B{j}']+=1;nservice+=1
        for v in K:
            assert outs[v]<=min(n[v],Q[v]),(t,v,'sending')
            if v!='X1':assert ins[v]<=min(Q[v],K[v]-n[v]),(t,v,'receiving')
            if v not in ('X0','X1') and n[v]==K[v]:full_cells.append([t,v])
        n={v:n[v]+ins[v]-outs[v] for v in K}
    assert n['X1']==a.N and nservice==a.N
    assert all(s is None for s in busy.values())
    assert all(n[v]==0 for v in K if v!='X1')
    if result['budget'] is not None:assert len(chosen)<=result['budget']
    return {'verified':True,'service_count':nservice,'exited':n['X1'],
        'last_exit':next(t for t,z in enumerate(result['occupancies']['X1']) if z==a.N),
        'counter_blocked_events':blocked,'full_cell_events':full_cells}

def main():
    pa=argparse.ArgumentParser();pa.add_argument('--output',default='results.json');pa.add_argument('--limit',type=float,default=60)
    args=pa.parse_args();res=[]
    experiments=[('short_deadline',Instance(),18,None,None),
                 ('global_optimum',Instance(),19,None,None),
                 ('four_links',Instance(),19,4,None),
                 ('separate_lanes',Instance(),19,None,63),
                 ('one_person_merge_short',Instance(merge_storage=1),29,None,None),
                 ('one_person_merge_optimum',Instance(merge_storage=1),30,None,None)]
    for name,a,H,B,mask in experiments:
        r=solve(a,H,budget=B,fixed_mask=mask,limit=args.limit)
        r['name']=name
        if r['status']==0:r['verification']=verify(r)
        res.append(r)
        Path(args.output).write_text(json.dumps(res,indent=2))
        print(json.dumps({k:r.get(k) for k in ['name','H','status','objective','dual_bound','gap','gates','seconds']}),flush=True)

if __name__=='__main__':main()
