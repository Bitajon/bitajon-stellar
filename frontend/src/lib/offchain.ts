import { createClient } from "@supabase/supabase-js";
import { Buffer } from "buffer";
import { CONTRACTS, EDGE_FUNCTION_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from "../config";
import { bytesToHex } from "./format";

/*
 * Información fuera de la cadena (Supabase): imágenes de campañas, perfil y redes de la
 * fundación, archivos de evidencia y RUT.
 *  - Lectura: pública, con la llave anon (RLS solo permite SELECT).
 *  - Escritura: siempre por la Edge Function "bitajon", que verifica un mensaje firmado
 *    con la wallet y comprueba en los contratos quién es dueño de qué.
 */

/** Error con mensaje ya pensado para el usuario (viene de la Edge Function o de la subida). */
export class BitajonError extends Error {
  name = "BitajonError";
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } });

export const BUCKETS = { media: "bitajon-media", evidence: "bitajon-evidence" } as const;
export const REGISTRY = { nonprofits: CONTRACTS.nonprofitRegistry, campaigns: CONTRACTS.campaignRegistry };

export function publicUrl(bucket: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/* ------------------------------------------------------------------ */
/* Tipos y lecturas                                                    */
/* ------------------------------------------------------------------ */

export type Socials = {
  website?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  tiktok?: string | null;
  x?: string | null;
  whatsapp?: string | null;
};

export type NonprofitMeta = Socials & {
  address: string;
  display_name: string | null;
  description: string | null;
  logo_path: string | null;
};

export type CampaignMeta = { campaign_id: number; cover_path: string | null; gallery: string[] };

export type EvidenceFile = { name: string; path: string; sha256: string; size: number; type: string };
export type EvidenceRecord = {
  campaign_id: number;
  manifest_sha256: string;
  manifest_text: string | null;
  manifest: { version?: number; campaign_id: number; kind?: string; note?: string; files: EvidenceFile[] };
  created_at: string;
};

export async function listCampaignMeta(): Promise<Map<string, CampaignMeta>> {
  const { data, error } = await supabase
    .from("bitajon_campaign_meta")
    .select("campaign_id, cover_path, gallery")
    .eq("registry", REGISTRY.campaigns);
  if (error) throw error;
  return new Map((data ?? []).map((r) => [String(r.campaign_id), r as CampaignMeta]));
}

export async function getNonprofitMeta(address: string): Promise<NonprofitMeta | null> {
  const { data, error } = await supabase
    .from("bitajon_nonprofit_meta")
    .select("address, display_name, description, logo_path, website, instagram, facebook, tiktok, x, whatsapp")
    .eq("registry", REGISTRY.nonprofits)
    .eq("address", address)
    .maybeSingle();
  if (error) throw error;
  return (data as NonprofitMeta) ?? null;
}

export async function getEvidenceRecords(campaignId: bigint): Promise<EvidenceRecord[]> {
  const { data, error } = await supabase
    .from("bitajon_evidence")
    .select("campaign_id, manifest_sha256, manifest_text, manifest, created_at")
    .eq("registry", REGISTRY.campaigns)
    .eq("campaign_id", Number(campaignId))
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as EvidenceRecord[];
}

/* ------------------------------------------------------------------ */
/* Sesión firmada con la wallet                                         */
/* ------------------------------------------------------------------ */

export type MessageSigner = { address: string; signMessage: (message: string) => Promise<string> };
type Auth = { address: string; message: string; signature: string };

const SESSION_MS = 25 * 60 * 1000; // la función acepta 30 min
const sessions = new Map<string, { auth: Auth; at: number }>();

/** Pide UNA firma a la wallet y la reutiliza ~25 minutos para todas las subidas. */
async function authFor(signer: MessageSigner): Promise<Auth> {
  const cached = sessions.get(signer.address);
  if (cached && Date.now() - cached.at < SESSION_MS) return cached.auth;
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
  const message = `BITAJON auth\naddress:${signer.address}\nissued:${new Date().toISOString()}\nnonce:${nonce}`;
  const signature = await signer.signMessage(message);
  const auth = { address: signer.address, message, signature };
  sessions.set(signer.address, { auth, at: Date.now() });
  return auth;
}

async function call<T>(signer: MessageSigner, action: string, body: Record<string, unknown>): Promise<T> {
  const send = async () =>
    fetch(EDGE_FUNCTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ ...body, action, auth: await authFor(signer) }),
    });
  let res = await send();
  if (res.status === 401) {
    // Firma vencida o rechazada: se pide una nueva una sola vez.
    sessions.delete(signer.address);
    res = await send();
  }
  const json = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new BitajonError(json.error || `Error ${res.status} al guardar en BITAJÓN`);
  return json;
}

/* ------------------------------------------------------------------ */
/* Archivos                                                            */
/* ------------------------------------------------------------------ */

/** Reduce imágenes grandes antes de subirlas (máx. 1920 px, JPEG). Las demás se devuelven igual. */
export async function prepareImage(file: File, maxSide = 1920): Promise<File> {
  if (!file.type.startsWith("image/") || file.type === "image/gif") return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1_500_000) return file;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

type UploadKind = "media" | "evidence" | "logo" | "rut";
type Uploaded = { path: string; bucket: string };

