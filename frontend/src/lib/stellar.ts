import type { AssembledTransaction, SignTransaction } from "@stellar/stellar-sdk/contract";
import { Buffer } from "buffer";
import { CONTRACTS, MILESTONE_PERCENTAGE, NETWORK_PASSPHRASE, RPC_URL, TOKEN_ADDRESS } from "../config";
import { Client as CampaignClient, type Campaign } from "../contracts/campaign-registry";
import { Client as VaultClient, type VaultState } from "../contracts/campaign-vault";
import { Client as RouterClient, type QuoteResult } from "../contracts/donation-router";
import { Client as NonprofitClient, type NonprofitProfile } from "../contracts/nonprofit-registry";
import { isNotFound } from "./errors";

export type { Campaign, VaultState, NonprofitProfile, QuoteResult };

export type Signer = { address: string; signTransaction: SignTransaction };

const base = { networkPassphrase: NETWORK_PASSPHRASE, rpcUrl: RPC_URL };

function makeClients(signer?: Signer) {
  const auth = signer ? { publicKey: signer.address, signTransaction: signer.signTransaction } : {};
  return {
    nonprofits: new NonprofitClient({ ...base, ...auth, contractId: CONTRACTS.nonprofitRegistry }),
    campaigns: new CampaignClient({ ...base, ...auth, contractId: CONTRACTS.campaignRegistry }),
    vault: new VaultClient({ ...base, ...auth, contractId: CONTRACTS.campaignVault }),
    router: new RouterClient({ ...base, ...auth, contractId: CONTRACTS.donationRouter }),
  };
}

// Clientes de solo lectura: simulan sin cuenta, no piden firma.
const readers = makeClients();

/* ------------------------------------------------------------------ */
/* Ayudantes                                                            */
/* ------------------------------------------------------------------ */

function unwrap<T>(value: T): T {
  // Defensa: si el SDK devolviera un Err en vez de lanzar, lo convertimos en excepción.
  if (value && typeof value === "object" && "isErr" in value && typeof (value as { isErr: unknown }).isErr === "function") {
    const r = value as unknown as { isErr: () => boolean; unwrap: () => T; unwrapErr: () => unknown };
    if (r.isErr()) throw new Error(`Error(Contract, #${String((r.unwrapErr() as { code?: number })?.code ?? "?")})`);
    return r.unwrap();
  }
  return value;
}

/**
 * Si la simulación falló, el código real del contrato ("Error(Contract, #N)") solo está
 * en `tx.simulation.error`; el SDK devuelve un Err vacío. Lo convertimos en excepción.
 */
function throwIfSimulationFailed(tx: AssembledTransaction<unknown>) {
  const sim = (tx as unknown as { simulation?: { error?: unknown } }).simulation;
  if (sim && typeof sim === "object" && "error" in sim && sim.error) throw new Error(String(sim.error));
}

async function read<T>(call: Promise<AssembledTransaction<T>>): Promise<T> {
  const tx = await call;
  throwIfSimulationFailed(tx);
  return unwrap(tx.result);
}

export type TxResult<T> = { result: T; hash: string };

async function send<T>(call: Promise<AssembledTransaction<T>>): Promise<TxResult<T>> {
  const tx = await call;
  // Se valida antes de abrir Freighter, para no pedir una firma que el contrato va a rechazar.
  throwIfSimulationFailed(tx);
  // force: algunas llamadas (p. ej. aprobar una fundación ya aprobada) no escriben nada,
  // pero igual queremos enviarlas y obtener el hash.
  const sent = await tx.signAndSend({ force: true });
  const s = sent as unknown as {
    sendTransactionResponse?: { hash?: string };
    getTransactionResponse?: { txHash?: string };
  };
  const hash = s.getTransactionResponse?.txHash ?? s.sendTransactionResponse?.hash ?? "";
  return { result: unwrap(sent.result), hash };
}

/* ------------------------------------------------------------------ */
/* Lecturas                                                             */
/* ------------------------------------------------------------------ */

export async function getCampaign(id: bigint): Promise<Campaign | null> {
  try {
    return await read(readers.campaigns.get_campaign({ campaign_id: id }));
  } catch (e) {
    if (isNotFound(e, 5)) return null;
    throw e;
  }
}

export async function getVault(id: bigint): Promise<VaultState | null> {
  try {
    return await read(readers.vault.get_vault({ campaign_id: id }));
  } catch (e) {
    if (isNotFound(e, 5)) return null;
    throw e;
  }
}

export async function getProfile(address: string): Promise<NonprofitProfile | null> {
  try {
    return await read(readers.nonprofits.get_profile({ nonprofit: address }));
  } catch (e) {
    if (isNotFound(e, 2)) return null;
    throw e;
  }
}

