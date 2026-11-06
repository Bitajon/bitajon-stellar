import { ChevronDown, Droplets, ExternalLink, LogOut, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IS_TESTNET } from "../config";
import { useBalance, useRefreshAll } from "../hooks/queries";
import { friendlyError } from "../lib/errors";
import { explorer, formatToken, shortAddress } from "../lib/format";
import { fundWithFriendbot } from "../lib/horizon";
import { useWallet } from "../lib/wallet";
import { CopyButton, Spinner } from "./ui";

export function ConnectButton({ full = false }: { full?: boolean }) {
  const { address, installed, connecting, connect, disconnect, isAdmin } = useWallet();
  const balance = useBalance(address);
  const refreshAll = useRefreshAll();
  const [open, setOpen] = useState(false);
  const [funding, setFunding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (installed === false && !address) {
    return (
      <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className={`btn-outline ${full ? "w-full" : ""}`}>
        <Wallet className="h-4 w-4" /> Instalar Freighter
      </a>
    );
  }

  if (!address) {
    return (
      <button
        type="button"
        className={`btn-navy ${full ? "w-full" : ""}`}
        disabled={connecting}
        onClick={async () => {
          try {
            await connect();
            toast.success("Wallet conectada");
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      >
        {connecting ? <Spinner className="h-4 w-4" /> : <Wallet className="h-4 w-4" />} Conectar wallet
      </button>
    );
  }

  const notFunded = balance.data === null;

  async function fund() {
    if (!address) return;
    setFunding(true);
    try {
      await fundWithFriendbot(address);
      toast.success("Listo: tu cuenta tiene XLM de prueba.");
      await refreshAll();
    } catch (e) {
      toast.error(friendlyError(e));
    } finally {
      setFunding(false);
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`btn-outline !py-2 !pr-3 !pl-2 ${full ? "w-full justify-between" : ""}`}
        aria-expanded={open}
      >
        <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-600 to-leaf-500 text-[0.65rem] font-bold text-white">
          {address.slice(1, 3)}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="font-mono text-xs">{shortAddress(address)}</span>
          <span className="text-[0.7rem] font-medium text-slate-500">
            {balance.isLoading ? "…" : notFunded ? "Sin fondos" : formatToken(balance.data ?? 0n, 1)}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="animate-rise absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift">
          <div className="rounded-xl bg-sand p-3">
            <p className="text-xs font-semibold text-slate-500">Cuenta conectada {isAdmin && "· Admin"}</p>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs break-all text-brand-900">{shortAddress(address, 8)}</span>
              <CopyButton value={address} />
            </div>
          </div>
          {IS_TESTNET && (
            <button type="button" onClick={fund} disabled={funding} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-leaf-50 disabled:opacity-60">
              {funding ? <Spinner className="h-4 w-4" /> : <Droplets className="h-4 w-4 text-leaf-600" />}
              <span>
                <span className="block font-semibold text-brand-900">Obtener XLM de prueba</span>
                <span className="block text-xs text-slate-500">{notFunded ? "Activa tu cuenta en testnet" : "Friendbot de testnet"}</span>
              </span>
            </button>
          )}
          <a href={explorer.account(address)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50">
            <ExternalLink className="h-4 w-4 text-slate-500" /> Ver en stellar.expert
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> Desconectar
          </button>
        </div>
      )}
    </div>
  );
}
