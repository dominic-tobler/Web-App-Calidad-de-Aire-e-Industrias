## Getting Started

### Prerequisites

Ensure you have [Node.js](https://nodejs.org/) installed on your machine.

### Local Setup

1. **Clone or update the repository:**
   ```bash
   git pull
   ```

2. **Navigate into the project directory:**
   ```bash
   cd Web-App-Calidad-de-Aire-e-Industrias
   ```

3. **Install dependencies:**
   ```bash
   npm install
   ```
   *Note: This installs all required packages and may take a few moments.*

### Running the Application

Start the local development server:

```bash
npm run dev
```

- The application will be available at **`http://localhost:5173`**.
- **Hot Reloading** is enabled: any changes saved in the source files will instantly reflect in the browser.

Use ctrl + c to stop the local development server, or simply close the terminal

### Running the Expert View

The expert-user dashboard runs as a separate app on its own port, so it does not mix with the common-user view:

```bash
npm run dev:expert
```

- The expert view will be available at **`http://localhost:5174`**.
- Both views can run at the same time (one terminal each): `npm run dev` → 5173 (common user) and `npm run dev:expert` → 5174 (expert).
- Build / preview: `npm run build:expert` writes to `dist-expert/`, and `npm run preview:expert` serves it at `http://localhost:4174`.

| File | Purpose |
| :--- | :--- |
| `expert.html` | HTML entry of the expert view |
| `vite.expert.config.ts` | Vite config for the expert view (port 5174, serves `expert.html` at `/`) |
| `src/expert/` | Expert dashboard: map with box selection, moving-average series, correlation matrix and industry histograms |
| `src/map/industryMarkers.ts` | Industry star convention shared by both maps (red = sanctioned, dark = follow-up / in process) |

Data used by the expert view (all in `Data/`):

- `datos_24_25.csv`: hourly station measurements (2024-01-01 to 2025-05-27) for PM2.5, PM10, O3, NO2, SO2, CO, Temp, WDS, WDD and RAIN. Values ≥ 9000 are treated as missing. The file is fetched at runtime, so the first load takes a moment.
- `industries.json`: now includes `ClassCode` (R1–R3), a short code for the sanction reason in `Class`. It is created in `Preprocessing/industry_cleaning.ipynb` (section *Sanction reason codes*).
- `air_quality_stations.csv` and `municipios-cundinamarca.json`: station locations and municipality boundaries.

---

## Tech Stack

| Technology | Role & Purpose |
| :--- | :--- |
| **TypeScript** | Primary programming language that our stack relies on, JavaScript code is compatible with Typescript code |
| **React** | Core web framework handling UI components, page routing, and state management. |
| **Vite** | Fast build tool and development server for React applications. |
| **D3.js** | Data visualization library used for data transformations, scales, and direct SVG/Canvas rendering. |
| **Leaflet** | Interactive map for Cundinamarca: tiled basemap, municipality boundaries, and industry markers. |

---

## D3 Integration Strategy

There are two primary approaches for combining D3 with React:

1. **Imperative Approach (D3 Controls the DOM via `useRef`):** React renders the base SVG/Canvas container, while D3 directly manipulates the DOM elements, handles data joins (`enter`/`update`/`exit`), and manages transitions.
2. **Declarative Approach (D3 as a Utility, React Renders JSX):** D3 computes scales and math paths, while React handles all DOM node creation via JSX.

### Architectural Decision

Due to our **heavy datasets** and requirements for **real-time user interactions**, this project adopts the **Imperative approach (`useRef`)**. Bypassing React's Virtual DOM reconciliation during visualization updates delivers significantly higher frame rates, lower memory consumption, and smoother interactive performance.