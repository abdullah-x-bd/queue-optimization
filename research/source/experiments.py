"""Reproducible exact experiments, with timeouts treated as unresolved."""
import json
from pathlib import Path
from synthesis import family,solve,quickest,optimistic_bound

HERE=Path(__file__).parent
def save(name,data):
    (HERE/name).write_text(json.dumps(data,indent=2))

def heterogeneity():
    results=[]
    for ps in [(1,3,5),(2,3,5),(1,4,7),(2,5,8)]:
        for K,Q in [(2,3),(2,1),(1,3)]:
            s=family(ps=ps,K=K,Q=Q)
            L=optimistic_bound(s)
            r=quickest(s,L,L+12,limit=90)
            results.append(r);save('heterogeneous.json',results)
            print('hetero',ps,'K,Q',K,Q,'lower',L,'T',r['T'],'links',len(r['optimal']['gates']),flush=True)
    return results

def sensitivity():
    results=[]
    for p,K,receiving,rate in [(3,1,'strict',1),(3,1,'turnover',1),
         (1,1,'strict',1),(1,1,'turnover',1),(3,2,'strict',1),
         (3,2,'strict',2),(3,3,'strict',2),(1,2,'strict',2),
         (1,3,'strict',2),(3,2,'turnover',2)]:
        s=family(ps=(p,p,p),K=K,receiving=receiving,rate=rate)
        r=quickest(s,p+5,40,limit=120)
        results.append(r);save('sensitivity_exact.json',results)
        print('sensitivity',p,K,receiving,rate,'T',r['T'],'links',len(r['optimal']['gates']),flush=True)
    return results

def budget_frontier():
    results=[]
    s=family(ps=(1,3,5),priced=True)
    for j,cost in [('1',900),('2',600),('3',450)]:s['counters'][j]['cost']=cost
    # Costs and areas are incremental to a common source/merge/sink footprint.
    # Cost units are explicitly illustrative, not market quotations.
    for H in range(18,30):
        r=solve(s,H,objective='cost',limit=120)
        results.append(r);save('budget_frontier.json',results)
        print('budget deadline',H,'status',r['status'],'cost',r.get('cost'),'area',r.get('area'),'servers',r.get('counters'),'links',r.get('gates'),flush=True)
    return results

def topology_comparison():
    masks={'dedicated':['entry1','entry2','entry3','lane1','lane2','lane3'],
           'two_feeders':['entry1','entry3','lane1','lane3','B1_B2'],
           'central_pool':['entry2','lane2','B1_B2','B2_B3']}
    out=[]
    for ps in [(3,3,3),(1,3,5)]:
        s=family(ps=ps)
        for name,gates in masks.items():
            r=quickest(s,optimistic_bound(s),45,fixed_gates=gates,limit=120)
            r['label']=name;out.append(r);save('topology_comparison.json',out)
            print('topology',ps,name,'T',r['T'],flush=True)
    # Dynamic gate opening changes the resource definition. Bound active
    # simultaneously, while retaining the cost of every constructed portal.
    s=family()
    for active in [1,2,3]:
        r=quickest(s,19,48,active_limit=active,limit=120)
        r['label']=f'dynamic_active_{active}';out.append(r);save('topology_comparison.json',out)
        print('dynamic active',active,'T',r['T'],'installed',len(r['optimal']['gates']),flush=True)

if __name__=='__main__':
    import sys
    functions={'hetero':heterogeneity,'sensitivity':sensitivity,'budget':budget_frontier,'topology':topology_comparison}
    for name in sys.argv[1:] or functions:functions[name]()
