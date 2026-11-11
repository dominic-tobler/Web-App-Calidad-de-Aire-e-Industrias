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

---

## Tech Stack

| Technology | Role & Purpose |
| :--- | :--- |
| **TypeScript** | Primary programming language that our stack relies on, JavaScript code is compatible with Typescript code |
| **React** | Core web framework handling UI components, page routing, and state management. |
| **Vite** | Fast build tool and development server for React applications. |
| **D3.js** | Data visualization library used for data transformations, scales, and direct SVG/Canvas rendering. |

---

## D3 Integration Strategy

There are two primary approaches for combining D3 with React:

1. **Imperative Approach (D3 Controls the DOM via `useRef`):** React renders the base SVG/Canvas container, while D3 directly manipulates the DOM elements, handles data joins (`enter`/`update`/`exit`), and manages transitions.
2. **Declarative Approach (D3 as a Utility, React Renders JSX):** D3 computes scales and math paths, while React handles all DOM node creation via JSX.

### Architectural Decision

Due to our **heavy datasets** and requirements for **real-time user interactions**, this project adopts the **Imperative approach (`useRef`)**. Bypassing React's Virtual DOM reconciliation during visualization updates delivers significantly higher frame rates, lower memory consumption, and smoother interactive performance.