async function uploadFiles(
  signer: MessageSigner,
  kind: UploadKind,
  files: File[],
  scope: { registry: string; campaign_id?: number; address?: string },
): Promise<Uploaded[]> {
  if (files.length === 0) return [];
  const { uploads } = await call<{ uploads: { path: string; token: string; bucket: string }[] }>(signer, "upload-urls", {
    kind,
    ...scope,
    files: files.map((f) => ({ name: f.name, type: f.type, size: f.size })),
  });
  await Promise.all(
    uploads.map(async (u, i) => {
      const { error } = await supabase.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, files[i], { contentType: files[i].type });
      if (error) throw new BitajonError(`No se pudo subir ${files[i].name}: ${error.message}`);
    }),
  );
  return uploads.map((u) => ({ path: u.path, bucket: u.bucket }));
}

/** Portada + galería de una campaña. `keep` conserva imágenes ya subidas. */
export async function saveCampaignMedia(
  signer: MessageSigner,
  campaignId: bigint,
  opts: { cover?: File | null; keepCover?: string | null; gallery?: File[]; keepGallery?: string[] },
) {
  const id = Number(campaignId);
  const scope = { registry: REGISTRY.campaigns, campaign_id: id };
  const cover = opts.cover ? (await uploadFiles(signer, "media", [await prepareImage(opts.cover)], scope))[0].path : (opts.keepCover ?? null);
  const fresh = await uploadFiles(signer, "media", await Promise.all((opts.gallery ?? []).map((f) => prepareImage(f))), scope);
  const gallery = [...(opts.keepGallery ?? []), ...fresh.map((u) => u.path)].slice(0, 12);
  await call(signer, "save-campaign", { ...scope, cover_path: cover, gallery });
}

export type NonprofitProfileInput = Socials & { display_name?: string; description?: string; logo?: File | null; keepLogo?: string | null };

/** `target`: fundación a editar (por defecto la propia; el admin puede editar cualquiera). */
export async function saveNonprofitProfile(signer: MessageSigner, p: NonprofitProfileInput, target?: string) {
  const scope = { registry: REGISTRY.nonprofits, ...(target ? { address: target } : {}) };
  const logo = p.logo ? (await uploadFiles(signer, "logo", [await prepareImage(p.logo, 600)], scope))[0].path : (p.keepLogo ?? null);
  const { logo: _l, keepLogo: _k, ...rest } = p;
  await call(signer, "save-nonprofit", { ...scope, profile: { ...rest, logo_path: logo } });
}

/** Sube el RUT al bucket privado. Solo el admin puede verlo después. */
export async function saveRut(signer: MessageSigner, file: File) {
  const scope = { registry: REGISTRY.nonprofits };
  const [u] = await uploadFiles(signer, "rut", [file], scope);
  return call<{ rut_sha256: string }>(signer, "save-rut", { ...scope, rut_path: u.path });
}

export async function getRutUrl(signer: MessageSigner, nonprofit: string) {
  return call<{ url: string | null; rut_sha256?: string }>(signer, "rut-url", { registry: REGISTRY.nonprofits, address: nonprofit });
}

async function sha256HexOf(data: ArrayBuffer | Uint8Array): Promise<string> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource)));
}

/**
 * Sube los archivos de evidencia y arma un manifiesto con la huella de cada uno.
 * La huella del manifiesto es la que se registra on-chain con submit_evidence,
 * así un solo hash en la cadena protege todos los archivos.
 */
export async function uploadEvidence(signer: MessageSigner, campaignId: bigint, files: File[], note: string): Promise<Buffer> {
  const id = Number(campaignId);
  const scope = { registry: REGISTRY.campaigns, campaign_id: id };
  const uploaded = await uploadFiles(signer, "evidence", files, scope);
  const entries: EvidenceFile[] = await Promise.all(
    files.map(async (f, i) => ({
      name: f.name,
      path: uploaded[i].path,
      sha256: await sha256HexOf(await f.arrayBuffer()),
      size: f.size,
      type: f.type,
    })),
  );
  const manifestText = JSON.stringify({ version: 1, campaign_id: id, note: note.trim() || undefined, files: entries });
  const res = await call<{ manifest_sha256: string }>(signer, "save-evidence", { ...scope, manifest_text: manifestText });
  return Buffer.from(res.manifest_sha256, "hex");
}

/** Comprueba una evidencia publicada: manifiesto contra la huella on-chain y cada archivo contra el manifiesto. */
export async function verifyEvidence(record: EvidenceRecord, onChainHex: string) {
  const manifestOk =
    record.manifest.kind === "file"
      ? record.manifest_sha256 === onChainHex
      : Boolean(record.manifest_text) && (await sha256HexOf(new TextEncoder().encode(record.manifest_text!))) === onChainHex;
  const files = await Promise.all(
    record.manifest.files.map(async (f) => {
      try {
        const res = await fetch(publicUrl(BUCKETS.evidence, f.path)!);
        if (!res.ok) return { ...f, ok: false };
        return { ...f, ok: (await sha256HexOf(await res.arrayBuffer())) === f.sha256 };
      } catch {
        return { ...f, ok: false };
      }
    }),
  );
  return { manifestOk, files, allOk: manifestOk && files.every((f) => f.ok) };
}
