import type { Plugin, ViteDevServer, PreviewServer } from "vite";

/** Never expose a private service API through a public development proxy. */
export function privateBoundary(): Plugin {
  const install = (server: ViteDevServer | PreviewServer) => {
    server.middlewares.use((request, response, next) => {
      try {
        let path = new URL(request.url || "/", "http://localhost").pathname;
        for (let pass = 0; pass < 4; pass++) {
          if (/(^|\/)_internal(\/|$)/.test(path)) {
            response.statusCode = 404;
            response.end("Not found");
            return;
          }
          const decoded = decodeURIComponent(path);
          if (decoded === path) break;
          path = decoded;
        }
      } catch {
        response.statusCode = 404;
        response.end("Not found");
        return;
      }
      next();
    });
  };
  return {
    name: "private-service-boundary",
    configureServer: install,
    configurePreviewServer: install,
  };
}
