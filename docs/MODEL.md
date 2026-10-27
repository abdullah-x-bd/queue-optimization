# Mathematical model and interpretation

## The physical network

The simulator models a finite population initially present in a source cell. Each counter has two pre-service approach cells A and B, one one-person service location C, and one one-person post-service cell E. The departure cells converge into a common merge M and then an absorbing exit X1.

A person moves at most one ordinary graph edge per tick. Each ordinary approach cell holds at most two people and has unit sending/receiving capacity. Each departure cell stores one person, and counters cannot accept a second service unless the previous person is released. If downstream space is unavailable, a completed person may remain at the counter and block the next start. A source admission rate and merge storage are explicit inputs. The source capacity is N, and the absorbing exit has capacity N.

In **strict receiving**, a cell must have unoccupied space *at the beginning of a tick* to admit a person. An outbound departure in the same tick does not create receivable space. In **turnover receiving**, space vacated during the tick may receive another person, without permitting any person to make more than one ordinary movement in that tick. A counter can release and start a new person at the same tick under either receiving rule, provided its processing and downstream requirements are met.

The installed portals counted on screen are X0 → A_j, A_j → B_j, and the optional adjacent B-column connections used by the selected layouts. The original row family additionally permits lateral A-column connections, while the browser search currently concentrates on dedicated, single-feeder, and split-feeder B-column layouts. Fixed B → C → E → M → X1 interfaces are not counted as optional portals.

## Exact uniform-service clearance

For N people, m counters with common service duration p, and merge storage K_M:

```text
Strict receiving:
  δ = 2 when K_M = 1, otherwise δ = 1
  b = max(p, 2)
  P = max(b, mδ)
  T* = p + 5 + P floor((N - 1)/m) + δ((N - 1) mod m)
  r* = min(N, m, ceil(b/δ))

Turnover receiving:
  δ = 1
  b = p
  P = max(p, m)
  T* = p + 5 + P floor((N - 1)/m) + ((N - 1) mod m)
```

The formulas apply to the original row-family assumptions with positive integer N,m,p, source capacity at least N, source admission rate at least one, and the stated cell capacities and movement constraints. The engine constructs and independently replays a schedule that reaches the lower bound. All values use integer ticks.

Under strict receiving with merge capacity one, the minimum portal count among time-optimal designs is r* + 1. In other regimes, the research proves exact counts in selected cases and tight constructions or bounds elsewhere. The browser should not interpret a portal count as globally minimal unless the corresponding theorem's hypotheses are satisfied.

## Heterogeneous service

Each counter j has an independent processing duration p_j. The browser searches several families of fixed row topologies and service-admission policies, retaining feasible schedules with the earliest observed clearance. Every scheduled event is checked against the same state and capacity constraints used for the uniform constructor.

A replay-verified heterogeneous result establishes:

1. All N people began at the source and eventually reached the exit.
2. Every person completed one uninterrupted service operation.
3. Every movement was allowed by the displayed constructed network.
4. Node, corridor, sending, receiving and blocking limits held throughout.
5. The recorded completion time was achieved by the recorded schedule.

It does **not** establish that no alternative layout or service schedule could clear sooner. Global finite-candidate optimization for heterogeneous service is provided separately in `research/source/synthesis.py`. That exact solver uses a time-indexed mixed-integer formulation and requires a Python scientific-computing environment.

## Scope

The model deliberately separates mathematically specified limits from real-world facility design. Ticks are uncalibrated discrete units. People have no individual walking-speed variation, social preferences, route-choice uncertainty, or continuous collision geometry in this edition. The visual positions are diagram coordinates, not measured floor-plan lengths. Infrastructure cost and area optimization in the source research apply to user-supplied finite candidate graphs rather than unrestricted architectural space.

## Reproducing the research

The original archive retains the complete scientific result package. Unpack `research/reproducibility_source.zip`, install its requirements, and run `python reproduce.py --verify-only`. The independent verifier checks stored feasible traces; numerical MILP infeasibility results do not carry independently verified rational proof certificates. Consult the original PDF and LaTeX sources for the complete theorem statements and experimental protocols.

## Continuous-lane rendering

The animation depicts a row’s finite approach cells as a single continuous queue pipeline. A root lane shows **six positions**: two visual staging positions immediately upstream of admission, followed by the two-place `A` buffer and two-place `B` buffer. These first two positions are assigned to the next scheduled source admissions. People staged there are **still counted at the source** and do not gain extra occupancy or admission rights; the underlying approach storage remains four. A branch reached through an adjacent lateral `B` portal shows its two finite `B` positions. Tokens correspond to replayed person IDs and recorded admission order, with interpolation solely for presentation. Junctions between the lanes visualize the installed lateral `B` portals. The source, counter service, one-place departure buffer, common merge, and exit retain their original mechanics.

The pipeline drawing is a visualization of the discrete finite-cell model, not a continuous-space queue simulation or a physical area-scale layout. It does not alter time-optimality, capacity, or receiving-rule claims.

## Counter-count stability

Uniform-service scenarios also evaluate centrally rooted shared and split-feeder layouts using fewer counters than the number available. The browser ranks validated results first by clearance time, then by installed optional approach portals, then by counters actually used. This avoids discarding a shorter subnetwork merely because additional counters are available. Its structural optimum for clearance remains independent of the candidate enumeration, while minimal portal count is only asserted in the regimes proven by the research note.

For example, with 180 people, four-tick uniform service, turnover receiving, merge storage two, and source admission rate two, the proven clearance minimum is 188 ticks. Four counters suffice. The selected six-portal split-feeder design remains available when five or six counters are offered, with additional counters shown unused.