export function quote(gross: bigint): Promise<QuoteResult> {
  return read(readers.router.quote({ gross_amount: gross }));
}

export async function getFeeBps(): Promise<number> {
  return Number(await read(readers.router.get_fee_bps()));
}

export function getTreasury(): Promise<string> {
  return read(readers.router.get_treasury());
}

export type CampaignView = {
  id: bigint;
  campaign: Campaign;
  vault: VaultState | null;
};

export async function getCampaignView(id: bigint): Promise<CampaignView | null> {
  const campaign = await getCampaign(id);
  if (!campaign) return null;
  const vault = await getVault(id);
  return { id, campaign, vault };
}

/**
 * Los contratos no tienen una función para listar campañas, pero los IDs son
 * consecutivos desde 1. Se consultan en lotes hasta encontrar el primero que no existe.
 */
export async function listCampaigns(max = 200): Promise<CampaignView[]> {
  const out: CampaignView[] = [];
  const batch = 6;
  for (let start = 1; start <= max; start += batch) {
    const ids = Array.from({ length: batch }, (_, i) => BigInt(start + i));
    const views = await Promise.all(ids.map((id) => getCampaignView(id)));
    let ended = false;
    for (const v of views) {
      if (!v) {
        ended = true;
        break;
      }
      out.push(v);
    }
    if (ended) break;
  }
  return out;
}

/** Monto bruto necesario para que a la bóveda lleguen `net` unidades con el fee actual. */
export function grossForNet(net: bigint, feeBps: number): bigint {
  if (feeBps <= 0) return net;
  const denom = 10_000n - BigInt(feeBps);
  return (net * 10_000n + denom - 1n) / denom;
}

/* ------------------------------------------------------------------ */
/* Escrituras (requieren firma en Freighter)                            */
/* ------------------------------------------------------------------ */

export type NewNonprofit = {
  legalName: string;
  taxId: string;
  rutHash: Buffer;
  retentionCertificate: boolean;
  email: string;
  dataConsent: boolean;
};

export function registerNonprofit(signer: Signer, p: NewNonprofit) {
  const profile: NonprofitProfile = {
    legal_name: p.legalName,
    tax_id: p.taxId,
    rut_hash: p.rutHash,
    retention_certificate: p.retentionCertificate,
    email: p.email,
    data_consent: p.dataConsent,
    // El contrato fuerza Pending sin importar lo que se envíe.
    status: { tag: "Pending", values: undefined },
  };
  return send(makeClients(signer).nonprofits.register_nonprofit({ nonprofit: signer.address, profile }));
}

export function approveNonprofit(signer: Signer, nonprofit: string) {
  return send(makeClients(signer).nonprofits.approve_nonprofit({ admin: signer.address, nonprofit }));
}

export function revokeNonprofit(signer: Signer, nonprofit: string) {
  return send(makeClients(signer).nonprofits.revoke_nonprofit({ admin: signer.address, nonprofit }));
}

export type NewCampaign = {
  name: string;
  description: string;
  location: string;
  targetAmount: bigint;
  deadline: bigint;
};

export function createCampaign(signer: Signer, c: NewCampaign) {
  return send(
    makeClients(signer).campaigns.create_campaign({
      nonprofit: signer.address,
      name: c.name,
      description: c.description,
      location: c.location,
      target_amount: c.targetAmount,
      token_address: TOKEN_ADDRESS,
      deadline: c.deadline,
      milestone_percentage: MILESTONE_PERCENTAGE,
    }),
  );
}

export function createVault(signer: Signer, campaignId: bigint) {
  return send(makeClients(signer).vault.create_vault({ campaign_id: campaignId, nonprofit: signer.address }));
}

export function cancelCampaign(signer: Signer, campaignId: bigint) {
  return send(makeClients(signer).campaigns.cancel_campaign({ nonprofit: signer.address, campaign_id: campaignId }));
}

/** Siempre por el router: un depósito directo a la bóveda falla si el router está configurado. */
export function donate(signer: Signer, campaignId: bigint, gross: bigint) {
  return send(makeClients(signer).router.donate({ campaign_id: campaignId, donor: signer.address, amount: gross }));
}

export function submitEvidence(signer: Signer, campaignId: bigint, evidenceHash: Buffer) {
  return send(
    makeClients(signer).vault.submit_evidence({
      campaign_id: campaignId,
      nonprofit: signer.address,
      evidence_hash: evidenceHash,
    }),
  );
}

export function releaseFinal(signer: Signer, campaignId: bigint) {
  return send(makeClients(signer).vault.release_final({ campaign_id: campaignId, admin: signer.address }));
}
