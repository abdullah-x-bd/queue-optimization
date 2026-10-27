"""Enumerate every duration vector under the stated two-point distribution."""
import itertools,json
from pathlib import Path
import numpy as np
from policies import simulate

def main():
    data=list(itertools.product([1,5],repeat=12))
    configs=[('dedicated','rr',3),('two_feeders','rr',3),('central_pool','rr',3),
             ('dedicated','rr',1),('dedicated','jsq',1),('two_feeders','rr',1),('two_feeders','jsq',1)]
    out={'method':'complete enumeration','distribution':'12 independent durations, each 1 or 5 with probability 1/2',
         'outcomes':4096,'policy_traces':4096*len(configs),'results':[]}
    for topology,policy,Q in configs:
        vals=np.array([simulate(ds,topology,policy,Q=Q) for ds in data]);a=vals[:,0]
        # Quantile is smallest integer q with P(T<=q)>=.95.
        p95=int(np.sort(a)[int(np.ceil(.95*len(a)))-1])
        r={'topology':topology,'policy':policy,'source_rate':Q,'mean':float(a.mean()),'p95':p95,
           'min':int(a.min()),'max':int(a.max()),'mean_blocked_counter_ticks':float(vals[:,1].mean()),
           'deterministic_T':simulate([3]*12,topology,policy)[0] if Q==3 else simulate([3]*12,topology,policy,Q=Q)[0],
           'max_duration_vector':list(data[int(np.argmax(a))]),'samples':a.tolist()}
        out['results'].append(r);Path(__file__).with_name('policy_exact.json').write_text(json.dumps(out,indent=2))
        print({k:v for k,v in r.items() if k!='samples'},flush=True)
    out['paired_Q1_two_feeders_RR_minus_JSQ']=float(np.mean(np.array(out['results'][5]['samples'])-np.array(out['results'][6]['samples'])))
    Path(__file__).with_name('policy_exact.json').write_text(json.dumps(out,indent=2))

if __name__=='__main__':main()
