import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/auth": "http://localhost:8000",
      "/predictions": "http://localhost:8000",
      "/tournament": "http://localhost:8000",
      // /leaderboard is owned by the SPA; only API GET (no Accept: text/html)
      // should reach the backend. Bypass HTML requests so the SPA gets index.html.
      "/leaderboard": {
        target: "http://localhost:8000",
        bypass(req) {
          if ((req.headers.accept || "").includes("text/html"))
            return "/index.html";
        },
      },
      // /admin is the SPA route; sub-paths like /admin/login are real API calls.
      "/admin": {
        target: "http://localhost:8000",
        bypass(req) {
          if (req.method === "GET" && req.url === "/admin")
            return "/index.html";
        },
      },
      "/healthz": "http://localhost:8000",
    },
  },
});
