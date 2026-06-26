import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8093",
      "/health": "http://localhost:8093",
      "/version.json": "http://localhost:8093",
      "/.well-known": "http://localhost:8093",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          tesseract: ["tesseract.js"],
          cytoscape: ["cytoscape"],
          xterm: ["@xterm/xterm", "@xterm/addon-fit"],
        },
      },
    },
  },
});
