import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "../index.css"
import "../app/dashboard.css"
import { ExpertDashboard } from "./ExpertDashboard"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExpertDashboard />
  </StrictMode>,
)
