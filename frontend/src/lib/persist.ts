import { dehydrate, hydrate, type QueryClient } from "@tanstack/react-query";
import { Buffer } from "buffer";
import { CONTRACTS } from "../config";

/*
 * Caché local: guarda en el navegador lo último que se leyó (campañas, perfiles, eventos,
 * fotos) para que al volver a abrir la página se vea al instante. Luego se actualiza solo
 * en segundo plano. Es solo una comodidad: si el navegador no deja guardar, no pasa nada.
 */
const KEY = `bitajon-cache:v2:${CONTRACTS.campaignRegistry}`;
const MAX_AGE = 24 * 60 * 60 * 1000;
const PERSISTED = new Set(["campaigns", "campaign", "profile", "fee", "events", "campaign-meta", "nonprofit-meta", "evidence"]);

// JSON no sabe guardar bigint ni bytes: se marcan para poder reconstruirlos.
function replacer(this: Record<string, unknown>, key: string, value: unknown) {
  const raw = this[key];
  if (typeof raw === "bigint") return { $big: raw.toString() };
  if (raw instanceof Uint8Array) return { $u8: Buffer.from(raw).toString("hex") };
  if (raw instanceof Map) return { $map: [...raw.entries()] };
  return value;
}
function reviver(_k: string, v: unknown) {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (typeof o.$big === "string" && Object.keys(o).length === 1) return BigInt(o.$big);
    if (typeof o.$u8 === "string" && Object.keys(o).length === 1) return Buffer.from(o.$u8, "hex");
    if (Array.isArray(o.$map) && Object.keys(o).length === 1) return new Map(o.$map as [unknown, unknown][]);
  }
  return v;
}

export function restoreCache(qc: QueryClient) {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return;
    const saved = JSON.parse(raw, reviver) as { at: number; state: unknown };
    if (Date.now() - saved.at > MAX_AGE) return localStorage.removeItem(KEY);
    hydrate(qc, saved.state as Parameters<typeof hydrate>[1]);
  } catch {
    /* caché dañada o sin acceso: se ignora */
  }
}

export function persistCache(qc: QueryClient) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const save = () => {
    try {
      const state = dehydrate(qc, {
        shouldDehydrateQuery: (q) => q.state.status === "success" && PERSISTED.has(String(q.queryKey[0])),
      });
      localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), state }, replacer));
    } catch {
      /* sin espacio o sin acceso */
    }
  };
  qc.getQueryCache().subscribe(() => {
    clearTimeout(timer);
    timer = setTimeout(save, 1000);
  });
}
