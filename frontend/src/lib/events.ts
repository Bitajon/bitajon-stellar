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
  try {
    return v instanceof xdr.ScVal ? scValToNative(v as unknown as xdr.ScVal) : v;
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

/** Trae los eventos recientes de uno o varios contratos (máx. 5 contratos por filtro). */
export async function fetchEvents(contractIds: string[], maxPages = 10): Promise<ChainEvent[]> {
  const limit = 200;
  const filters = [{ type: "contract" as const, contractIds }];
  const out: ChainEvent[] = [];
  let page = await firstPage(contractIds, limit);
  for (let i = 0; i < maxPages; i++) {
    out.push(...page.events.map(parse));
    if (page.events.length < limit || !page.cursor) break;
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
