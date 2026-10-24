import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App, Providers } from "./App";
import "./styles/reset_css.css";
import "./styles/tailwind.css";
import "./styles/base_style.css";
import "./styles/golf.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter
      basename={import.meta.env.BASE_URL.replace(/\/$/, "") || "/"}
    >
      <Providers>
        <App />
      </Providers>
    </BrowserRouter>
  </React.StrictMode>
);
