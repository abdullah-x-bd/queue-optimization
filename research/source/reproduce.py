"""Recompute the extension, or independently replay the stored traces."""
import argparse,json,os,subprocess,sys
from pathlib import Path

ROOT=Path(__file__).resolve().parent
def run(name,*args):subprocess.run([sys.executable,str(ROOT/name),*args],check=True,cwd=ROOT)
def main():
    pa=argparse.ArgumentParser();pa.add_argument('--verify-only',action='store_true');pa.add_argument('--pdf',action='store_true');args=pa.parse_args()
    os.chdir(ROOT)
    if not args.verify_only:
        run('portal_theorems.py')
        from portal_theorems import Instance,single_feed_slack_witness,time_bound,solve,verify
        count=0
        for m in range(2,11):
            for p in range(2*m-1,2*m+5):
                for q in range(1,9):
                    N=q*m+1;single_feed_slack_witness(Instance(N=N,p=p,rows=m,source_storage=N,source_rate=1));count+=1
        example=single_feed_slack_witness(Instance(N=13,p=7,rows=4,source_storage=13,source_rate=1))
        (ROOT/'slack_checks.json').write_text(json.dumps({'construction_checks':count,'example':example},indent=2))
        prefix=[]
        for m,p,N,Q in [(3,5,12,1),(4,8,12,1),(4,8,12,2),(4,5,6,1)]:
            a=Instance(N=N,p=p,rows=m,source_storage=N,source_rate=Q)
            z=solve(a,time_bound(a),limit=180);assert z['status']==0;z['verification']=verify(z);prefix.append(z)
        (ROOT/'prefix_checks.json').write_text(json.dumps(prefix,indent=2))
        run('experiments.py');run('budget_complete.py');run('grid_example.py')
        from grid_example import grid_spec
        from synthesis import quickest,solve as generic_solve,automatic,family
        s=grid_spec(N=8,ps=(2,4,3));(ROOT/'grid_spec.json').write_text(json.dumps(s,indent=2))
        z=quickest(s,10,40,limit=180);(ROOT/'grid_branch_quickest.json').write_text(json.dumps(z,indent=2))
        c=generic_solve(s,z['T'],objective='cost',limit=180);assert c['status']==0
        (ROOT/'grid_branch_cost.json').write_text(json.dumps(c,indent=2))
        ag=automatic(s,limit=120);(ROOT/'automatic_grid.json').write_text(json.dumps(ag,indent=2))
        ai=automatic(family(N=1,ps=(1,),priced=True),cost_budget=100,limit=30)
        assert ai['status']=='infeasible';(ROOT/'automatic_infeasible.json').write_text(json.dumps(ai,indent=2))
        run('placement.py');run('turnover_construction.py');run('policies.py');run('policy_exact.py')
    run('verify_saved.py');run('report_tables.py');run('make_figures.py')
    if args.pdf:
        for _ in range(2):subprocess.run(['pdflatex','-interaction=nonstopmode','-halt-on-error','research_note.tex'],check=True,cwd=ROOT,stdout=subprocess.DEVNULL)

if __name__=='__main__':main()
