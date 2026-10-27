"""Complete staircase via recursive equality pruning of monotone costs."""
import json
from pathlib import Path
from synthesis import family,solve

def main():
    s=family(ps=(1,3,5),priced=True)
    for j,cost in [('1',900),('2',600),('3',450)]:s['counters'][j]['cost']=cost
    old=json.loads(Path(__file__).with_name('budget_frontier.json').read_text())
    cache={r['H']:r for r in old}
    def get(H):
        if H not in cache:
            cache[H]=solve(s,H,objective='cost',limit=180)
            assert cache[H]['status']==0,(H,cache[H]['message'])
            print('cost',H,cache[H]['cost'],flush=True)
        return cache[H]['cost']
    intervals=[]
    def recurse(a,b):
        ca,cb=get(a),get(b)
        assert ca>=cb
        if ca==cb:intervals.append([a,b,ca]);return
        if b==a+1:intervals.extend([[a,a,ca],[b,b,cb]]);return
        mid=(a+b)//2;recurse(a,mid);recurse(mid+1,b)
    recurse(18,65)
    points={H:c for a,b,c in intervals for H in range(a,b+1)}
    steps=[]
    for H,c in sorted(points.items()):
        if not steps or steps[-1]['cost']!=c:steps.append({'first_deadline':H,'last_deadline':H,'cost':c})
        else:steps[-1]['last_deadline']=H
    # Separate physical-area constraint at a fixed deadline.
    area=[]
    for A in [24,25]:
        r=solve(s,18,objective='cost',area_budget=A,limit=180);area.append(r)
        print('area limit',A,'status',r['status'],'cost',r.get('cost'),flush=True)
    out={'steps':steps,'checks':list(cache.values()),'area_checks':area,
         'domain':[18,65],'minimum_possible_cost':1030,
         'method':'Monotone minimum-cost function: equal costs at interval endpoints prove constancy inside.'}
    Path(__file__).with_name('budget_complete.json').write_text(json.dumps(out,indent=2))
    print(steps,flush=True)

if __name__=='__main__':main()
