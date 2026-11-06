// El polyfill va primero: el SDK de Stellar necesita Buffer al cargarse.
import "./polyfills";
import "./index.css";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { App } from "./App";
import { WalletProvider } from "./lib/wallet";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: false },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <App />
        <Toaster position="top-center" richColors closeButton toastOptions={{ style: { fontFamily: "var(--font-sans)" } }} />
      </WalletProvider>
    </QueryClientProvider>
  </StrictMode>,
);
