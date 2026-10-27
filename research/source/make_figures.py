import json
from pathlib import Path
from collections import Counter
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import FancyArrowPatch,FancyBboxPatch

ROOT=Path(__file__).parent;OUT=ROOT/'figures';OUT.mkdir(exist_ok=True)
plt.rcParams.update({'font.family':'DejaVu Sans','font.size':10,'axes.spines.top':False,'axes.spines.right':False,'savefig.dpi':180})
blue='#126782';orange='#c66b23';green='#3a7d60';gray='#c6ccd0'

def grid():
    r=json.loads((ROOT/'grid_branch_cost.json').read_text());s=r['spec'];xy=s['xy'];chosen=set(r['gates']);built=set(r['cells'])
    fig,ax=plt.subplots(figsize=(10.5,4.1))
    edges=set()
    for e in s['arcs']:
        edge=tuple(sorted([e['u'],e['v']]))
        if edge in edges:continue
        edges.add(edge);u,v=e['u'],e['v'];enabled=e['gate'] in chosen
        x1,y1=xy[u];x2,y2=xy[v]
        ax.plot([x1,x2],[-y1,-y2],color=blue if enabled else gray,lw=3 if enabled else 1,zorder=1,ls='-' if enabled else ':')
    for v,(x,y) in xy.items():
        active=v in built;face='white' if v in ('S','X') else '#dcecf0' if s['cells'][v]['phase']==0 else '#e0eee6'
        rect=FancyBboxPatch((x-.28,-y-.23),.56,.46,boxstyle='round,pad=0.03',fc=face if active else '#f3f3f3',ec=blue if active else gray,lw=1.5,zorder=3)
        ax.add_patch(rect);ax.text(x,-y,v,ha='center',va='center',fontsize=9,color='#152b34' if active else '#9ca6ab',zorder=4)
    counts=Counter(j for t,j in r['starts'])
    for j,c in s['counters'].items():
        x1,y1=xy[c['input']];x2,y2=xy[c['output']];yy=-y1
        ax.plot([x1,x2],[yy,yy],color=orange,lw=3,zorder=2)
        ax.add_patch(FancyBboxPatch((1.67,yy-.28),.66,.56,boxstyle='round,pad=0.02',fc='#fff0db',ec=orange,lw=1.5,zorder=4))
        ax.text(2,yy,f'C{j}\np={c["p"]}',ha='center',va='center',fontsize=9,zorder=5)
        ax.text(2,yy-.43,f'{counts[j]} jobs',ha='center',va='top',fontsize=9,color=orange)
    ax.text(.5,.65,'Approach cells',ha='center',weight='bold',color=blue)
    ax.text(2,.65,'Counters',ha='center',weight='bold',color=orange)
    ax.text(3.5,.65,'Departure cells',ha='center',weight='bold',color=green)
    ax.set_xlim(-1.5,6.6);ax.set_ylim(-2.8,1);ax.axis('off')
    fig.suptitle('Discovered spatial layout: 8 jobs, service times (2, 4, 3)',fontweight='bold',y=.99)
    fig.text(.5,.015,'Selected corridors in blue; unused candidates dotted. Clearance 17 ticks; cost 2,200; additional area 28 m².',ha='center',fontsize=9)
    fig.tight_layout(rect=[0,.04,1,.97]);fig.savefig(OUT/'discovered_grid.png');plt.close(fig)

def budget():
    fig,ax=plt.subplots(figsize=(7.4,3.6));xs=[1030,1180,1480,2420,3450,3900];ys=[65,41,28,20,18,18]
    ax.step(xs,ys,where='post',color=blue,lw=2.5);ax.scatter(xs[:-1],ys[:-1],color=blue,s=30,zorder=3)
    for x,y in zip(xs[:-1],ys[:-1]):ax.annotate(f'({x:,}, {y})',(x,y),xytext=(7,7),textcoords='offset points',fontsize=9)
    ax.set(xlabel='Available construction budget (illustrative cost units)',ylabel='Optimal clearance time (ticks)',xlim=(850,4100),ylim=(10,73))
    ax.grid(alpha=.15);fig.tight_layout();fig.savefig(OUT/'budget_frontier.png');plt.close(fig)

def sensitivity():
    labels=['Strict: K=1, Q=1','Turnover: K=1, Q=1','Strict: K=2, Q=1','Strict: K=2, Q=2','Strict: K=3, Q=2']
    vals=[30,19,19,19,18]
    fig,ax=plt.subplots(figsize=(7.4,3.5));pos=np.arange(len(vals));ax.barh(pos,vals,color=[orange,blue,blue,blue,green],height=.62)
    ax.set_yticks(pos,labels);ax.invert_yaxis();ax.set(xlim=(0,34),xlabel='Optimal clearance time (ticks)')
    for i,v in enumerate(vals):ax.text(v+.4,i,str(v),va='center',fontsize=10)
    ax.set_title('N=12, three counters, p=3; Q is the corridor/merge rate')
    fig.tight_layout();fig.savefig(OUT/'receiving_sensitivity.png');plt.close(fig)

def stochastic():
    r=json.loads((ROOT/'policy_exact.json').read_text());fig,ax=plt.subplots(figsize=(7.4,3.5))
    for i,color,label in [(0,blue,'Dedicated'),(1,orange,'Two feeders'),(2,green,'Central pool')]:
        v=np.sort(r['results'][i]['samples']);ax.step(v,np.arange(1,len(v)+1)/len(v),where='post',color=color,label=label,lw=2)
    ax.axvline(27,color='#666666',ls=':',lw=1,label='Robust scheduled guarantee')
    ax.set(xlabel='Realized clearance time (ticks)',ylabel='Exact cumulative probability',ylim=(0,1.03),xlim=(15,36))
    ax.legend(frameon=False,fontsize=9,loc='lower right');ax.grid(alpha=.15);fig.tight_layout();fig.savefig(OUT/'policy_cdf.png');plt.close(fig)

if __name__=='__main__':grid();budget();sensitivity();stochastic()
