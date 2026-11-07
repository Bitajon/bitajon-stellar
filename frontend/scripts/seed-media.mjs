// Carga contenido de demostración fuera de la cadena (Supabase) para los contratos de PRUEBA:
// portadas, galería, perfiles de fundación, evidencia con archivos y una fundación nueva
// pendiente con RUT. Usa el mismo camino que la página: mensaje firmado + Edge Function.
//   node scripts/seed-media.mjs      (requiere haber corrido seed-demo.mjs)
import { Keypair, Networks, contract } from "@stellar/stellar-sdk";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const STATE = resolve(here, ".demo-state.json");
const MEDIA = resolve(here, "../demo-media");
const S = JSON.parse(readFileSync(STATE, "utf8"));
S.media ??= {};
const save = () => writeFileSync(STATE, JSON.stringify(S, null, 2));
const SUPABASE_URL = "https://vfvsdztgkndeundarbzw.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZmdnNkenRna25kZXVuZGFyYnp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIzNzQ5MDMsImV4cCI6MjEwNzk1MDkwM30.Ac0MK2siEP4-jkNEIu6sF5up6usWeAg1izgxfqxLy78";
const FN = `${SUPABASE_URL}/functions/v1/bitajon`;
const sb = createClient(SUPABASE_URL, ANON, { auth: { persistSession: false } });
const rpcUrl = "https://soroban-testnet.stellar.org";
const networkPassphrase = Networks.TESTNET;
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const sha = (b) => createHash("sha256").update(b).digest();

