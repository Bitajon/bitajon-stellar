import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { CONTRACTS } from "../config";
import { asBigInt, asString, fetchEvents, fetchIndexedEvents, isEvent, syncIndexedEvents, type ChainEvent } from "../lib/events";
import { getNativeBalance } from "../lib/horizon";
import { getEvidenceRecords, getNonprofitMeta, getTeamInfo, listCampaignMeta } from "../lib/offchain";
import { getCampaignView, getFeeBps, getProfile, listCampaigns, quote } from "../lib/stellar";

export const qk = {
  campaigns: ["campaigns"] as const,
  campaign: (id: string) => ["campaign", id] as const,
  profile: (addr: string) => ["profile", addr] as const,
  fee: ["fee"] as const,
  quote: (gross: string) => ["quote", gross] as const,
  events: ["events"] as const,
  balance: (addr: string) => ["balance", addr] as const,
  campaignMeta: ["campaign-meta"] as const,
  nonprofitMeta: (addr: string) => ["nonprofit-meta", addr] as const,
  evidence: (id: string) => ["evidence", id] as const,
};

/* ---------- Fuera de la cadena (Supabase) ---------- */

/** Portadas y galerías de todas las campañas. Si Supabase falla, la app sigue con las portadas generadas. */
export function useCampaignMetaMap() {
  return useQuery({ queryKey: qk.campaignMeta, queryFn: listCampaignMeta, staleTime: 30_000, retry: 1 });
}

export function useNonprofitMeta(address: string | null | undefined) {
  return useQuery({
    queryKey: qk.nonprofitMeta(address ?? ""),
    queryFn: () => getNonprofitMeta(address as string),
    enabled: Boolean(address),
    staleTime: 30_000,
  });
}

export function useEvidenceRecords(id: bigint | null, enabled = true) {
  return useQuery({
    queryKey: qk.evidence(String(id)),
    queryFn: () => getEvidenceRecords(id as bigint),
    enabled: enabled && id !== null,
    staleTime: 30_000,
  });
}

export function useCampaigns() {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.campaigns,
    queryFn: async () => {
      // Cuántas campañas hay según los eventos indexados (rápido); si falla, se busca a ciegas.
      const events = await qc.fetchQuery({ queryKey: qk.events, queryFn: loadEvents, staleTime: 20_000 }).catch(() => []);
      const known = events.filter((e) => isEvent(e, "CampaignCreated")).length;
      const list = await listCampaigns(known);
      // Cada campaña queda lista en caché: abrir su detalle es inmediato.
      for (const v of list) qc.setQueryData(qk.campaign(String(v.id)), v);
      return list;
    },
    staleTime: 15_000,
  });
}

export function useCampaign(id: bigint | null) {
  return useQuery({
    queryKey: qk.campaign(String(id)),
    queryFn: () => getCampaignView(id as bigint),
    enabled: id !== null,
    staleTime: 10_000,
  });
}

export function useProfile(address: string | null | undefined) {
  return useQuery({
    queryKey: qk.profile(address ?? ""),
    queryFn: () => getProfile(address as string),
    enabled: Boolean(address),
    staleTime: 30_000,
  });
}

export function useFeeBps() {
  return useQuery({ queryKey: qk.fee, queryFn: getFeeBps, staleTime: 60_000 });
}

export function useQuote(gross: bigint | null) {
  return useQuery({
    queryKey: qk.quote(String(gross)),
    queryFn: () => quote(gross as bigint),
    enabled: gross !== null && gross > 0n,
    staleTime: 30_000,
  });
}

/** Cuenta del equipo de BITAJÓN: verificadora de las bóvedas y firmante del admin multisig. */
export function useTeamInfo() {
  return useQuery({ queryKey: ["team-info"], queryFn: getTeamInfo, staleTime: 60_000 });
}

export function useBalance(address: string | null) {
  return useQuery({
    queryKey: qk.balance(address ?? ""),
    queryFn: () => getNativeBalance(address as string),
    enabled: Boolean(address),
    staleTime: 10_000,
  });
}

const DEPLOYMENT = CONTRACTS.campaignRegistry;

async function loadEvents(): Promise<ChainEvent[]> {
  try {
    const indexed = await fetchIndexedEvents(DEPLOYMENT);
    if (indexed) return indexed;
  } catch {
    /* se cae a la red */
  }
  return fetchEvents(Object.values(CONTRACTS));
}
let lastSync = 0;

/** Pide al índice que se ponga al día con la red; si llegó algo nuevo, refresca los eventos. */
export async function syncEventsIndex(qc: ReturnType<typeof useQueryClient>, force = false) {
  if (!force && Date.now() - lastSync < 15_000) return;
  lastSync = Date.now();
  try {
    if ((await syncIndexedEvents(DEPLOYMENT)) > 0) await qc.invalidateQueries({ queryKey: qk.events });
  } catch {
    /* el índice es una optimización: si falla, se sigue con lo que hay */
  }
}

