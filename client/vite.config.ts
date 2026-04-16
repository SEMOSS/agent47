import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "") as {
    ENDPOINT: string;
    MODULE: string;
    APP: string;
  };

  return {
    root: "src",
    base: "./",
    envDir: "../",
    envPrefix: "CLIENT_",
    resolve: {
      alias: {
        "@": resolve(__dirname, "./src"),
      },
    },
    define: {
      "import.meta.env.ENDPOINT": JSON.stringify(env.ENDPOINT),
      "import.meta.env.MODULE": JSON.stringify(env.MODULE),
      "import.meta.env.APP": JSON.stringify(env.APP),
    },
    server: {
      proxy: {
        [env.MODULE]: {
          target: env.ENDPOINT,
          changeOrigin: true,
          secure: false,
          ws: true,
          // Suppress noisy EPIPE / ECONNRESET errors that happen
          // when either side drops a proxied WebSocket connection
          // (HMR reloads, browser tab close, backend restart).
          configure: (proxy) => {
            proxy.on("error", (err) => {
              if (
                "code" in err &&
                (err.code === "EPIPE" || err.code === "ECONNRESET")
              ) {
                return; // expected on WS disconnect — ignore
              }
              console.error("[vite proxy]", err.message);
            });
            proxy.on("proxyReqWs", (_proxyReq, _req, socket) => {
              socket.on("error", (err) => {
                if (
                  "code" in err &&
                  (err.code === "EPIPE" || err.code === "ECONNRESET")
                ) {
                  return;
                }
                console.error("[vite proxy ws]", err.message);
              });
            });
          },
        },
      },
    },
    build: {
      outDir: "../../portals",
      emptyOutDir: true,
    },
    plugins: [react(), tailwindcss()],
  };
});
