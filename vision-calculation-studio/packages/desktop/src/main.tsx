import React from "react";
import ReactDOM from "react-dom/client";
import "./i18n/config";
import App from "./App";
import "./themes.css";
import "./App.css";
import "./spanvision.css";
import { APP_NAME, DEFAULT_THEME } from "./branding";

document.title = APP_NAME;
try {
  const saved = JSON.parse(localStorage.getItem("spanvision-calculation-preferences") ?? "{}");
  document.documentElement.dataset.theme = saved.theme ?? DEFAULT_THEME;
} catch {
  document.documentElement.dataset.theme = DEFAULT_THEME;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
