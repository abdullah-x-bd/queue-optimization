"""Replay every stored feasible result. Infeasibility remains solver-certified."""
import json,hashlib
from pathlib import Path
from synthesis import verify
from baseline import verify as baseline_verify
from portal_theorems import necessary_counters,time_bound

def main():
    counts={'generic_traces':0,'baseline_traces':0,'solver_infeasible_records':0}
    seen=set()
    def visit(x):
        if isinstance(x,dict):
            if 'H' in x and 'status' in x:
                if x['status']==0 and x.get('gap') is not None:assert abs(x['gap'])<1e-8
                if x['status']==2:counts['solver_infeasible_records']+=1
                elif 'moves' in x:
                    key=hashlib.sha256(json.dumps(x,sort_keys=True).encode()).hexdigest()
                    if key not in seen:
                        seen.add(key)
                        if 'spec' in x:verify(x);counts['generic_traces']+=1
                        elif 'instance' in x:baseline_verify(x);counts['baseline_traces']+=1
            for v in x.values():visit(v)
        elif isinstance(x,list):
            for v in x:visit(v)
    root=Path(__file__).parent
    for path in root.glob('*.json'):
        if path.name not in ('audit.json','manifest.json'):visit(json.loads(path.read_text()))
    counts['strict_constructive_checks']=json.loads((root/'portal_results.json').read_text())['construction_checks']
    counts['slack_constructive_checks']=json.loads((root/'slack_checks.json').read_text())['construction_checks']
    counts['turnover_constructive_checks']=json.loads((root/'turnover_checks.json').read_text())['construction_checks']
    counts['stochastic_policy_traces']=7*json.loads((root/'policy_results.json').read_text())['replications']
    exact=root/'policy_exact.json'
    if exact.exists():counts['exhaustive_policy_traces']=json.loads(exact.read_text())['policy_traces']
    (root/'audit.json').write_text(json.dumps(counts,indent=2));print(json.dumps(counts,indent=2))

if __name__=='__main__':main()
