# Queue Topology Lab

**Finite-space queue topology synthesis and interactive optimization simulator (in development).**

This repository documents a deterministic finite-population queue network model and is intended to host a visual simulator that jointly chooses physical queue infrastructure and a feasible movement/service schedule.

## Research baseline (27 October 2026)

The supplied research working note is *Finite-space queue topology synthesis: Sparse optimal designs, heterogeneous service, infrastructure budgets, and sensitivity*. Its mathematical model is not an unconstrained universal floorplan optimizer.

Core assumptions in the row-family theorems:

- `N` people begin in a finite source holding all `N` jobs.
- `m` service counters, each with two approach cells, a one-person counter, and a one-person departure cell.
- Service times are positive integer ticks; original theorems use identical durations `p`.
- Ordinary movement takes one tick and respects bounded occupancy, sending, and receiving capacities.
- A counter can remain occupied if downstream storage blocks release.
- The source admission rate `Q0` and merge storage `KM` are explicit inputs.
- Results use **strict synchronous receiving** unless an alternative convention is specifically selected.

The baseline uniform-service clearance optimum for the eligible row family is

```text
b = max(p, 2)
delta = 2 if KM == 1 else 1
T* = p + 5 + max(b, m*delta) * floor((N-1)/m) + delta*((N-1) mod m)
active_counters* = min(N, m, ceil(b/delta))
```

Sparsity is a separate optimization: among layouts attaining minimum clearance time, minimize constructed optional approach portals. For a one-place merge, the report proves `L* = active_counters* + 1`; other regimes have exact results or explicit gaps. These results apply only to the stated model.

A generic finite-candidate-graph mixed-integer optimizer is supplied separately in the original reproducibility archive. It allows heterogeneous counter durations, selectable cells/corridors, budgets, and optional counter placements. Solver optimality applies to the **supplied finite candidate graph**. No claim is made that it solves arbitrary continuous floorplans or unrestricted real-world pedestrian movement.

## Repository organization

- `docs/`: research note in accessible text and technical simulator specification.
- `research/`: original mathematical assumptions, claim status, and reproducibility references.
- `simulator/`: planned interactive application built around an independently replay-verified optimization result.

## Planned simulator

Users will specify population, available counters, individual service durations, and optionally physical constraints. The app will synthesize an admissible layout, animate source-to-service-to-exit flows, and present clearance time, infrastructure use, and competing designs. An optimum must be labeled **proved/certified** only when an exact formula applies or the finite MILP solve has established optimality; otherwise show best found and any gap.

**Status:** Research repository initialized; the interactive simulator has not yet been deployed. See `docs/SIMULATOR_SPEC.md` for the project contract. 
