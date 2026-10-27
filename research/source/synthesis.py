"""Exact finite candidate-graph topology synthesis with independent replay.

No algorithmic novelty is claimed for this mixed-integer formulation.
All arrivals are initially at S; pre/post service cells are disjoint. Each
customer crosses exactly one nonpreemptive counter before reaching X.
Movement takes one tick. Longer corridors can be subdivided into cells.
"""
from __future__ import annotations
from collections import defaultdict
from copy import deepcopy
import json,time
from pathlib import Path
import numpy as np
from scipy.optimize import milp,Bounds,LinearConstraint
from scipy.sparse import coo_matrix

def validate(s):
    assert isinstance(s['N'],int) and s['N']>0
    assert s['receiving'] in ('strict','turnover')
    cells=s['cells'];assert cells['S']['K']>=s['N']
    assert cells['S']['phase']==0 and cells['X']['phase']==1
    for v,c in cells.items():
        assert c['K']>=1 and c['Q']>=1 and c['cost']>=0 and c['area']>=0
        assert isinstance(c['K'],int) and isinstance(c['Q'],int)
    for g,c in s['gates'].items():
        assert isinstance(c['cap'],int) and c['cap']>=1 and c['cost']>=0 and c['area']>=0
    assert s['counters']
    for e in s['arcs']:
        assert cells[e['u']]['phase']==cells[e['v']]['phase']
        assert e['v']!='S' and e['u']!='X' and e['cap']>=1
        assert isinstance(e['cap'],int)
        if e['gate'] is not None:assert e['gate'] in s['gates']
    for j,c in s['counters'].items():
        assert isinstance(c['p'],int) and c['p']>=1
        assert cells[c['input']]['phase']==0 and cells[c['output']]['phase']==1
        assert c['cost']>=0 and c['area']>=0
    for group in s.get('counter_groups',[])+s.get('site_groups',[]):
        assert set(group)<=s['counters'].keys()

