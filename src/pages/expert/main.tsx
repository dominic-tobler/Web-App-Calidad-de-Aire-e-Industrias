import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "../../index.css"
import "../standard/dashboard.css"
import { ExpertShell } from "./ExpertShell"

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ExpertShell />
  </StrictMode>,
)
