import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwind()],
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {manualChunks: {charts: ["recharts"], motion: ["framer-motion"]}}
    }
  }
});
