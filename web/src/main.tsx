import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App, Providers } from "./App";
import "./styles/reset_css.css";
import "./styles/tailwind.css";
import "./styles/base_style.css";
import "./styles/golf.css";

async function start() {
  if (document.fonts) {
    let timeout: number | undefined;
    try {
      await Promise.race([
        document.fonts.load('400 1em "appFont"'),
        new Promise<void>((resolve) => {
          timeout = window.setTimeout(resolve, 3000);
        }),
      ]);
    } catch {
      // Keep the app usable if the font download fails.
    } finally {
      window.clearTimeout(timeout);
    }
  }

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
}

void start();
