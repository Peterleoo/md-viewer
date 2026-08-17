import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite is used only for the renderer (React) part. The dev server runs on localhost.
export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        // optional manual chunking example (split monaco-editor)
        manualChunks(id) {
          if (id.includes('node_modules/monaco-editor')) return 'monaco';
        }
      }
    }
  },
  server: {
    port: 5173,
    strictPort: true
  }
});
