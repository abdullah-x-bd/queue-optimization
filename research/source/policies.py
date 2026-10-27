"""Causal policy experiments. Realized durations are hidden until completion.

Job IDs retain the same independent durations across all compared policies.
No policy reads a future duration, or the remaining duration of a busy job.
These are policy evaluations, not stochastic optimization certificates.
"""
from collections import defaultdict,deque
import json,math
from pathlib import Path
import numpy as np
from synthesis import family,verify

TOPOLOGIES={
 'dedicated':(['entry1','entry2','entry3','lane1','lane2','lane3'],[1,2,3],{}),
 'two_feeders':(['entry1','entry3','lane1','lane3','B1_B2'],[1,3],{1:[2]}),
 'central_pool':(['entry2','lane2','B1_B2','B2_B3'],[2],{2:[1,3]})}

def simulate(durations,topology='dedicated',policy='rr',K=2,Q=3,keep=False):
    N=len(durations);s=family(N=N,K=K,Q=Q);C=s['cells'];J=s['counters'];E=s['arcs']
    chosen,roots,branches=TOPOLOGIES[topology]
    index={(a['u'],a['v']):e for e,a in enumerate(E)}
    queues={v:deque(range(N)) if v=='S' else deque() for v in C}
    busy={j:None for j in J};source_pointer=0;merge_pointer=0;branch_pointer=defaultdict(int)
    moves=[];starts=[];releases=[];duration_records=[]
    occ={v:[len(queues[v])] for v in C};bo={j:[0] for j in J};blocked=0
    for t in range(5000):
        ins=defaultdict(int);outs=defaultdict(int);mov=[];rel=[];sta=[]
        def can_move(u,v):return len(queues[u])>outs[u] and outs[u]<C[u]['Q'] and ins[v]<C[v]['Q'] and ins[v]<C[v]['K']-len(queues[v])
        def move(u,v):
            assert can_move(u,v);outs[u]+=1;ins[v]+=1;mov.append((u,v));moves.append([t,index[u,v],1])
        if can_move('M','X'):move('M','X')
        # Round robin is maintained between ticks and observes only readiness.
        for offset in range(3):
            j=(merge_pointer+offset)%3+1
            if can_move(f'E{j}','M'):
                move(f'E{j}','M');merge_pointer=j%3;break
        available={}
        for j,c in J.items():
            done=busy[j] is not None and t>=busy[j][1]
            if done and len(queues[c['output']])==0:
                rel.append(j);ins[c['output']]+=1;releases.append([t,j])
            elif done:blocked+=1
            available[int(j)]=busy[j] is None or j in rel
        # Leaf services first; upstream routing still uses start-of-tick space.
        for j in [1,2,3]:
            if j in branches:continue
            b=f'B{j}'
            if queues[b] and available[j]:sta.append(j);outs[b]+=1;starts.append([t,str(j)])
        for root,children in branches.items():
            b=f'B{root}'
            if not queues[b]:continue
            actions=[]
            if available[root]:actions.append((len(queues[f'E{root}']),root,'service'))
            for child in children:
                if can_move(b,f'B{child}'):
                    load=len(queues[f'B{child}'])+int(busy[str(child)] is not None)+len(queues[f'E{child}'])
                    actions.append((load,child,'route'))
            if actions:
                # Least local occupancy, cyclic tie break. No service lookahead.
                order=[root]+children;ptr=branch_pointer[root]
                load,j,kind=min(actions,key=lambda z:(z[0],(order.index(z[1])-ptr)%len(order)))
                branch_pointer[root]=(order.index(j)+1)%len(order)
                if kind=='service':sta.append(root);outs[b]+=1;starts.append([t,str(root)])
                else:move(b,f'B{j}')
        for root in roots:
            if can_move(f'A{root}',f'B{root}'):move(f'A{root}',f'B{root}')
        sent=[]
        for k in range(s['cells']['S']['Q']):
            candidates=[j for j in roots if j not in sent and can_move('S',f'A{j}')]
            if not candidates:break
            def key(j):
                cyclic=(roots.index(j)-source_pointer)%len(roots)
                load=len(queues[f'A{j}'])+len(queues[f'B{j}'])+int(busy[str(j)] is not None)+len(queues[f'E{j}'])
                return (load,cyclic) if policy=='jsq' else (cyclic,)
            j=min(candidates,key=key);move('S',f'A{j}');sent.append(j);source_pointer=(roots.index(j)+1)%len(roots)
        # Apply departures from the old state, then arrivals, preventing hops.
        deliveries=[]
        for u,v in mov:deliveries.append((v,queues[u].popleft()))
        for j in rel:
            deliveries.append((J[j]['output'],busy[j][0]));busy[j]=None
        for j in sta:
            job=queues[f'B{j}'].popleft();d=int(durations[job]);busy[str(j)]=(job,t+d)
            duration_records.append([t,str(j),d])
        for v,job in deliveries:queues[v].append(job)
        for v in C:occ[v].append(len(queues[v]))
        for j in J:bo[j].append(int(busy[j] is not None))
        if len(queues['X'])==N:break
    else:raise AssertionError('policy deadlocked')
    result={'spec':s,'H':t+1,'status':0,'gates':chosen,'cells':list(C),'counters':list(J),
      'cost':0,'area':0,'limits':{'gate_budget':None,'cost_budget':None,'area_budget':None,'active_limit':None},
      'moves':moves,'starts':starts,'releases':releases,'occupancies':occ,'busy':bo,
      'service_durations':duration_records,'policy':policy,'topology':topology}
    result['verification']=verify(result)
    return result if keep else (t+1,blocked)

def main():
    rng=np.random.default_rng(20261027);R=2000
    data=rng.choice([1,5],size=(R,12))
    configs=[('dedicated','rr',3),('two_feeders','rr',3),('central_pool','rr',3),
             ('dedicated','rr',1),('dedicated','jsq',1),('two_feeders','rr',1),('two_feeders','jsq',1)]
    out={'seed':20261027,'replications':R,'distribution':'independent job durations 1 or 5 with probability 1/2 each','N':12,'K':2,'common_random_numbers':True,'results':[]}
    for topology,policy,Q in configs:
        vals=np.array([simulate(ds,topology,policy,Q=Q) for ds in data])
        mean=float(vals[:,0].mean());se=float(vals[:,0].std(ddof=1)/math.sqrt(R))
        deterministic=simulate([3]*12,topology,policy,Q=Q,keep=True)
        row={'topology':topology,'policy':policy,'source_rate':Q,'mean':mean,'mean_ci95':[mean-1.96*se,mean+1.96*se],
          'p95':float(np.quantile(vals[:,0],.95,method='higher')),'min':int(vals[:,0].min()),'max':int(vals[:,0].max()),
          'mean_blocked_counter_ticks':float(vals[:,1].mean()),'deterministic_T':deterministic['H'],'samples':vals[:,0].tolist()}
        out['results'].append(row)
        print({k:v for k,v in row.items() if k!='samples'},flush=True)
    Path(__file__).with_name('policy_results.json').write_text(json.dumps(out,indent=2))
    Path(__file__).with_name('policy_trace.json').write_text(json.dumps(simulate(data[0],'two_feeders','jsq',keep=True),indent=2))

if __name__=='__main__':main()
