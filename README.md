# Queue Topology Lab

An open research foundation for an **interactive finite-space queue topology optimizer and simulator**.

The planned application accepts the number of people, number of service counters, individual counter durations, and optional physical constraints. It designs an admissible queue network and shows people moving from a source, through service, to an exit. The aim is to **minimize total clearance time and, among equally fast admissible designs, minimize optional physical infrastructure**.

**Current phase:** Original research and full reproducibility archive have been committed and verified. The UI / animation is specified but **not yet implemented or deployed**.

## Original research

- [Research PDF](docs/queue_topology_research_extensions.pdf): the 17-page working note dated 27 October 2026.
- [Complete reproducibility ZIP](research/reproducibility_source.zip): original source, figures, JSON results, witnesses, and SHA manifest.
- [Browse source code](research/source): 24 original source/TeX/config files extracted into the repository, including [synthesis.py](research/source/synthesis.py) and [research_note.tex](research/source/research_note.tex).
- [Model and claim status](research/CLAIM_STATUS.md): assumptions, proved results, numerical certificates, limitations, and SHA-256 hashes.
- [Simulator specification](docs/SIMULATOR_SPEC.md): input model, solve modes, animation design, result contracts, and acceptance tests.
- [Text-only working note](docs/research_note_text_extraction.txt): accessible extracted copy; use the PDF or TeX for mathematical typesetting.

## Mathematical model

The exact uniform row-family benchmark assumes `N` people, `m` counters with equal service time `p`, a source holding all people, two approach cells per row, one departure cell per counter, one common merge, and synchronous single-tick movement. Storage, sending rates, receiving rates, and output blocking are modelled explicitly. This is not a claim of universal optimal continuous geometry.

For the row family with strict receiving, source capacity `K0 >= N`, source rate `Q0 >= 1`, and `KM >= 1`:

```text
b = max(p, 2)
delta = 2 if KM == 1 else 1
T* = p + 5 + max(b, m*delta) * floor((N-1)/m)
             + delta*((N-1) mod m)
r* = min(N, m, ceil(b/delta))
```

The research further characterizes minimum optional connections for specific regimes and uses a finite-graph MILP to handle heterogeneous durations, candidate spaces, placement choices, and infrastructure budgets. Exactness refers to the **specified admissible design space**.

## Reproduction

For the complete provided reproducibility dataset, extract the ZIP and run the original scripts:

```sh
unzip research/reproducibility_source.zip
cd queue_network_extensions
python -m pip install -r requirements.txt
python reproduce.py --verify-only
```

To recompute the saved experiments instead of verifying their stored results, run `python reproduce.py` in the same directory. Python 3.11+ is required. Do not conflate verified event traces with independently checked numerical infeasibility certificates.

The 27 October 2026 local verification reported 195 replayed generic traces, 17 baseline traces, and 82 stored solver infeasibility records. Constructive and stochastic counts in verification-only mode are recovered from saved datasets.

## Simulator plan

The user chooses `N`, `m`, service times `p_j`, and optional `Q0`, merge storage, capacities, corridor candidates and budgets. The solver returns an optimized topology plus a replay-verified tick-by-tick schedule. The animated UI will highlight constructed corridors, moving people, occupied or blocked counters, live queues, and completed departures, with synchronized comparison against pooled and dedicated arrangements.

Results will explicitly distinguish **mathematically proved optimal**, **MILP-certified optimal**, **best feasible found**, and **unresolved**; visual animations will derive from validated traces rather than arbitrary motion paths.

See [SIMULATOR_SPEC.md](docs/SIMULATOR_SPEC.md) for the detailed implementation contract.
