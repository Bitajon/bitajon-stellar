import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// El SDK de Stellar usa `Buffer` y `global`, que no existen en el navegador.
// `buffer` se carga como polyfill en src/polyfills.ts y aquí se define `global`.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    global: "globalThis",
  },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 2000,
  },
});
