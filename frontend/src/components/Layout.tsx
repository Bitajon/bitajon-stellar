import { AlertTriangle, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { CONTRACT_LABELS, CONTRACTS, IS_TESTNET } from "../config";
import { useWallet } from "../lib/wallet";
import { ConnectButton } from "./ConnectButton";
import { Logo } from "./Logo";
import { AddressLink } from "./ui";

const NAV = [
  { to: "/campanas", label: "Campañas" },
  { to: "/como-funciona", label: "Cómo funciona" },
  { to: "/fundacion", label: "Para fundaciones" },
  { to: "/mis-donaciones", label: "Mis donaciones" },
];

function navClass({ isActive }: { isActive: boolean }) {
  return `rounded-full px-3.5 py-2 text-sm font-semibold transition ${
    isActive ? "bg-brand-50 text-brand-800" : "text-slate-600 hover:bg-slate-50 hover:text-brand-800"
  }`;
}

export function Layout() {
  const { isAdmin, wrongNetwork } = useWallet();
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setOpen(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  const items = isAdmin ? [...NAV, { to: "/admin", label: "Admin" }] : NAV;

  return (
    <div className="flex min-h-dvh flex-col">
      {IS_TESTNET && (
        <div className="ribbon-gradient px-4 py-1.5 text-center text-xs font-medium text-white">
          Demo en Stellar Testnet: los fondos son de prueba y no tienen valor real.
        </div>
      )}
      {wrongNetwork && (
        <div className="flex items-center justify-center gap-2 bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Freighter está en otra red. Cámbiala a Testnet para firmar.
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/85 backdrop-blur-md">
        <div className="container-page flex h-16 items-center justify-between gap-4">
          <Logo />
          <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} className={navClass}>
                {i.label}
              </NavLink>
            ))}
          </nav>
          <div className="hidden lg:block">
            <ConnectButton />
          </div>
          <button type="button" className="btn-ghost !p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label={open ? "Cerrar menú" : "Abrir menú"} aria-expanded={open}>
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
        </div>
        {open && (
          <div className="animate-rise border-t border-slate-100 bg-white lg:hidden">
            <nav className="container-page flex flex-col gap-1 py-3" aria-label="Principal móvil">
              {items.map((i) => (
                <NavLink key={i.to} to={i.to} className={navClass}>
                  {i.label}
                </NavLink>
              ))}
              <div className="mt-2">
                <ConnectButton full />
              </div>
            </nav>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <footer className="mt-20 border-t border-slate-200/70 bg-brand-950 text-brand-100">
        <div className="container-page grid gap-10 py-12 md:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-2.5">
              <img src="/brand/mark.png" alt="" className="h-8 w-auto" />
              <span className="font-display text-xl font-semibold tracking-wide text-white">BITAJÓN</span>
            </div>
            <p className="mt-3 max-w-sm text-sm text-brand-200/80">
              Donaciones a campañas de fundaciones con fondos en custodia y evidencia verificable en la red Stellar.
            </p>
            <p className="mt-6 text-xs text-brand-300/70">Equipo Abba Emuná · Ruta JaveBlockchain 2026-II · Pontificia Universidad Javeriana</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Contratos públicos {IS_TESTNET ? "(testnet)" : ""}</p>
            <p className="mt-1 text-xs text-brand-300/80">Cualquiera puede auditar cada movimiento en el explorador.</p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-2">
              {(Object.keys(CONTRACTS) as (keyof typeof CONTRACTS)[]).map((k) => (
                <li key={k} className="rounded-xl bg-white/5 px-3 py-2.5 ring-1 ring-white/10">
                  <p className="text-xs text-brand-200">{CONTRACT_LABELS[k]}</p>
                  <div className="[&_a]:text-leaf-300 [&_button]:text-brand-300">
                    <AddressLink address={CONTRACTS[k]} kind="contract" chars={6} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
