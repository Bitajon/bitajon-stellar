import { Check, Copy, ExternalLink, Loader2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { explorer, shortAddress } from "../lib/format";
import { STAGE_INFO, type Stage } from "../lib/status";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`${className} animate-spin`} aria-hidden />;
}

export function ProgressBar({ value, size = "md" }: { value: number; size?: "sm" | "md" | "lg" }) {
  const h = size === "sm" ? "h-1.5" : size === "lg" ? "h-3.5" : "h-2.5";
  return (
    <div
      className={`${h} w-full overflow-hidden rounded-full bg-slate-100`}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className="ribbon-gradient animate-grow h-full rounded-full" style={{ width: `${Math.max(value, value > 0 ? 3 : 0)}%` }} />
    </div>
  );
}

export function StageBadge({ stage }: { stage: Stage }) {
  const info = STAGE_INFO[stage];
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${info.tone}`}>
      {info.label}
    </span>
  );
}

export function CopyButton({ value, label = "Copiar" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* el portapapeles puede no estar disponible */
        }
      }}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-brand-800"
      aria-label={label}
    >
      {done ? <Check className="h-3.5 w-3.5 text-leaf-600" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function AddressLink({ address, kind = "account", chars = 4 }: { address: string; kind?: "account" | "contract"; chars?: number }) {
  const href = kind === "contract" ? explorer.contract(address) : explorer.account(address);
  return (
    <span className="inline-flex items-center gap-0.5">
      <a href={href} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-brand-700 underline-offset-2 hover:underline" title={address}>
        {shortAddress(address, chars)}
      </a>
      <CopyButton value={address} label="Copiar dirección" />
    </span>
  );
}

export function TxLink({ hash, children }: { hash: string; children?: ReactNode }) {
  if (!hash) return null;
  return (
    <a href={explorer.tx(hash)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:underline">
      {children ?? "Ver transacción"} <ExternalLink className="h-3 w-3" />
    </a>
  );
}

export function EmptyState({ icon, title, children, action }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-leaf-50 text-leaf-700">{icon}</div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {children && <div className="mt-2 max-w-md text-sm text-slate-600">{children}</div>}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

export function ErrorBox({ title = "No se pudo cargar la información", error, onRetry }: { title?: string; error: unknown; onRetry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-rose-800/80">{error instanceof Error ? error.message : "Revisa tu conexión e inténtalo de nuevo."}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="mt-3 text-sm font-semibold text-rose-900 underline">
          Reintentar
        </button>
      )}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card overflow-hidden">
      <div className="h-40 animate-pulse bg-slate-100" />
      <div className="space-y-3 p-5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-slate-100" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
        <div className="h-2.5 w-full animate-pulse rounded-full bg-slate-100" />
      </div>
    </div>
  );
}

export function PageHeader({ eyebrow, title, children }: { eyebrow?: string; title: string; children?: ReactNode }) {
  return (
    <div className="border-b border-slate-200/70 bg-sand">
      <div className="container-page py-10 sm:py-14">
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 className="mt-2 text-3xl font-semibold sm:text-4xl">{title}</h1>
        {children && <div className="mt-3 max-w-2xl text-slate-600">{children}</div>}
      </div>
    </div>
  );
}