function auth(role) {
  const kp = Keypair.fromSecret(S.accounts[role].secret);
  const message = `BITAJON auth\naddress:${kp.publicKey()}\nissued:${new Date().toISOString()}\nnonce:${Math.random().toString(16).slice(2)}`;
  const digest = sha(Buffer.concat([Buffer.from("Stellar Signed Message:\n"), Buffer.from(message)]));
  return { address: kp.publicKey(), message, signature: Buffer.from(kp.sign(digest)).toString("base64") };
}
async function call(role, action, body) {
  const r = await fetch(FN, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, action, auth: auth(role) }) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${action}: ${j.error}`);
  return j;
}
const TYPES = { jpg: "image/jpeg", png: "image/png", pdf: "application/pdf" };
async function upload(role, kind, scope, names) {
  const files = names.map((n) => ({ name: n, data: readFileSync(resolve(MEDIA, n)), type: TYPES[n.split(".").pop()] }));
  const { uploads } = await call(role, "upload-urls", { kind, ...scope, files: files.map((f) => ({ name: f.name, type: f.type, size: f.data.length })) });
  for (const [i, u] of uploads.entries()) {
    const { error } = await sb.storage.from(u.bucket).uploadToSignedUrl(u.path, u.token, files[i].data, { contentType: files[i].type });
    if (error) throw error;
  }
  return uploads.map((u, i) => ({ ...files[i], path: u.path }));
}
async function once(key, fn) {
  if (S.media[key]) return;
  await fn();
  S.media[key] = true;
  save();
  log("✔", key);
}

const NP = S.contracts.nonprofit, CR = S.contracts.campaigns;
const signerOf = (role) => ({ publicKey: S.accounts[role].publicKey, ...contract.basicNodeSigner(Keypair.fromSecret(S.accounts[role].secret), networkPassphrase) });
const client = (id, role) => contract.Client.from({ contractId: id, networkPassphrase, rpcUrl, ...signerOf(role) });

// 1. Perfiles públicos de las fundaciones de demo
const PROFILES = {
  fundacion_raices: { display_name: "Fundación Raíces del Sur (demo)", description: "Fundación de demostración. Acompañamos a niños, niñas y adolescentes de Patio Bonito con comedor comunitario, refuerzo escolar y actividades culturales." },
  fundacion_luz: { display_name: "Fundación Luz de Tibabuyes (demo)", description: "Fundación de demostración. Trabajamos con familias de Tibabuyes (Suba) con jornada educativa alterna y mercados para el comedor comunitario." },
};
for (const [role, p] of Object.entries(PROFILES)) await once(`profile_${role}`, () => call(role, "save-nonprofit", { registry: NP, profile: p }));

// 2. Portadas y galerías
const MEDIA_PLAN = [
  { id: 1, owner: "fundacion_raices", cover: "cover-kits.jpg", gallery: [] },
  { id: 2, owner: "fundacion_luz", cover: "cover-navidad.jpg", gallery: [] },
  { id: 3, owner: "fundacion_raices", cover: "cover-fiesta.jpg", gallery: ["cover-kits.jpg"] },
  { id: 4, owner: "fundacion_luz", cover: "cover-comedor.jpg", gallery: [] },
  { id: 5, owner: "fundacion_luz", cover: "cover-refrigerios.jpg", gallery: [] },
];
for (const m of MEDIA_PLAN) {
  await once(`media_${m.id}`, async () => {
    const scope = { registry: CR, campaign_id: m.id };
    const [cover] = await upload(m.owner, "media", scope, [m.cover]);
    const gallery = m.gallery.length ? await upload(m.owner, "media", scope, m.gallery) : [];
    await call(m.owner, "save-campaign", { ...scope, cover_path: cover.path, gallery: gallery.map((g) => g.path) });
  });
}

// 3. Evidencia con archivos para la campaña #3 (en revisión): reemplaza la huella anterior
await once("evidence_3", async () => {
  const scope = { registry: CR, campaign_id: 3 };
  const files = await upload("fundacion_raices", "evidence", scope, ["evid-entrega.jpg", "acta-fiesta-demo.pdf"]);
  const manifestText = JSON.stringify({
    version: 1, campaign_id: 3,
    note: "Datos de demostración. El 30 de octubre celebramos el día del niño con 80 niños y niñas del comedor. Adjuntamos el registro de entrega y el acta.",
    files: files.map((f) => ({ name: f.name, path: f.path, sha256: sha(f.data).toString("hex"), size: f.data.length, type: f.type })),
  });
  const { manifest_sha256 } = await call("fundacion_raices", "save-evidence", { ...scope, manifest_text: manifestText });
  const tx = await (await client(S.contracts.vault, "fundacion_raices")).submit_evidence({ campaign_id: 3n, nonprofit: S.accounts.fundacion_raices.publicKey, evidence_hash: Buffer.from(manifest_sha256, "hex") });
  if (tx.simulation?.error) throw new Error(String(tx.simulation.error).split("\n")[0]);
  await tx.signAndSend({ force: true });
});

// 4. Fundación nueva PENDIENTE con RUT real (para probar la revisión del admin)
if (!S.accounts.fundacion_semillas) {
  const kp = Keypair.random();
  S.accounts.fundacion_semillas = { publicKey: kp.publicKey(), secret: kp.secret() };
  save();
}
await once("fund_semillas", async () => {
  const r = await fetch(`https://friendbot.stellar.org/?addr=${S.accounts.fundacion_semillas.publicKey}`);
  if (!r.ok && r.status !== 400) throw new Error("friendbot");
});
const rut = readFileSync(resolve(MEDIA, "rut-semillas-demo.pdf"));
await once("register_semillas", async () => {
  const tx = await (await client(NP, "fundacion_semillas")).register_nonprofit({
    nonprofit: S.accounts.fundacion_semillas.publicKey,
    profile: { legal_name: "Fundación Semillas de Paz (demo)", tax_id: "900.000.003-3", rut_hash: sha(rut), retention_certificate: false, email: "semillas.demo@bitajon.test", data_consent: true, status: { tag: "Pending", values: undefined } },
  });
  if (tx.simulation?.error && !/#4\)/.test(String(tx.simulation.error))) throw new Error(String(tx.simulation.error).split("\n")[0]);
  if (!tx.simulation?.error) await tx.signAndSend({ force: true });
});
await once("rut_semillas", async () => {
  const [f] = await upload("fundacion_semillas", "rut", { registry: NP }, ["rut-semillas-demo.pdf"]);
  await call("fundacion_semillas", "save-rut", { registry: NP, rut_path: f.path });
});
await once("profile_semillas", () =>
  call("fundacion_semillas", "save-nonprofit", { registry: NP, profile: { display_name: "Fundación Semillas de Paz (demo)", description: "Fundación de demostración pendiente de aprobación. Úsala para probar la revisión del RUT desde el panel de admin." } }),
);
log("LISTO");
