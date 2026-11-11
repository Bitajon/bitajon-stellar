import { useQuery } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { formatFiat, formatToken, unitsToNumber, type Fiat } from "./format";
import { getLang, tr } from "./i18n";
import { getXlmPrice } from "./offchain";

/*
 * Conversión aproximada de XLM a pesos colombianos o dólares.
 * Las donaciones siempre se hacen en XLM; el valor en COP/USD es una referencia con el
 * precio de CoinGecko (se actualiza cada 5 minutos en el servidor).
 */
const STORAGE_KEY = "bitajon.fiat";

function initialFiat(): Fiat {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "COP" || v === "USD") return v;
  } catch {
    /* sin almacenamiento */
  }
  return getLang() === "en" ? "USD" : "COP";
}

type CurrencyState = { fiat: Fiat; setFiat: (f: Fiat) => void };
const CurrencyContext = createContext<CurrencyState | null>(null);

export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [fiat, setFiatState] = useState<Fiat>(initialFiat);
  const setFiat = useCallback((f: Fiat) => {
    try {
      localStorage.setItem(STORAGE_KEY, f);
    } catch {
      /* sin almacenamiento */
    }
    setFiatState(f);
  }, []);
  const value = useMemo(() => ({ fiat, setFiat }), [fiat, setFiat]);
  return <CurrencyContext.Provider value={value}>{children}</CurrencyContext.Provider>;
}

export function useCurrency(): CurrencyState {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error("useCurrency debe usarse dentro de <CurrencyProvider>");
  return ctx;
}

export function usePrice() {
  return useQuery({ queryKey: ["xlm-price"], queryFn: getXlmPrice, staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, retry: 1 });
}

/** Valor aproximado en la moneda elegida, o null si aún no hay precio. */
export function useFiatValue() {
  const { fiat } = useCurrency();
  const price = usePrice();
  return useCallback(
    (units: bigint): string | null => {
      if (!price.data) return null;
      const rate = fiat === "COP" ? price.data.cop : price.data.usd;
      return formatFiat(unitsToNumber(units) * rate, fiat);
    },
    [fiat, price.data],
  );
}

/**
 * Monto con el valor en COP/USD grande y el XLM pequeño debajo.
 * Mientras no hay precio (o si falla), se muestra el XLM como valor principal.
 */
export function Money({
  units,
  decimals = 2,
  className = "",
  fiatClassName = "block text-xs font-medium text-slate-500",
  inline = false,
}: {
  units: bigint;
  decimals?: number;
  className?: string;
  /** Clase de la línea pequeña (el XLM). */
  fiatClassName?: string;
  inline?: boolean;
}) {
  const toFiat = useFiatValue();
  const fiat = toFiat(units);
  const xlm = formatToken(units, decimals);
  if (inline)
    return (
      <span className={className}>
        {fiat ?? xlm}
        {fiat && <span className="font-normal text-slate-500"> ({xlm})</span>}
      </span>
    );
  return (
    <span className={className}>
      {fiat ?? xlm}
      {fiat && <span className={fiatClassName}>{xlm}</span>}
    </span>
  );
}

/** Texto plano: "$ 1.246.193 COP" o, sin precio, "2.570 XLM". */
export function useMoneyText() {
  const toFiat = useFiatValue();
  return useCallback((units: bigint, decimals = 2) => toFiat(units) ?? formatToken(units, decimals), [toFiat]);
}

/** Selector COP / USD para el encabezado. */
export function FiatToggle({ className = "" }: { className?: string }) {
  const { fiat, setFiat } = useCurrency();
  const price = usePrice();
  const title = price.data
    ? tr(
        `1 XLM ≈ ${formatFiat(price.data.cop, "COP")} ≈ ${formatFiat(price.data.usd, "USD")} · ${price.data.source}`,
        `1 XLM ≈ ${formatFiat(price.data.usd, "USD")} ≈ ${formatFiat(price.data.cop, "COP")} · ${price.data.source}`,
      )
    : tr("Precio del XLM no disponible", "XLM price unavailable");
  return (
    <div className={`inline-flex rounded-full bg-slate-100 p-0.5 text-xs font-semibold ${className}`} role="group" aria-label={tr("Moneda de referencia", "Reference currency")} title={title}>
      {(["COP", "USD"] as Fiat[]).map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => setFiat(f)}
          aria-pressed={fiat === f}
          className={`rounded-full px-2.5 py-1 transition ${fiat === f ? "bg-white text-brand-800 shadow-sm" : "text-slate-500 hover:text-brand-800"}`}
        >
          {f}
        </button>
      ))}
    </div>
  );
}

/** Texto corto del precio actual, para notas al pie. */
export function PriceNote() {
  const price = usePrice();
  if (!price.data) return null;
  return (
    <p className="text-[0.7rem] text-slate-500">
      {tr("Equivalentes aproximados", "Approximate equivalents")}: 1 XLM ≈ {formatFiat(price.data.cop, "COP")} · {formatFiat(price.data.usd, "USD")} ({price.data.source}
      {price.data.stale ? tr(", precio desactualizado", ", stale price") : ""})
    </p>
  );
}
