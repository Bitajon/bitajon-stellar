import { ChevronDown, Droplets, ExternalLink, LogOut, Mail, Wallet } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { IS_TESTNET } from "../config";
import { useBalance, useRefreshAll } from "../hooks/queries";
import { useFiatValue } from "../lib/currency";
import { friendlyError } from "../lib/errors";
import { explorer, formatToken, shortAddress } from "../lib/format";
import { fundWithFriendbot } from "../lib/horizon";
import { tr } from "../lib/i18n";
import { useWallet } from "../lib/wallet";
import { CopyButton, Spinner } from "./ui";

/** Entrar con correo (Blux). Pensado para fundaciones. */
export function EmailLoginButton({ full = false }: { full?: boolean }) {
  const { loginWithEmail, connecting } = useWallet();
  return (
    <button
      type="button"
      className={`btn-primary ${full ? "w-full" : ""}`}
      disabled={connecting}
      onClick={async () => {
        try {
          await loginWithEmail();
        } catch (e) {
          toast.error(friendlyError(e));
        }
      }}
    >
      {connecting ? <Spinner className="h-4 w-4" /> : <Mail className="h-4 w-4" />} {tr("Entrar con correo", "Continue with email")}
    </button>
  );
}

export function ConnectButton({ full = false }: { full?: boolean }) {
  const { address, mode, email, installed, connecting, connect, disconnect, isAdmin } = useWallet();
  const balance = useBalance(address);
  const toFiat = useFiatValue();
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
      <a href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer" className={`btn-outline whitespace-nowrap ${full ? "w-full" : ""}`}>
        <Wallet className="h-4 w-4" /> {tr("Instalar Varial", "Install Varial")}
      </a>
    );
  }

  if (!address) {
    return (
      <button
        type="button"
        className={`btn-navy whitespace-nowrap ${full ? "w-full" : ""}`}
        disabled={connecting}
        onClick={async () => {
          try {
            await connect();
            toast.success(tr("Wallet conectada", "Wallet connected"));
          } catch (e) {
            toast.error(friendlyError(e));
          }
        }}
      >
        {connecting ? <Spinner className="h-4 w-4" /> : <Wallet className="h-4 w-4" />} {tr("Conectar wallet", "Connect wallet")}
      </button>
    );
  }

  const notFunded = balance.data === null;
  const fiat = balance.data ? toFiat(balance.data) : null;

  async function fund() {
    if (!address) return;
    setFunding(true);
    try {
      await fundWithFriendbot(address);
      toast.success(tr("Listo: tu cuenta tiene XLM de prueba.", "Done: your account has test XLM."));
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
          {mode === "email" ? <Mail className="h-3.5 w-3.5" /> : address.slice(1, 3)}
        </span>
        <span className="flex flex-col items-start leading-tight">
          <span className="max-w-36 truncate text-xs font-semibold">{mode === "email" && email ? email : <span className="font-mono">{shortAddress(address)}</span>}</span>
          <span className="text-[0.7rem] font-medium text-slate-500">
            {balance.isLoading ? "…" : notFunded ? tr("Sin fondos", "No funds") : formatToken(balance.data ?? 0n, 1)}
          </span>
        </span>
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div className="animate-rise absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-2 shadow-lift">
          <div className="rounded-xl bg-sand p-3">
            <p className="text-xs font-semibold text-slate-500">
              {mode === "email" ? tr("Cuenta con correo", "Email account") : tr("Wallet conectada", "Connected wallet")} {isAdmin && "· Admin"}
            </p>
            {mode === "email" && email && <p className="mt-1 truncate text-sm font-semibold text-brand-900">{email}</p>}
            <div className="mt-1 flex items-center justify-between gap-2">
              <span className="font-mono text-xs break-all text-brand-900">{shortAddress(address, 8)}</span>
              <CopyButton value={address} />
            </div>
            {fiat && <p className="mt-1 text-sm font-semibold text-brand-900">{fiat}</p>}
          </div>
          {IS_TESTNET && (
            <button type="button" onClick={fund} disabled={funding} className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm hover:bg-leaf-50 disabled:opacity-60">
              {funding ? <Spinner className="h-4 w-4" /> : <Droplets className="h-4 w-4 text-leaf-600" />}
              <span>
                <span className="block font-semibold text-brand-900">{tr("Obtener XLM de prueba", "Get test XLM")}</span>
                <span className="block text-xs text-slate-500">{notFunded ? tr("Activa tu cuenta en testnet", "Activate your testnet account") : tr("Friendbot de testnet", "Testnet Friendbot")}</span>
              </span>
            </button>
          )}
          <a href={explorer.account(address)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm hover:bg-slate-50">
            <ExternalLink className="h-4 w-4 text-slate-500" /> {tr("Ver en stellar.expert", "View on stellar.expert")}
          </a>
          <button
            type="button"
            onClick={() => {
              disconnect();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-left text-sm text-rose-700 hover:bg-rose-50"
          >
            <LogOut className="h-4 w-4" /> {mode === "email" ? tr("Cerrar sesión", "Sign out") : tr("Desconectar", "Disconnect")}
          </button>
        </div>
      )}
    </div>
  );
}
