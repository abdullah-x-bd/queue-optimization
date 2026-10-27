"""Joint discrete counter placement and corridor design, checked against all 6 permutations."""
from itertools import permutations
import json
from pathlib import Path
from grid_example import grid_spec
from synthesis import quickest,solve

def movable_spec():
    s=grid_spec(N=8,ps=(2,4,3));s['counters']={};s['counter_groups']=[];s['site_groups']=[]
    for worker,p in enumerate((2,4,3),1):
        group=[]
        for row in range(3):
            key=f'w{worker}_site{row}';group.append(key)
            s['counters'][key]={'input':f'P{row}1','output':f'R{row}0','p':p,'cost':400,'area':4}
        s['counter_groups'].append(group)
    for row in range(3):s['site_groups'].append([f'w{worker}_site{row}' for worker in range(1,4)])
    s['label']='joint discrete placement and topology'
    return s

if __name__=='__main__':
    root=Path(__file__).parent;s=movable_spec();r=quickest(s,8,30,limit=180)
    root.joinpath('placement.json').write_text(json.dumps(r,indent=2))
    root.joinpath('placement_spec.json').write_text(json.dumps(s,indent=2))
    print('joint placement',r['T'],r['optimal']['counters'],flush=True)
    perm=[]
    for ps in permutations((2,4,3)):
        x=quickest(grid_spec(N=8,ps=ps),8,30,limit=180);perm.append(x)
        root.joinpath('placement_permutations.json').write_text(json.dumps(perm,indent=2))
        print('permutation',ps,x['T'],flush=True)
    assert min(x['T'] for x in perm)==r['T']
