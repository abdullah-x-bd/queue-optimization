# Queue Topology Lab: simulator specification
Version: initial design contract, 27 October 2026

## Purpose
Given a finite population and a finite set of service counters, synthesize an admissible physical queue topology and schedule that clears every job through exactly one counter into an exit, subject to movement, storage, service, and optional construction constraints. Display the route and movement over time.

## Primary inputs
- Population N, initially at the source.
- Available counters m.
- Service duration of counter j, p_j, in model ticks.
- Optional source admission rate Q0, source capacity K0, merge capacity KM.
- Model receiving convention: strict (research default) or turnover.
- Layout family: established row family (default), or user-provided finite candidate spatial graph.
- Optional cell capacities, corridor rates, permitted portals, build/area budgets, and counter placement alternatives.

For the row family, assume two approach cells per row, a one-person counter and a one-person departure cell. All move events take one tick unless input graph explicitly represents extra corridor cells. The default should not imply that population, counter counts, and service durations alone identify a unique real-world geometric optimum.

## Solve modes
1. Uniform row family: use the proven closed-form clearance bound and exact constructive witnesses where applicable. First minimize clearance time, then minimize optional approach portals among layouts that attain it. Distinguish exact minimum-portal regimes from upper/lower bounds.
2. Heterogeneous row family: use the supplied MILP engine with a generated family(N,ps,K,Q,...), and independently replay output.
3. Generic finite candidate graph: use synthesis.py's optimizer; first find the earliest feasible deadline, then minimize installed portals, infrastructure cost, or area subject to that deadline. Clearly show if the requested design space or budgets make the model infeasible, or the solver has timed out.
4. Comparison modes: dedicated direct queues, shared feeder topology, synthesized optimum, and (where applicable) reference baseline, all evaluated under identical physical assumptions.

## Engine and proposed interface
- Research reference implementation: Python scripts and JSON traces in research/reproducibility_source.zip (extracted files can also be imported into the repository).
- Backend: thin Python API around the unmodified/reviewed synthesis model, validating inputs and setting resource limits.
- Frontend: React/TypeScript with SVG/canvas topology renderer and timeline controls.
- Browser-hosted frontend may use GitHub Pages. Python MILP solving requires a separately deployed service unless later ported to browser-compatible solvers.

## Result API (proposed)
```json
{
  "input": {"N": 12, "service_times": [3,3,3], "source_rate": 3, "merge_storage": 2, "receiving": "strict"},
  "model_family": "row",
  "status": "proven_optimal",
  "clearance_ticks": 19,
  "solver_gap": 0,
  "layout": {"cells": [], "gates": [], "counters": [], "arcs": []},
  "trace": {"moves": [], "starts": [], "releases": [], "occupancies": {}},
  "metrics": {"portals": null, "built_counters": null, "area": null, "cost": null}
}
```
The example clearance time is a mathematical benchmark under the row assumptions; nulls mean values must be computed from an actual returned layout rather than invented.

## Animation behavior
- Graph renders source at left, approach cells/corridors, counters, post-service cells, merge, exit at right.
- Selected portals are emphasized; discarded candidate connections appear faintly or are hidden.
- Each person is a visually distinct token; tokens move one edge at a time according to a validated event trace.
- Counters show processing duration, progress, occupied/blocked state.
- Provide play/pause, single-tick step, speed, scrubber, tick labels and a reset control.
- Show live source remaining, in service, waiting, departed, bottlenecks, and completed fraction.
- Provide side-by-side synchronized replay and clearance comparison across baseline/synthesized designs.

## Scientific integrity
- Every simulated person must complete exactly one service and reach the absorbing exit.
- Strict receiving prohibits receiving into space that was occupied at the beginning of that tick; turnover receiving is a separately labeled option.
- A feasible integer event trace can be independently replayed with verify().
- Mathematical closed-form optimum, solver-certified optimum, feasible-but-unproven best, lower-bound-only, and unresolved timeout are different result statuses.
- The geometry is optimal within the stated admissible layout family or candidate graph, not among unrestricted continuous floorplans.
- Report tick units rather than claiming calibrated wall-clock seconds without additional inputs.

## Acceptance tests
- Uniform row-family benchmark N=12, m=3, p=3, KM=2, Q0>=1: clearance 19 ticks.
- Same input with KM=1 and strict receiving: clearance 30 ticks.
- With turnover receiving, N=12, m=3, p=3, KM=1: clearance 19 ticks.
- Heterogeneous examples and stored integer traces reproduce their reported optima and pass independent replay.
- Blocking, receiving limits, and budget constraints are represented exactly as in the research model.
