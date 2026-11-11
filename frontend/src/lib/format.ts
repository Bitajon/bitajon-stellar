import { EXPLORER_URL, TOKEN_DECIMALS, TOKEN_SYMBOL } from "../config";
import { getLang, locale, tr } from "./i18n";

const SCALE = 10n ** BigInt(TOKEN_DECIMALS);

/** Convierte unidades mínimas (stroops) a texto legible: 12345678900n → "1.234,57". */
export function formatAmount(units: bigint, maxDecimals = 2): string {
  const negative = units < 0n;
  const abs = negative ? -units : units;
  const whole = abs / SCALE;
  const frac = abs % SCALE;
  const fracStr = frac.toString().padStart(TOKEN_DECIMALS, "0").slice(0, maxDecimals).replace(/0+$/, "");
  const wholeStr = whole.toLocaleString(locale());
  const dec = getLang() === "en" ? "." : ",";
  return `${negative ? "-" : ""}${wholeStr}${fracStr ? dec + fracStr : ""}`;
}

export function formatToken(units: bigint, maxDecimals = 2): string {
  return `${formatAmount(units, maxDecimals)} ${TOKEN_SYMBOL}`;
}

/**
 * Convierte lo que escribe el usuario ("1.500,5" o "1500.5") a unidades mínimas.
 * Devuelve null si no es un número válido.
 */
export function parseAmount(input: string): bigint | null {
  let s = input.trim().replace(/\s/g, "");
  if (s === "") return null;
  if (getLang() === "en") {
    // Formato en inglés: la coma separa miles y el punto es el decimal.
    s = s.replace(/,/g, "");
  } else if (s.includes(",")) {
    // Formato colombiano: la coma es el decimal y los puntos son miles.
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const [whole, frac = ""] = s.split(".");
  if (frac.length > TOKEN_DECIMALS) return null;
  return BigInt(whole) * SCALE + BigInt(frac.padEnd(TOKEN_DECIMALS, "0") || "0");
}

export function toUnits(whole: number): bigint {
  return BigInt(Math.round(whole)) * SCALE;
}

export function percent(part: bigint, total: bigint): number {
  if (total <= 0n) return 0;
  const p = Number((part * 10000n) / total) / 100;
  return Math.max(0, Math.min(100, p));
}

export function shortAddress(address: string, chars = 4): string {
  if (!address) return "";
  return address.length <= chars * 2 + 1 ? address : `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

export function formatDate(unixSeconds: bigint | number): string {
  const d = new Date(Number(unixSeconds) * 1000);
  return d.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
}

export function daysLeft(unixSeconds: bigint | number): number {
  const ms = Number(unixSeconds) * 1000 - Date.now();
  return Math.ceil(ms / 86_400_000);
}

export function timeLeftLabel(unixSeconds: bigint | number): string {
  if (Number(unixSeconds) * 1000 <= Date.now()) return tr("Cerrada", "Closed");
  const d = daysLeft(unixSeconds);
  if (d === 0) return tr("Cierra hoy", "Closes today");
  if (d === 1) return tr("Queda 1 día", "1 day left");
  return tr(`Quedan ${d} días`, `${d} days left`);
}

export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return tr("hace un momento", "just now");
  if (mins < 60) return tr(`hace ${mins} min`, `${mins} min ago`);
  const hours = Math.round(mins / 60);
  if (hours < 24) return tr(`hace ${hours} h`, `${hours} h ago`);
  const days = Math.round(hours / 24);
  return tr(`hace ${days} ${days === 1 ? "día" : "días"}`, `${days} ${days === 1 ? "day" : "days"} ago`);
}

export const explorer = {
  account: (a: string) => `${EXPLORER_URL}/account/${a}`,
  contract: (c: string) => `${EXPLORER_URL}/contract/${c}`,
  tx: (h: string) => `${EXPLORER_URL}/tx/${h}`,
};

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Unidades mínimas → número de XLM (para conversiones aproximadas, no para montos exactos). */
export function unitsToNumber(units: bigint): number {
  return Number(units) / Number(SCALE);
}

export type Fiat = "COP" | "USD";

/** "$ 58.400 COP" / "US$ 17.60". */
export function formatFiat(value: number, fiat: Fiat): string {
  if (fiat === "COP")
    return `$ ${Math.round(value).toLocaleString(locale(), { maximumFractionDigits: 0 })} COP`;
  return `US$ ${value.toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
