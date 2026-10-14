import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// The page. bun run explore builds it into dist/ for server.ts; explore:dev
// serves it here, hot, the API proxied to server.ts.
export default defineConfig({
  server: { host: "127.0.0.1", port: 4101, strictPort: true, proxy: { "/api": "http://127.0.0.1:4100" } },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [react(), tailwindcss()],
  build: { outDir: "dist", emptyOutDir: true, chunkSizeWarningLimit: 1200 },
});
