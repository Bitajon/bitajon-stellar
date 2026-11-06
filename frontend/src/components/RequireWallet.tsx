import { Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { useWallet } from "../lib/wallet";
import { ConnectButton } from "./ConnectButton";

export function RequireWallet({ children, title, text }: { children: ReactNode; title: string; text: string }) {
  const { address } = useWallet();
  if (address) return <>{children}</>;
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        <Wallet className="h-6 w-6" />
      </div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      <div className="mt-6">
        <ConnectButton />
      </div>
      <p className="mt-4 text-xs text-slate-500">
        Usamos{" "}
        <a className="font-semibold text-brand-700 hover:underline" href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">
          Freighter
        </a>
        , la wallet de Stellar para el navegador. Recuerda ponerla en la red Testnet.
      </p>
    </div>
  );
}
