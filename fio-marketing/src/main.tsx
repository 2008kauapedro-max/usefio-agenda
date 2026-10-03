import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-700.css";
import { App } from "./App";
import { MarketingI18nProvider } from "./i18n";
import "./styles/global.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <MarketingI18nProvider>
      <App />
    </MarketingI18nProvider>
  </React.StrictMode>,
);
