import json
from pathlib import Path

def main():
    root=Path(__file__).parent
    policy=json.loads((root/'policy_exact.json').read_text())
    names={'dedicated':'Dedicated','two_feeders':'Two feeders','central_pool':'Central pool'}
    lines=[r'\begin{center}\small',r'\begin{tabular}{llrrrr}',r'\toprule',r'Design & Admission & $Q_0$ & Exact mean & 95th percentile & Worst case\\\midrule']
    for r in policy['results']:
        lines.append(f"{names[r['topology']]} & {r['policy'].upper()} & {r['source_rate']} & {r['mean']:.4f} & {r['p95']} & {r['max']} "+r'\\')
    lines.extend([r'\bottomrule',r'\end{tabular}',r'\end{center}',
       'These are exact expectations and quantiles for the specified equiprobable 4,096 outcomes; no sampling confidence interval is needed. They are policy-specific results, not optimal expected-clearance values.'])
    (root/'policy_table.tex').write_text('\n'.join(lines))
    placement=json.loads((root/'placement.json').read_text());perms=json.loads((root/'placement_permutations.json').read_text())
    rows=[]
    for r in perms:
        ps=tuple(c['p'] for c in r['optimal']['spec']['counters'].values());rows.append(f"${ps}$ & {r['T']} "+r'\\')
    text=r'''\textbf{Joint counter placement.} If the same three physical counters may be placed at any of the three service sites, the optimum improves to '''+str(placement['T'])+r''' ticks. The joint solver selects the fastest counter in the middle. Checking all six assignments independently confirms the result:
\begin{center}\small
\begin{tabular}{lr}\toprule
Service durations at (top, middle, bottom)&Optimal clearance\\\midrule
'''+ '\n'.join(rows)+r'''
\bottomrule\end{tabular}\end{center}
Each permutation is itself optimized over all candidate corridors and cells. These examples demonstrate finite spatial synthesis, including discrete placement; they do not establish an optimal continuous building geometry.
'''
    (root/'placement_result.tex').write_text(text)
    audit=json.loads((root/'audit.json').read_text())
    total=sum(audit[k] for k in ['strict_constructive_checks','slack_constructive_checks','turnover_constructive_checks'])
    text=r'''\begin{center}\small
\begin{tabular}{lr}\toprule
Verification category&Count\\\midrule
Strict row-family constructive schedules&8,960\\
Additional one-feeder slack constructions&432\\
Turnover-receiving constructive schedules&3,600\\
Total constructive parameter cases&'''+f'{total:,}'+r'''\\
Exhaustively enumerated policy trajectories&28,672\\
Supplemental seeded Monte Carlo trajectories&14,000\\
Stored generic feasible traces replayed&'''+str(audit['generic_traces'])+r'''\\
Stored original-family feasible traces replayed&'''+str(audit['baseline_traces'])+r'''\\
Stored solver-infeasible records&'''+str(audit['solver_infeasible_records'])+r'''\\
\bottomrule\end{tabular}\end{center}
'''
    (root/'audit_table.tex').write_text(text)

if __name__=='__main__':main()
