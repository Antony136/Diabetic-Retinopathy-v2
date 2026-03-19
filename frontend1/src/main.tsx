import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App";
import "./styles/index.css";
import { initThemeMode } from "./services/theme";
import { initAnimationsEnabled } from "./services/animations";
import { initHighContrastEnabled } from "./services/contrast";

initThemeMode();
initAnimationsEnabled();
initHighContrastEnabled();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
