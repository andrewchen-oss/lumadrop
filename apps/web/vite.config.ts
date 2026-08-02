import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";

import { sites } from "./build/sites-vite-plugin.js";

export default defineConfig(({ mode }) => ({
  plugins: mode === "test" ? [react()] : [react(), sites(), cloudflare()],
  build: {
    target: "es2022",
    sourcemap: true
  }
}));