def solve(s,H,*,objective='connections',gate_budget=None,cost_budget=None,
          area_budget=None,fixed_gates=None,active_limit=None,limit=120):
    validate(s);C=s['cells'];J=s['counters'];E=s['arcs'];G=s['gates']
    assert objective in ('connections','cost','area','feasible')
    meta=[];lb=[];ub=[];obj=[];rows=[];lo=[];hi=[]
    def var(kind,key,upper,cost=0,lower=0):
        i=len(meta);meta.append((kind,key));lb.append(lower);ub.append(upper);obj.append(cost);return i
    def con(d,l=-np.inf,h=np.inf):rows.append({k:v for k,v in d.items() if v});lo.append(l);hi.append(h)
    def add(d,z,c=1):d[z]=d.get(z,0)+c
    n={(v,t):var('n',(v,t),c['K']) for v,c in C.items() for t in range(H+1)}
    f={(e,t):var('f',(e,t),a['cap']) for e,a in enumerate(E) for t in range(H)}
    st={(j,t):var('start',(j,t),1) for j in J for t in range(H)}
    re={(j,t):var('release',(j,t),1) for j in J for t in range(H)}
    oc={(j,t):var('busy',(j,t),1) for j in J for t in range(H+1)}
    y={g:var('gate',g,1,1 if objective=='connections' else c.get(objective,0) if objective in ('cost','area') else 0) for g,c in G.items()}
    h={v:var('cell',v,1,c.get(objective,0) if objective in ('cost','area') else 0,1 if c.get('fixed') else 0) for v,c in C.items()}
    w={j:var('counter',j,1,c.get(objective,0) if objective in ('cost','area') else 0) for j,c in J.items()}
    z={(g,t):var('open',(g,t),1) for g in G for t in range(H)} if active_limit is not None else None
    costs={};areas={}
    for objects,variables in ((C,h),(J,w),(G,y)):
        for k,c in objects.items():costs[variables[k]]=c['cost'];areas[variables[k]]=c['area']
    if gate_budget is not None:con({v:1 for v in y.values()},h=gate_budget)
    if cost_budget is not None:con(costs,h=cost_budget)
    if area_budget is not None:con(areas,h=area_budget)
    if fixed_gates is not None:
        for g in G:con({y[g]:1},int(g in fixed_gates),int(g in fixed_gates))
    for v,c in C.items():
        con({n[v,0]:1},s['N'] if v=='S' else 0,s['N'] if v=='S' else 0)
        for t in range(H+1):con({n[v,t]:1,h[v]:-c['K']},h=0)
    con({n['X',H]:1},s['N'],s['N'])
    incoming=defaultdict(list);outgoing=defaultdict(list);bygate=defaultdict(list)
    for e,a in enumerate(E):
        incoming[a['v']].append(e);outgoing[a['u']].append(e)
        if a['gate'] is not None:
            g=a['gate'];bygate[g].append(e)
            for v in (a['u'],a['v']):con({y[g]:1,h[v]:-1},h=0)
        else:
            for t in range(H):
                for v in (a['u'],a['v']):con({f[e,t]:1,h[v]:-a['cap']},h=0)
    for j,c in J.items():
        con({oc[j,0]:1},0,0)
        for v in (c['input'],c['output']):con({w[j]:1,h[v]:-1},h=0)
        for t in range(H+1):con({oc[j,t]:1,w[j]:-1},h=0)
        for t in range(H):con({st[j,t]:1,w[j]:-1},h=0)
    # Optional placement alternatives: each physical counter is built at at
    # most one candidate site, and each site hosts at most one counter.
    for group in s.get('counter_groups',[])+s.get('site_groups',[]):
        con({w[j]:1 for j in group},h=1)
    for t in range(H):
        if z is not None:
            con({z[g,t]:1 for g in G},h=active_limit)
            for g in G:con({z[g,t]:1,y[g]:-1},h=0)
        for g,es in bygate.items():
            d={f[e,t]:1 for e in es};d[z[g,t] if z is not None else y[g]]=-G[g]['cap'];con(d,h=0)
        for v,c in C.items():
            ins={f[e,t]:1 for e in incoming[v]};outs={f[e,t]:1 for e in outgoing[v]}
            for j,ctr in J.items():
                if ctr['input']==v:add(outs,st[j,t])
                if ctr['output']==v:add(ins,re[j,t])
            bal={n[v,t+1]:1,n[v,t]:-1}
            for k,x in ins.items():add(bal,k,-x)
            for k,x in outs.items():add(bal,k,x)
            con(bal,0,0)
            send=dict(outs);add(send,n[v,t],-1);con(send,h=0);con(outs,h=c['Q'])
            if v!='X':
                recv=dict(ins);add(recv,n[v,t]);add(recv,h[v],-c['K'])
                if s['receiving']=='turnover':
                    for k,x in outs.items():add(recv,k,-x)
                con(recv,h=0);con(ins,h=c['Q'])
        for j,c in J.items():
            con({oc[j,t+1]:1,oc[j,t]:-1,st[j,t]:-1,re[j,t]:1},0,0)
            eligible={re[j,u]:1 for u in range(t+1)}
            for u in range(max(0,t-c['p']+1)):add(eligible,st[j,u],-1)
            con(eligible,h=0)
    rr=[];cc=[];vv=[]
    for r,d in enumerate(rows):
        for k,v in d.items():rr.append(r);cc.append(k);vv.append(v)
    A=coo_matrix((vv,(rr,cc)),shape=(len(rows),len(meta))).tocsc()
    before=time.monotonic()
    ans=milp(np.array(obj,float),integrality=np.ones(len(meta)),bounds=Bounds(lb,ub),
      constraints=LinearConstraint(A,lo,hi),options={'time_limit':limit,'mip_rel_gap':0})
    out={'spec':s,'H':H,'objective_kind':objective,'status':int(ans.status),'message':str(ans.message),
      'objective':None if ans.x is None else float(ans.fun),'seconds':time.monotonic()-before,
      'dual':None if getattr(ans,'mip_dual_bound',None) is None else float(ans.mip_dual_bound),
      'gap':None if getattr(ans,'mip_gap',None) is None else float(ans.mip_gap),
      'limits':{'gate_budget':gate_budget,'cost_budget':cost_budget,'area_budget':area_budget,'active_limit':active_limit},
      'variables':len(meta),'constraints':len(rows)}
    if ans.x is not None:
        x=np.rint(ans.x).astype(int);assert np.max(abs(x-ans.x))<1e-5
        out.update({'gates':[g for g in G if x[y[g]]], 'cells':[v for v in C if x[h[v]]],
          'counters':[j for j in J if x[w[j]]],
          'cost':float(sum(c*x[i] for i,c in costs.items())), 'area':float(sum(c*x[i] for i,c in areas.items())),
          'moves':sorted([[t,e,int(x[i])] for (e,t),i in f.items() if x[i]]),
          'starts':sorted([[t,j] for (j,t),i in st.items() if x[i]]),
          'releases':sorted([[t,j] for (j,t),i in re.items() if x[i]]),
          'occupancies':{v:[int(x[n[v,t]]) for t in range(H+1)] for v in C},
          'busy':{j:[int(x[oc[j,t]]) for t in range(H+1)] for j in J}})
        if z is not None:out['open']=sorted([[t,g] for (g,t),i in z.items() if x[i]])
        out['verification']=verify(out)
    return out