/**
 * Eventos de los 4 contratos (una sola consulta compartida por toda la app).
 * Se leen del índice en Supabase (rápido y con historial completo) y, en segundo plano,
 * se le pide al índice que traiga lo nuevo de la red. Si el índice no responde, se lee la red.
 */
export function useEvents() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: qk.events, queryFn: loadEvents, staleTime: 20_000 });
  useEffect(() => {
    void syncEventsIndex(qc);
  }, [qc]);
  return q;
}

export type Donation = {
  campaignId: bigint;
  donor: string;
  gross: bigint;
  fee: bigint;
  net: bigint;
  at: string;
  txHash: string;
};

export type Milestone = {
  campaignId: bigint;
  kind: "created" | "vault" | "initial" | "evidence" | "final" | "cancelled" | "paused" | "unpaused";
  amount?: bigint;
  at: string;
  txHash: string;
};

/** Donaciones: se leen del evento DonationRouted (bruto, fee y neto). */
export function donationsFrom(events: ChainEvent[] | undefined): Donation[] {
  return (events ?? [])
    .filter((e) => isEvent(e, "DonationRouted"))
    .map((e) => ({
      campaignId: asBigInt(e.topics[1] ?? e.data.campaign_id),
      donor: asString(e.data.donor ?? e.topics[2]),
      gross: asBigInt(e.data.gross_amount),
      fee: asBigInt(e.data.fee_amount),
      net: asBigInt(e.data.net_amount),
      at: e.closedAt,
      txHash: e.txHash,
    }))
    .sort((a, b) => b.at.localeCompare(a.at));
}

const MILESTONE_EVENTS: [string, Milestone["kind"]][] = [
  ["CampaignCreated", "created"],
  ["VaultCreated", "vault"],
  ["InitialFundsReleased", "initial"],
  ["EvidenceSubmitted", "evidence"],
  ["FinalFundsReleased", "final"],
  ["CampaignCancelled", "cancelled"],
  ["VaultPaused", "paused"],
  ["VaultUnpaused", "unpaused"],
];

export function milestonesFrom(events: ChainEvent[] | undefined, campaignId: bigint): Milestone[] {
  const out: Milestone[] = [];
  for (const e of events ?? []) {
    const match = MILESTONE_EVENTS.find(([name]) => isEvent(e, name));
    if (!match) continue;
    const id = asBigInt(e.topics[1] ?? e.data.campaign_id);
    if (id !== campaignId) continue;
    out.push({
      campaignId: id,
      kind: match[1],
      amount: e.data.amount !== undefined ? asBigInt(e.data.amount) : undefined,
      at: e.closedAt,
      txHash: e.txHash,
    });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}

export type Refund = { campaignId: bigint; donor: string; amount: bigint; at: string; txHash: string };

export function refundsFrom(events: ChainEvent[] | undefined): Refund[] {
  return (events ?? [])
    .filter((e) => isEvent(e, "RefundClaimed"))
    .map((e) => ({
      campaignId: asBigInt(e.topics[1] ?? e.data.campaign_id),
      donor: asString(e.data.donor),
      amount: asBigInt(e.data.amount),
      at: e.closedAt,
      txHash: e.txHash,
    }));
}

export type RegisteredNonprofit = { address: string; legalName: string; at: string };

export function registeredNonprofitsFrom(events: ChainEvent[] | undefined): RegisteredNonprofit[] {
  const seen = new Map<string, RegisteredNonprofit>();
  for (const e of events ?? []) {
    if (!isEvent(e, "NonprofitRegistered")) continue;
    const address = asString(e.topics[1] ?? e.data.nonprofit);
    if (!address) continue;
    seen.set(address, { address, legalName: asString(e.data.legal_name), at: e.closedAt });
  }
  return [...seen.values()].sort((a, b) => b.at.localeCompare(a.at));
}

/** Refresca todo lo que puede cambiar después de una transacción. */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(
    async (campaignId?: bigint) => {
      void syncEventsIndex(qc, true);
      const tasks = [
        qc.invalidateQueries({ queryKey: qk.campaigns }),
        qc.invalidateQueries({ queryKey: qk.events }),
        qc.invalidateQueries({ queryKey: ["profile"] }),
        qc.invalidateQueries({ queryKey: ["balance"] }),
        qc.invalidateQueries({ queryKey: qk.campaignMeta }),
        qc.invalidateQueries({ queryKey: ["nonprofit-meta"] }),
        qc.invalidateQueries({ queryKey: ["evidence"] }),
        qc.invalidateQueries({ queryKey: ["team-info"] }),
      ];
      if (campaignId !== undefined) tasks.push(qc.invalidateQueries({ queryKey: qk.campaign(String(campaignId)) }));
      await Promise.all(tasks);
    },
    [qc],
  );
}
