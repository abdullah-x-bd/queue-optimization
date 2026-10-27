"""Topology synthesis on a small spatial candidate graph.

Both pre-service and post-service corridors are chosen by the optimizer;
there is no prescribed common merge or prescribed queue hierarchy.
"""
import json
from pathlib import Path
from synthesis import solve,quickest

def grid_spec(N=6,ps=(2,4,1)):
    cells={'S':{'K':N,'Q':2,'phase':0,'cost':0,'area':0,'fixed':True},
           'X':{'K':N,'Q':N,'phase':1,'cost':0,'area':0,'fixed':True}}
    xy={'S':[-1,1],'X':[6,1]};arcs=[];gates={};counters={}
    for phase,prefix,xbase in [(0,'P',0),(1,'R',3)]:
        for row in range(3):
            for col in range(2):
                v=f'{prefix}{row}{col}'
                cells[v]={'K':2,'Q':1,'phase':phase,'cost':100,'area':2}
                xy[v]=[xbase+col,row]
    def gate(u,v,both=True):
        g=f'{u}_{v}';gates[g]={'cap':1,'cost':25,'area':0}
        arcs.append({'u':u,'v':v,'gate':g,'cap':1})
        if both:arcs.append({'u':v,'v':u,'gate':g,'cap':1})
    for prefix in ['P','R']:
        for row in range(3):gate(f'{prefix}{row}0',f'{prefix}{row}1')
        for row in range(2):
            for col in range(2):gate(f'{prefix}{row}{col}',f'{prefix}{row+1}{col}')
    gate('S','P10',False);gate('R11','X',False)
    for row,p in enumerate(ps):
        counters[str(row+1)]={'input':f'P{row}1','output':f'R{row}0','p':p,'cost':400,'area':4}
    return {'N':N,'receiving':'strict','cells':cells,'arcs':arcs,'gates':gates,
            'counters':counters,'xy':xy,'label':'3 by 2 approach and departure grids'}

if __name__=='__main__':
    s=grid_spec();out=quickest(s,10,35,limit=180)
    Path(__file__).with_name('grid_quickest.json').write_text(json.dumps(out,indent=2))
    print('grid optimal',out['T'],out['optimal']['gates'],flush=True)
    costs=[]
    for H in [out['T'],out['T']+2,out['T']+5,32]:
        r=solve(s,H,objective='cost',limit=180);costs.append(r)
        Path(__file__).with_name('grid_costs.json').write_text(json.dumps(costs,indent=2))
        print('grid cost',H,r['status'],r.get('cost'),r.get('area'),r.get('gates'),flush=True)
