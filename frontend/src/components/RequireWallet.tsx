import type { ReactNode } from "react";
import { ShieldCheck, Sparkles, Wallet } from "lucide-react";
import { tr } from "../lib/i18n";
import { useWallet } from "../lib/wallet";

type RequireWalletProps = {
  children: ReactNode;
  allowEmail?: boolean;
  title?: string;
  text?: string;
};

export function RequireWallet({
  children,
  title,
  text,
}: RequireWalletProps) {
  const { address, googleUser, openAuth } = useWallet();

  if (address) {
    return <>{children}</>;
  }

  return (
    <div className="card mx-auto max-w-xl p-8 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        {googleUser ? (
          <Sparkles className="h-6 w-6 text-leaf-600" />
        ) : (
          <Wallet className="h-6 w-6" />
        )}
      </div>

      <h2 className="mt-4 text-2xl font-semibold text-brand-900">
        {title ??
          tr(
            "Vincula y conecta tu cuenta Stellar para firmar",
            "Link and connect your Stellar account to sign",
          )}
      </h2>

      <p className="mt-2 text-sm leading-relaxed text-slate-600">
        {googleUser
          ? tr(
              `Identificamos tu sesión de Google (${googleUser.email}). Conecta tu cuenta Stellar (Blux o Varial) para vincularla y firmar transacciones en la red.`,
              `We found your Google session (${googleUser.email}). Connect your Stellar account (Blux or Varial) to link it and sign transactions on-chain.`,
            )
          : (text ??
            tr(
              "Conecta una dirección Stellar (G...) mediante Blux o Varial para firmar operaciones en BITAJÓN.",
              "Connect a Stellar address (G...) via Blux or Varial to sign operations in BITAJÓN.",
            ))}
      </p>

      {googleUser?.linkedAddress && (
        <p className="mt-3 rounded-xl bg-sand px-3 py-2 font-mono text-xs text-slate-700">
          {tr("Última dirección vinculada:", "Last linked address:")}{" "}
          {googleUser.linkedAddress}
        </p>
      )}

      <div className="mt-6 flex flex-col items-center gap-3">
        <button type="button" onClick={openAuth} className="btn-primary !px-6 !py-3">
          <ShieldCheck className="h-4 w-4" />
          {tr(
            "Conectar cuenta Stellar para firmar",
            "Connect Stellar account to sign",
          )}
        </button>
      </div>
    </div>
  );
}