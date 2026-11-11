import { Mail, Wallet } from "lucide-react";
import type { ReactNode } from "react";
import { tr } from "../lib/i18n";
import { useWallet } from "../lib/wallet";
import { ConnectButton, EmailLoginButton } from "./ConnectButton";

/**
 * Pide entrar antes de mostrar `children`.
 * `allowEmail`: también ofrece entrar con correo (fundaciones).
 */
export function RequireWallet({ children, title, text, allowEmail = false }: { children: ReactNode; title: string; text: string; allowEmail?: boolean }) {
  const { address } = useWallet();
  if (address) return <>{children}</>;
  return (
    <div className="card mx-auto flex max-w-lg flex-col items-center px-6 py-12 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-700">
        {allowEmail ? <Mail className="h-6 w-6" /> : <Wallet className="h-6 w-6" />}
      </div>
      <h2 className="text-2xl font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      {allowEmail ? (
        <div className="mt-6 flex w-full max-w-xs flex-col gap-3">
          <EmailLoginButton full />
          <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{tr("o", "or")}</p>
          <ConnectButton full />
        </div>
      ) : (
        <div className="mt-6">
          <ConnectButton />
        </div>
      )}
      <p className="mt-4 text-xs text-slate-500">
        {allowEmail
          ? tr(
              "Con correo no necesitas instalar nada: te enviamos un código y creamos tu cuenta en Stellar. Si ya usas ",
              "With email you don't need to install anything: we send you a code and create your Stellar account. If you already use ",
            )
          : tr("Usamos ", "We use ")}
        <a className="font-semibold text-brand-700 hover:underline" href="https://www.freighter.app/" target="_blank" rel="noopener noreferrer">
          Varial
        </a>
        {allowEmail
          ? tr(" (antes Freighter), puedes conectarla.", " (formerly Freighter), you can connect it.")
          : tr(" (antes Freighter), la wallet de Stellar para el navegador. Recuerda ponerla en la red Testnet.", " (formerly Freighter), the Stellar browser wallet. Remember to set it to Testnet.")}
      </p>
    </div>
  );
}
