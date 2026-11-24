import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const API_TARGET = process.env["VITE_API_PROXY"] ?? "http://localhost:4000";

/** Vendor chunk name -> packages in it (matched on the resolved module path). */
const VENDOR_CHUNKS: [string, RegExp][] = [
  ["react", /[\\/]node_modules[\\/](react|react-dom|react-router|scheduler)[\\/]/],
  ["data", /[\\/]node_modules[\\/](@tanstack|zod)[\\/]/],
  [
    "ui",
    /[\\/]node_modules[\\/](@base-ui|@floating-ui|motion|motion-dom|motion-utils|framer-motion|sonner)[\\/]/,
  ],
];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  server: {
    port: 5173,
    strictPort: true,
    // Same-origin in development too: the session cookie and SSE work exactly as in production.
    proxy: { "/api": { target: API_TARGET, changeOrigin: false } },
  },
  build: {
    target: "es2023",
    sourcemap: true,
    rollupOptions: {
      output: {
        // Stable vendor chunks cache across deploys; feature code is split per route.
        manualChunks: (id) => {
          if (!id.includes("node_modules")) return undefined;
          return VENDOR_CHUNKS.find(([, pattern]) => pattern.test(id))?.[0];
        },
      },
    },
  },
});
