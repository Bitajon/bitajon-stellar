import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// El SDK de Stellar usa `Buffer` y `global`, que no existen en el navegador.
// `buffer` se carga como polyfill en src/polyfills.ts y aquí se define `global`.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const bluxAppId =
    process.env.APP_ID_KEY ||
    env.APP_ID_KEY ||
    process.env.VITE_BLUX_APP_ID ||
    env.VITE_BLUX_APP_ID ||
    "";

  return {
    plugins: [react(), tailwindcss()],
    define: {
      global: "globalThis",
      "import.meta.env.APP_ID_KEY": JSON.stringify(bluxAppId),
    },
    build: {
      target: "es2022",
      chunkSizeWarningLimit: 2000,
    },
  };
});