def verify(r):
    """Check an integer event trace, without using any optimizer constraint."""
    s=r['spec'];validate(s);H=r['H'];C=s['cells'];J=s['counters'];E=s['arcs'];G=s['gates']
    chosen=set(r['gates']);built=set(r['cells']);servers=set(r['counters'])
    assert chosen<=G.keys() and built<=C.keys() and servers<=J.keys()
    for v,c in C.items():assert not c.get('fixed') or v in built
    cost=sum(C[v]['cost'] for v in built)+sum(J[j]['cost'] for j in servers)+sum(G[g]['cost'] for g in chosen)
    area=sum(C[v]['area'] for v in built)+sum(J[j]['area'] for j in servers)+sum(G[g]['area'] for g in chosen)
    assert abs(cost-r['cost'])<1e-6 and abs(area-r['area'])<1e-6
    for key,value in [('cost_budget',cost),('area_budget',area),('gate_budget',len(chosen))]:
        assert r['limits'][key] is None or value<=r['limits'][key]+1e-6
    for e in E:
        if e['gate'] in chosen:assert e['u'] in built and e['v'] in built
    for j in servers:assert J[j]['input'] in built and J[j]['output'] in built
    for group in s.get('counter_groups',[])+s.get('site_groups',[]):
        assert len(servers.intersection(group))<=1
    assert len({(t,e) for t,e,k in r['moves']})==len(r['moves'])
    assert len({tuple(x) for x in r['starts']})==len(r['starts'])
    assert len({tuple(x) for x in r['releases']})==len(r['releases'])
    mm=defaultdict(list);ss=defaultdict(list);rr=defaultdict(list);op=defaultdict(set)
    for t,e,k in r['moves']:assert 0<=t<H and isinstance(k,int) and 1<=k<=E[e]['cap'];mm[t].append((e,k))
    for t,j in r['starts']:assert 0<=t<H and j in servers;ss[t].append(j)
    for t,j in r['releases']:assert 0<=t<H and j in servers;rr[t].append(j)
    for t,g in r.get('open',[]):assert 0<=t<H and g in chosen;op[t].add(g)
    durations={(t,j):d for t,j,d in r.get('service_durations',[])}
    if durations:
        assert len(durations)==len(r['starts']) and set(durations)=={(t,j) for t,j in r['starts']}
        assert all(isinstance(d,int) and d>=1 for d in durations.values())
    n={v:s['N'] if v=='S' else 0 for v in C};busy={j:None for j in J};served=0;blocks=0
    for t in range(H+1):
        assert all(n[v]==r['occupancies'][v][t] for v in C)
        assert all(int(busy[j] is not None)==r['busy'][j][t] for j in J)
        assert sum(n.values())+sum(x is not None for x in busy.values())==s['N']
        assert all(0<=n[v]<=C[v]['K']*(v in built) for v in C)
        if t==H:break
        ins=defaultdict(int);outs=defaultdict(int);gate=defaultdict(int)
        for e,k in mm[t]:
            a=E[e];assert a['u'] in built and a['v'] in built
            if a['gate'] is not None:assert a['gate'] in chosen;gate[a['gate']]+=k
            ins[a['v']]+=k;outs[a['u']]+=k
        for g,k in gate.items():assert k<=G[g]['cap']
        if r['limits']['active_limit'] is not None:
            assert len(op[t])<=r['limits']['active_limit'] and gate.keys()<=op[t]
        for j in rr[t]:
            assert busy[j] is not None and t>=busy[j][0]+busy[j][1]
            busy[j]=None;ins[J[j]['output']]+=1
        for j in ss[t]:
            assert busy[j] is None
            busy[j]=(t,durations.get((t,j),J[j]['p']));outs[J[j]['input']]+=1;served+=1
        for v,c in C.items():
            assert outs[v]<=min(n[v],c['Q']),(t,v,'send',outs[v],n[v])
            if v!='X':
                space=c['K']*(v in built)-n[v]+(outs[v] if s['receiving']=='turnover' else 0)
                assert ins[v]<=min(c['Q'],space),(t,v,'receive',ins[v],space)
        for j in J:
            if busy[j] is not None and t>=busy[j][0]+busy[j][1] and n[J[j]['output']]==C[J[j]['output']]['K']:blocks+=1
        n={v:n[v]+ins[v]-outs[v] for v in C}
    assert n['X']==s['N'] and served==s['N']
    assert all(n[v]==0 for v in C if v!='X') and all(x is None for x in busy.values())
    return {'passed':True,'exited':n['X'],'service_starts':served,'last_exit':next(t for t,k in enumerate(r['occupancies']['X']) if k==s['N']),'blocked_counter_ticks':blocks}

