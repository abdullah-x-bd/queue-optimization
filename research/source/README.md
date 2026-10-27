# Finite-space queue topology synthesis: research extension

This package extends the original uniform-service row-family model. It includes
general minimum-portal constructions, a heterogeneous finite-graph optimizer,
construction/area budgets, counter-placement alternatives, movement sensitivity,
and exhaustive policy evaluation for a two-point duration distribution.

The mathematical scope and proofs are in `research_note.tex` and the accompanying
PDF. The claims distinguish proved structural results, solver-certified finite
optima, and policy-specific stochastic evaluations. No universal floorplan or
first-in-literature priority is claimed.

## Install and verify

Python 3.11+ is required. The calculations supplied here used Python 3.12.14,
NumPy 2.3.5, and SciPy 1.17.0's bundled HiGHS MILP interface. Install dependencies with:

```sh
python -m pip install -r requirements.txt
python reproduce.py --verify-only
```

This independently replays every stored feasible trace, rebuilds the audit and
report tables, and redraws the figures. Infeasibility is certified by the solver,
not by a separate rational proof checker. Independent replay validates feasible
integer schedules without using the optimization matrix.

To recompute every experiment:

```sh
python reproduce.py
```

This may take several minutes or longer depending on hardware. Individual
optimization calls have explicit time limits; a timeout must not be interpreted
as infeasibility or optimality. Alternative optimal masks can differ between
solver versions. The mathematical objective values and feasibility are the
reproducibility target. Add `--pdf` to either command to rebuild the PDF with
pdfLaTeX installed.

## Generic topology synthesis

```sh
python synthesis.py grid_spec.json --output synthesized.json
python synthesis.py placement_spec.json --output placed.json --area-budget 32
```

The automatic solver brackets a feasible deadline and binary-searches the first
feasible integer deadline. It then minimizes the number of installed portals
among time-optimal designs. Supply `--cost-budget` and/or `--area-budget` for
resource constraints. The JSON examples are complete templates.

Schema:

- `N`: positive integer population, initially all in cell `S`.
- `receiving`: `strict` or `turnover`.
- `cells`: mapping of cell IDs to `K` (storage), `Q` (per-tick sending and
  receiving rate), `phase` (0 before service, 1 after service), nonnegative
  `cost` and `area`, and optional `fixed: true`. `S` must hold N people. `X`
  accumulates exits and should also have storage N. Its receiving-rate limit is
  omitted; its finite upstream interfaces determine exit capacity.
- `gates`: mapping of physical interface IDs to combined `cap`, `cost`, `area`.
- `arcs`: directed movements with `u`, `v`, `gate`, and `cap`. Both directions
  of a shared physical portal use the same gate ID. `gate: null` represents a
  fixed connection of zero additional construction cost.
- `counters`: mapping of counter or placement IDs to `input`, `output`, positive
  integer service time `p`, `cost`, and `area`. Service is nonpreemptive. A
  counter remains occupied until it releases into its output cell.
- Optional `counter_groups`: each group lists alternative placements of one
  physical counter; at most one can be built.
- Optional `site_groups`: at most one counter placement in each site group.
- Optional `xy` and `label` are metadata for visualization and experiments.

Costs and areas can be real-valued nonnegative inputs; populations, capacities,
service durations, and time are integral. Longer corridors are subdivided into
cells. The caller supplies the finite spatial candidates; continuous geometry,
unmodeled crossings, and uncalibrated pedestrian behavior are not inferred.

## Event convention

Ordinary movement at t arrives at t+1. A service start at t removes a person
from the input cell immediately for the counter transition; release is first
allowed at t+p. The released person reaches the output cell at t+1. A release
and new start at the same counter may occur at the same t. Outgoing people must
be present at the beginning of the tick, so no fresh arrival can make two moves.

Strict receiving uses `incoming <= K - old_occupancy`; turnover receiving adds
the outgoing count to available receiving space. Output congestion can prevent
release, keep a counter occupied, and propagate upstream. Every exiting person
must pass exactly one counter because the ordinary graph is separated into
pre-service and post-service phases.

## Main scripts and results

| Script | Role |
|---|---|
| `baseline.py` | Preserved original row-family MILP and independent verifier |
| `portal_theorems.py` | General strict-receiving sparse constructions and checks |
| `synthesis.py` | Generic heterogeneous, cost/area, and placement optimizer |
| `experiments.py` | Heterogeneous, movement, fixed-topology, dynamic-gate cases |
| `budget_complete.py` | Complete minimum-cost-by-deadline staircase |
| `grid_example.py`, `placement.py` | Spatial layout and placement synthesis |
| `turnover_construction.py` | Constructive proof witnesses for alternate receiving |
| `policies.py` | Causal decentralized simulation; seeded supplemental experiment |
| `policy_exact.py` | All 4,096 duration assignments for each of seven policies |
| `verify_saved.py` | Independent replay of saved feasible traces |
| `report_tables.py`, `make_figures.py` | Generate report tables and figures |

The stochastic evaluations reveal service completion but never future or
remaining durations to the policy. Each job's fixed duration follows it across
policies. The exact expectations and quantiles are for the stated uniform
two-point distribution over all 2^12 job-duration vectors, not optimized
stochastic policies. The separate robust guarantee uses the all-five schedule
and intentionally holds early completions until reserved release times.

Prices and m² allocations are illustrative inputs, not quotations. The row-family
budget excludes the existing source, merge, and fixed departure links. The grid
example prices all selected ordinary interfaces and constructed ordinary cells.

## Evidence limitations

Structural theorems are proved in the note, with 12,992 construction checks.
MILP solutions are accepted only at optimal status and zero reported gap;
feasible traces are replayed exactly as integer events. Numerical MILP
infeasibility is not a formal independently replayable theorem certificate.
The solver is intended for exact small finite instances; it does not claim a
polynomial-time method for arbitrary design spaces.

`manifest.json` records hashes of the delivered files. Scientific literature is
cited in the report. This is a research working package, not a calibrated
pedestrian design standard or a validated network-hardware implementation.
