# Queue Topology Lab

An interactive study of how people move through finite-space service networks. Configure the number of people, counters, and processing times; generate a feasible layout; and watch each movement from source to exit.

**[Launch the simulator](https://abdullah-x-bd.github.io/queue-optimization/)** · **[Research note](docs/queue_topology_research_extensions.pdf)** · **[Source and reproducibility](research/source/)**

## The simulator

The website combines network synthesis, deterministic finite-capacity simulation, and a synchronized animated replay. Its interface includes:

- Populations of 1 to 180 people and up to 12 available counters.
- Uniform service time or independent processing durations per counter.
- Adjustable source admission throughput, merge storage, and receiving convention.
- Automatic selection among dedicated access, shared feeders, and split feeder layouts.
- Movement-by-movement SVG animation, playback, stepping, speed control, and a scrubbable timeline.
- Comparisons of clearance time and constructed approach portals across alternative layouts.
- Shareable scenarios and exported, independently verified event traces.

The simulator runs directly in the browser. No framework build, user account, external optimization service, or application backend is required for the hosted experience.

## Optimization and guarantees

For **uniform service durations** in the research row family, the clearance optimum is established by a closed-form theorem, and the website uses a constructive feasible schedule attaining it. Selected sparse constructions also have proven minimum portal counts. The playback engine independently checks the movement, service, capacity, and blocking constraints before accepting each schedule.

For **heterogeneous durations**, the standalone browser edition searches a collection of row topologies and dispatch policies. The fastest result found is displayed as a *verified feasible schedule*, **not a proof of global optimality**. The original research package includes a separate Python mixed-integer optimizer for exact optimization over supplied finite candidate graphs. That solver is available in [research/source/synthesis.py](research/source/synthesis.py) and in the archived [reproducibility package](research/reproducibility_source.zip).

All results refer to the explicit discrete model and its chosen design space, not to unrestricted continuous architectural layouts or calibrated real-world pedestrian speeds.

## Running locally

Any static HTTP server can serve the four application files at the repository root:

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a modern browser. Browser modules are served over HTTP, so opening `index.html` directly as a `file://` document is not the supported launch method.

To run the built-in verification tests with Node.js 20 or later:

```bash
npm test
```

## Publishing

The repository contains a GitHub Actions workflow that tests the engine and deploys the static site to GitHub Pages. In the repository's **Settings → Pages** section, choose **GitHub Actions** as the build and deployment source. A push to `main` will run the workflow and publish `index.html`, `styles.css`, `app.js`, and `engine.js` without a separate hosting provider.

## Research

The 27 October 2026 research note, *Finite-space queue topology synthesis: Sparse optimal designs, heterogeneous service, infrastructure budgets, and sensitivity*, develops the finite-cell movement model, exact row-family clearance theorem, sparse portal constructions, and generic finite-graph MILP formulation. Original proofs, data, and reproducibility scripts are preserved in this repository.

- [Research PDF](docs/queue_topology_research_extensions.pdf)
- [Original LaTeX manuscript](research/source/research_note.tex)
- [Python finite-graph solver](research/source/synthesis.py)
- [Validation and mathematical scope](docs/MODEL.md)
- [Complete original reproducibility archive](research/reproducibility_source.zip)

**Terminology:** A *tick* is one discrete time unit. A *portal* is an optional constructed approach connection; mandatory service and departure links do not contribute to the portal count. *Proven optimal* refers to clearance time under the published mathematical assumptions, while *verified feasible* refers to event-by-event validation without a corresponding global optimality certificate.