def family(N=12,ps=(3,3,3),K=2,Q=3,receiving='strict',rate=1,priced=False):
    m=len(ps);cells={'S':{'K':N,'Q':Q,'phase':0,'cost':0,'area':0,'fixed':True},
                    'X':{'K':N,'Q':N,'phase':1,'cost':0,'area':0,'fixed':True},
                    'M':{'K':K,'Q':rate,'phase':1,'cost':0,'area':0,'fixed':True}}
    for j in range(1,m+1):
        for pre,k,phase in [('A',2,0),('B',2,0),('E',1,1)]:
            cells[f'{pre}{j}']={'K':k,'Q':rate,'phase':phase,'cost':100*k if priced else 0,'area':k if priced else 0}
    gates={};arcs=[]
    def gate(name,edges):
        gates[name]={'cap':rate,'cost':40 if priced else 0,'area':0}
        for u,v in edges:arcs.append({'u':u,'v':v,'gate':name,'cap':rate})
    for j in range(1,m+1):gate(f'entry{j}',[('S',f'A{j}')])
    for j in range(1,m+1):gate(f'lane{j}',[(f'A{j}',f'B{j}')])
    for pre in ('A','B'):
        for j in range(1,m):gate(f'{pre}{j}_{pre}{j+1}',[(f'{pre}{j}',f'{pre}{j+1}'),(f'{pre}{j+1}',f'{pre}{j}')])
    for j in range(1,m+1):arcs.append({'u':f'E{j}','v':'M','gate':None,'cap':rate})
    arcs.append({'u':'M','v':'X','gate':None,'cap':rate})
    counters={str(j):{'input':f'B{j}','output':f'E{j}','p':p,'cost':600 if priced else 0,'area':4 if priced else 0} for j,p in enumerate(ps,1)}
    return {'N':N,'receiving':receiving,'cells':cells,'arcs':arcs,'gates':gates,'counters':counters,'label':'row family'}

def optimistic_bound(s):
    """Safe bound for direct-row family only: per-counter streams + exit cap."""
    assert s['label']=='row family' and s['cells']['M']['Q']==1
    delta=2 if s['receiving']=='strict' and s['cells']['M']['K']==1 else 1
    events=[]
    for c in s['counters'].values():
        b=max(c['p'],2) if s['receiving']=='strict' else c['p']
        events.extend(c['p']+5+k*b for k in range(s['N']))
    events.sort();last=-10**9
    for e in events[:s['N']]:last=max(e,last+delta)
    return last

def quickest(s,lower,upper,**kw):
    """Monotone binary deadline search; retain both final feasibility bounds."""
    checks=[];lo=lower-1;hi=upper;best=None
    while lo+1<hi:
        H=(lo+hi)//2;r=solve(s,H,objective='feasible',**kw);checks.append(r)
        if r['status']==2:lo=H
        elif r['status']==0:hi=H;best=r
        else:raise RuntimeError(f'Unresolved deadline {H}: {r["message"]}')
    if best is None or best['H']!=hi:
        best=solve(s,hi,objective='feasible',**kw);checks.append(best)
        assert best['status']==0
    # Always ask the optimizer to confirm the immediately shorter deadline,
    # including when lower was an analytical lower bound.
    if hi>0 and not any(r['H']==hi-1 and r['status']==2 for r in checks):
        z=solve(s,hi-1,objective='feasible',**kw);checks.append(z);assert z['status']==2
    sparse=solve(s,hi,objective='connections',**kw);assert sparse['status']==0
    return {'T':hi,'optimal':sparse,'checks':checks}

def automatic(s,**kw):
    """Complete deadline search for this finite model, unless a solve times out.

    Any feasible design contains one source -> counter -> exit path. Sending
    jobs one at a time along a simple such path yields the finite upper bound.
    This argument uses nonnegative construction costs and no time windows.
    """
    validate(s)
    pre=sum(c['phase']==0 for c in s['cells'].values())
    post=len(s['cells'])-pre
    Hmax=s['N']*(pre+post-1+max(c['p'] for c in s['counters'].values()))
    trials=[];H=1
    while True:
        H=min(H,Hmax);z=solve(s,H,objective='feasible',**kw);trials.append(z)
        if z['status']==0:
            answer=quickest(s,1,H,**kw);answer['bracketing']=trials;answer['finite_horizon_bound']=Hmax;return answer
        if z['status']!=2:raise RuntimeError('Solver timed out; no optimality claim is valid.')
        if H==Hmax:return {'status':'infeasible','bracketing':trials,'finite_horizon_bound':Hmax}
        H*=2

if __name__=='__main__':
    import argparse
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('spec',help='JSON candidate graph specification')
    p.add_argument('--output',default='synthesized.json')
    p.add_argument('--cost-budget',type=int)
    p.add_argument('--area-budget',type=int)
    p.add_argument('--time-limit',type=float,default=120)
    args=p.parse_args();spec=json.loads(Path(args.spec).read_text())
    result=automatic(spec,cost_budget=args.cost_budget,area_budget=args.area_budget,limit=args.time_limit)
    Path(args.output).write_text(json.dumps(result,indent=2))
    print(json.dumps({'T':result.get('T'),'status':result.get('status','optimal'),'file':args.output}))
