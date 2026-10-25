/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { privateBoundary } from "./dev/private-boundary";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const proxy = {
    "/api/golf": { target: env.GOLF_API_TARGET || "http://127.0.0.1:5103" },
    "/golf/socket.io": { target: env.GOLF_API_TARGET || "http://127.0.0.1:5103", ws: true },
    "/api/account": {
      target: env.ACCOUNT_PROXY_TARGET || "http://127.0.0.1:5100",
      changeOrigin: true,
      rewrite: (p: string) => p.replace(/^\/api/, ""),
    },
  };
  return {
    base: env.VITE_BASE_PATH || (mode === "production" ? "/golf/" : "/"),
    plugins: [react(), tailwindcss(), privateBoundary()],
    resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
    server: { host: "127.0.0.1", port: 3003, strictPort: true, proxy },
    preview: { host: "127.0.0.1", port: 3003, strictPort: true, proxy },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      include: ["src/**/*.test.{ts,tsx}"],
    },
  };
});
