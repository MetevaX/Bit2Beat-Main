# Bit2Beat

**Team:** Bit2Beat  
**Challenge:** NASA International Space Apps Challenge  

## Project Overview

**Bit2Beat** is a browser-based sonification application that transforms scientific images and tabular datasets (CSV) into pleasant, meaningful audio. By mapping data points and spatial image properties to musical scales, frequencies, and timbres, Bit2Beat enables both auditory analysis and musical appreciation of NASA scientific datasets.

### Tech Stack
- **Architecture:** Static website (client-side only, no backend, no build step)
- **Languages:** Vanilla JavaScript (ES Modules), HTML5, CSS3
- **Audio & Visuals:** Web Audio API, [Tone.js](https://tonejs.github.io/) (via CDN), HTML5 Canvas

### Core Sonification Algorithms
- **Parameter Mapping Sonification (PMS):** Maps numerical data dimensions (e.g. CSV values) to musical parameters like pitch, scale degrees, and note duration.
- **Spatial Scanning:** Scans 2D images horizontally (left-to-right), mapping vertical pixel position and RGB color channels to pitch, amplitude, and spatial stereo panning.
- **Earcons & Auditory Icons:** Short, distinct melodic/harmonic cues designed for event triggers, anomalies, and threshold alerts.

---

## Folder Structure

```text
Bit2Beat-Main/
├── index.html              # Main application entry point (loads Tone.js and src/main.js)
├── README.md               # Project documentation and guidelines
├── .gitignore              # Ignored files, dependencies, logs, and large media
├── src/
│   ├── main.js             # Application bootstrap & event orchestration
│   ├── pms.js              # Parameter Mapping Sonification (PMS) module
│   ├── spatial-scan.js     # 2D Image Spatial Scanning sonification module
│   ├── earcons.js          # Earcons and auditory icons module
│   └── ui/
│       ├── styles.css      # Core styles and responsive layout
│       └── ui.js           # UI controllers, file inputs, and DOM event listeners
├── assets/
│   ├── images/             # Sample images for spatial scanning
│   ├── sounds/             # Audio samples and earcon assets
│   └── data/               # Sample scientific CSV datasets
└── docs/
    └── README.md           # Documentation guidelines (large media hosted on Google Drive)
```

> **Note:** Each algorithm is modularized in its own file in `src/` so team members can work simultaneously without merge conflicts.

---

## How to Run Locally

Because Bit2Beat uses native ES Modules (`type="module"`), files must be served over an HTTP/HTTPS server (browsers restrict ES module loading via direct `file://` protocol).

### Option 1: Python HTTP Server (Built-in)
```bash
# Python 3
python3 -m http.server 8000
```
Then open your browser at: [http://localhost:8000](http://localhost:8000)

### Option 2: Node.js (npx serve)
```bash
npx serve .
```

### Option 3: VS Code Live Server
Right-click `index.html` and select **"Open with Live Server"**.

---

## Branching & Collaboration Workflow

To maintain code stability and prevent merge conflicts, all development follows feature-based branching:

- `main`: Production-ready, stable codebase.
- `feature/ui`: User interface, layouts, visualizer canvas, and styling.
- `feature/pms`: Parameter Mapping Sonification (CSV to musical notes).
- `feature/spatial-scan`: Spatial 2D image scan algorithm.
- `feature/earcons`: Auditory alert triggers and earcon sounds.
- `docs`: Documentation, slides reference, and project report materials.

### Working with Branches
1. Pull the latest `main`:
   ```bash
   git checkout main
   git pull origin main
   ```
2. Switch to your assigned feature branch:
   ```bash
   git checkout feature/<your-feature>
   ```
3. Commit your changes and push to your upstream branch:
   ```bash
   git push -u origin feature/<your-feature>
   ```
