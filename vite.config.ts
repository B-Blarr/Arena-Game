import { defineConfig } from 'vite';

// base './' damit der statische Build aus jedem Unterordner laeuft.
// vendor-Chunk trennt three/postprocessing vom Spielcode (Browser-Cache).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    rollupOptions: {
      output: {
        // three/postprocessing getrennt vom Spielcode (Browser-Cache)
        manualChunks(id: string) {
          if (id.includes('node_modules')) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
