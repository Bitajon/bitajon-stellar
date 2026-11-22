import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Building2,
  ChevronDown,
  Coins,
  ExternalLink,
  HeartHandshake,
  LogOut,
  Mail,
  Shield,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { IS_TESTNET, TOKEN_SYMBOL } from "../config";
import { useBalance, useRefreshAll } from "../hooks/queries";
import { useFiatValue } from "../lib/currency";
import { friendlyError } from "../lib/errors";
import { explorer, formatToken, shortAddress, unitsToNumber } from "../lib/format";
import { tr } from "../lib/i18n";
import { useWallet } from "../lib/wallet";
import { CopyButton, Spinner } from "./ui";

type AccountMenuProps = {
  full?: boolean;
  onFundTestnet?: (address: string) => Promise<void>;
};

export function AccountMenu({ full = false, onFundTestnet }: AccountMenuProps) {
  const { address, mode, email, disconnect, isAdmin } = useWallet();
  const balance = useBalance(address);
  const toFiat = useFiatValue();
  const refreshAll = useRefreshAll();

  const [open, setOpen] = useState(false);
  const [funding, setFunding] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  if (!address) return null;

  const rawStroops = balance.data ?? 0n;
  const xlmAmount = unitsToNumber(rawStroops);
  const fiatFormatted = toFiat(rawStroops);

  const handleFund = async () => {
    if (!onFundTestnet || !address) return;
    setFunding(true);
    try {
      await onFundTestnet(address);
      refreshAll();
      toast.success(
        tr(
          "XLM de prueba acreditados en tu cuenta",
          "Testnet XLM credited to your account",
        ),
      );
    } catch (err) {
      toast.error(friendlyError(err));
    } finally {
      setFunding(false);
    }
  };

  return (
    <div ref={ref} className={`relative ${full ? "w-full" : ""}`}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`inline-flex items-center justify-between gap-2.5 rounded-full border border-[#01417E]/20 bg-white px-3.5 py-2 text-sm font-medium text-[#01417E] shadow-xs transition hover:border-[#01417E]/40 hover:bg-[#01417E]/[0.03] ${
          full ? "w-full" : ""
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#018D46]/12 text-[#018D46]">
            {mode === "email" ? (
              <Mail className="h-3.5 w-3.5" />
            ) : (
              <Wallet className="h-3.5 w-3.5" />
            )}
          </span>
          <span className="max-w-[150px] truncate font-semibold">
            {mode === "email" && email ? email : shortAddress(address)}
          </span>
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl">
          <div className="border-b border-slate-100 pb-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {mode === "email"
                  ? tr("Cuenta por correo", "Email account")
                  : tr("Billetera Varial", "Varial wallet")}
              </span>
              <span className="rounded-full bg-[#018D46]/10 px-2 py-0.5 text-[11px] font-medium text-[#018D46]">
                {IS_TESTNET ? "Testnet" : "Mainnet"}
              </span>
            </div>

            {mode === "email" && email && (
              <p className="mt-1 truncate text-sm font-semibold text-slate-800">
                {email}
              </p>
            )}

            <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-600">
              <span className="font-mono">{shortAddress(address, 6)}</span>
              <CopyButton value={address} />
            </div>
          </div>

          <div className="border-b border-slate-100 py-3">
            <span className="block text-xs text-slate-500">
              {tr("Saldo disponible", "Available balance")}
            </span>
            <p className="mt-0.5 text-base font-bold text-[#01417E]">
              {balance.isLoading
                ? "…"
                : `${formatToken(rawStroops)} ${TOKEN_SYMBOL}`}
            </p>
            {fiatFormatted && (
              <p className="text-xs text-slate-500">≈ {fiatFormatted}</p>
            )}

            {IS_TESTNET && onFundTestnet && (
              <button
                type="button"
                disabled={funding}
                onClick={handleFund}
                className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-xl border border-[#01417E]/20 bg-[#01417E]/[0.04] px-3 py-1.5 text-xs font-semibold text-[#01417E] transition hover:bg-[#01417E]/10 disabled:opacity-60"
              >
                {funding ? (
                  <Spinner className="h-3.5 w-3.5 text-[#01417E]" />
                ) : (
                  <Coins className="h-3.5 w-3.5 text-[#018D46]" />
                )}
                <span>
                  {tr(
                    "Obtener XLM de prueba (Friendbot)",
                    "Get testnet XLM (Friendbot)",
                  )}
                </span>
              </button>
            )}
          </div>

          <div className="space-y-1 py-2">
            <Link
              to="/mis-donaciones"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#01417E]"
            >
              <HeartHandshake className="h-4 w-4 text-[#018D46]" />
              <span>{tr("Mis donaciones", "My donations")}</span>
            </Link>

            <Link
              to="/fundacion"
              onClick={() => setOpen(false)}
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#01417E]"
            >
              <Building2 className="h-4 w-4 text-[#01417E]" />
              <span>{tr("Panel de fundación", "Nonprofit portal")}</span>
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#01417E]"
              >
                <Shield className="h-4 w-4 text-amber-600" />
                <span>{tr("Administración", "Admin")}</span>
              </Link>
            )}

            <a
              href={explorer.account(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-[#01417E]"
            >
              <ExternalLink className="h-4 w-4 text-slate-400" />
              <span>{tr("Ver en stellar.expert", "View on stellar.expert")}</span>
            </a>
          </div>

          <div className="border-t border-slate-100 pt-2">
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                disconnect();
                toast.success(tr("Sesión cerrada", "Signed out"));
              }}
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              <span>{tr("Cerrar sesión", "Sign out")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}