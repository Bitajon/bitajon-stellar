// El polyfill va primero: el SDK de Stellar necesita Buffer al cargarse.
import "./polyfills";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import { persistCache, restoreCache } from "./lib/persist";
import { CurrencyProvider } from "./lib/currency";
import { LangProvider } from "./lib/i18n";
import { WalletProvider, WalletRoot } from "./lib/wallet";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});
// Muestra al instante lo último que se vio y lo actualiza en segundo plano.
restoreCache(queryClient);
persistCache(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <LangProvider>
      {(lang) => (
        // key={lang}: al cambiar de idioma se vuelve a montar todo con los textos nuevos (la caché se conserva).
        <WalletRoot key={lang}>
          <QueryClientProvider client={queryClient}>
            <WalletProvider>
              <CurrencyProvider>
                <App />
                <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
              </CurrencyProvider>
            </WalletProvider>
          </QueryClientProvider>
        </WalletRoot>
      )}
    </LangProvider>
  </StrictMode>,
);
