import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Static output — Wrangler serves the dist/ folder via the ASSETS binding.
// No SSR adapter needed; all dynamic data is loaded client-side via /api/* routes
// handled by the Worker (src/worker/index.ts).
export default defineConfig({
  output: 'static',
  outDir: './dist',
  vite: {
    plugins: [tailwindcss()],
  },
});
