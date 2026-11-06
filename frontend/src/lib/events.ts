import { rpc, scValToNative, xdr } from "@stellar/stellar-sdk";
import { RPC_URL } from "../config";

const server = new rpc.Server(RPC_URL);

/**
 * El RPC público de testnet solo guarda eventos de los últimos días (ventana de retención).
 * Por eso el historial que se arma con eventos es "reciente", no completo.
 */
const LOOKBACK_LEDGERS = 120_000; // ~7 días a ~5 s por ledger (la retención de testnet es ~120.960)

export type ChainEvent = {
  id: string;
  /** Nombre normalizado: minúsculas sin guiones bajos, p. ej. "donationdeposited". */
  name: string;
  topics: unknown[];
  data: Record<string, unknown>;
  ledger: number;
  closedAt: string;
  txHash: string;
  contractId: string;
};

function normalizeName(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[_\s-]/g, "");
}

function contractIdOf(e: { contractId?: unknown }): string {
  const c = e.contractId as unknown;
  if (!c) return "";
  if (typeof c === "string") return c;
  if (typeof c === "object" && c && "contractId" in c && typeof (c as { contractId: unknown }).contractId === "function")
    return (c as { contractId: () => string }).contractId();
  return String(c);
}

function toNative(v: unknown): unknown {
  // En el SDK 17 cada tipo es su propia clase (ScValSymbol, ScValU64…), así que no se usa instanceof.
  if (v == null || typeof v !== "object") return v;
  try {
    return scValToNative(v as xdr.ScVal);
  } catch {
    return undefined;
  }
}

function parse(e: rpc.Api.EventResponse): ChainEvent {
  const topicVals = (e.topic ?? []).map(toNative);
  const value = toNative(e.value);
  const data =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : { value };
  return {
    id: e.id,
    name: normalizeName(topicVals[0]),
    topics: topicVals,
    data,
    ledger: e.ledger,
    closedAt: e.ledgerClosedAt,
    txHash: e.txHash ?? "",
    contractId: contractIdOf(e as unknown as { contractId?: unknown }),
  };
}

async function firstPage(contractIds: string[], limit: number) {
  const latest = await server.getLatestLedger();
  let startLedger = Math.max(1, latest.sequence - LOOKBACK_LEDGERS);
  const filters = [{ type: "contract" as const, contractIds }];
  try {
    return await server.getEvents({ startLedger, filters, limit });
  } catch (err) {
    // "startLedger must be within the ledger range: A - B" → se reintenta desde A.
    const m = String((err as Error)?.message ?? err).match(/range:?\s*(\d+)\s*-\s*(\d+)/i);
    if (!m) throw err;
    startLedger = Number(m[1]) + 1;
    return server.getEvents({ startLedger, filters, limit });
  }
}

/** Ledger al que apunta un cursor de getEvents ("<toid>-<n>"; el ledger va en los 32 bits altos). */
function cursorLedger(cursor: string): number {
  try {
    return Number(BigInt(cursor.split("-")[0]) >> 32n);
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

/**
 * Trae los eventos recientes de uno o varios contratos (máx. 5 contratos por filtro).
 * El RPC revisa los ledgers por tramos: una página puede venir vacía con un cursor
 * para seguir, así que se continúa hasta alcanzar el último ledger.
 */
export async function fetchEvents(contractIds: string[], maxPages = 40): Promise<ChainEvent[]> {
  const limit = 200;
  const filters = [{ type: "contract" as const, contractIds }];
  const out: ChainEvent[] = [];
  let page = await firstPage(contractIds, limit);
  for (let i = 0; i < maxPages; i++) {
    out.push(...page.events.map(parse));
    const reachedEnd = !page.cursor || cursorLedger(page.cursor) >= page.latestLedger;
    if (reachedEnd && page.events.length < limit) break;
    page = await server.getEvents({ cursor: page.cursor, filters, limit });
  }
  return out;
}

export function isEvent(e: ChainEvent, structName: string): boolean {
  return e.name === normalizeName(structName);
}

export function asBigInt(v: unknown): bigint {
  if (typeof v === "bigint") return v;
  if (typeof v === "number") return BigInt(Math.trunc(v));
  if (typeof v === "string" && /^-?\d+$/.test(v)) return BigInt(v);
  return 0n;
}

export function asString(v: unknown): string {
  return typeof v === "string" ? v : v == null ? "" : String(v);
}

/* ------------------------------------------------------------------ */
/* Índice en Supabase                                                   */
/* ------------------------------------------------------------------ */
// La Edge Function copia los eventos de la red en la tabla bitajon_events. Leer de ahí
// toma milisegundos (en vez de recorrer la red por páginas) y además conserva el
// historial completo, aunque la red pública solo guarde los últimos ~7 días.

type EventRow = { id: string; contract_id: string; name: string; topics: unknown[]; data: Record<string, unknown>; ledger: number; closed_at: string; tx_hash: string };

async function supa() {
  return (await import("./offchain")).supabase;
}

/** Lee los eventos indexados. Devuelve null si el índice aún no tiene nada para este despliegue. */
export async function fetchIndexedEvents(deployment: string): Promise<ChainEvent[] | null> {
  const db = await supa();
  const out: ChainEvent[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("bitajon_events")
      .select("id, contract_id, name, topics, data, ledger, closed_at, tx_hash")
      .eq("deployment", deployment)
      .order("ledger", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    for (const r of (data ?? []) as EventRow[])
      out.push({ id: r.id, name: r.name, topics: r.topics, data: r.data, ledger: r.ledger, closedAt: new Date(r.closed_at).toISOString(), txHash: r.tx_hash, contractId: r.contract_id });
    if (!data || data.length < pageSize) break;
  }
  if (out.length === 0) {
    const { data } = await db.from("bitajon_sync").select("deployment").eq("deployment", deployment).maybeSingle();
    if (!data) return null; // nunca se ha sincronizado
  }
  return out;
}

/** Pide a la Edge Function que traiga de la red los eventos nuevos. Devuelve cuántos agregó. */
export async function syncIndexedEvents(deployment: string): Promise<number> {
  const { EDGE_FUNCTION_URL, SUPABASE_ANON_KEY } = await import("../config");
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    body: JSON.stringify({ action: "sync-events", deployment }),
  });
  if (!res.ok) throw new Error(`sync-events ${res.status}`);
  const j = (await res.json()) as { inserted?: number };
  return j.inserted ?? 0;
}
