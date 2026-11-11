import { StrKey } from "@stellar/stellar-sdk";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck,
  Ban,
  Building2,
  FileCheck2,
  FileLock2,
  ImageIcon,
  KeyRound,
  Mail,
  Pause,
  Pencil,
  Play,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { EvidencePanel } from "../components/EvidencePanel";
import { NonprofitLogo, SocialLinks } from "../components/Nonprofit";
import { RequireWallet } from "../components/RequireWallet";
import { AddressLink, CopyButton, EmptyState, PageHeader, Spinner, StageBadge } from "../components/ui";
import { GOVERNANCE_ID } from "../config";
import { registeredNonprofitsFrom, useCampaignMetaMap, useCampaigns, useEvents, useFeeBps, useNonprofitMeta, useProfile, useRefreshAll, useTeamInfo } from "../hooks/queries";
import { Money } from "../lib/currency";
import { friendlyError } from "../lib/errors";
import { explorer, relativeTime } from "../lib/format";
import { toHex } from "../lib/hash";
import { tr } from "../lib/i18n";
import { adminAction, BUCKETS, getNonprofitPrivate, listAdmins, publicUrl, type AdminOp } from "../lib/offchain";
import { milestoneOf, stageOf } from "../lib/status";
import { getTreasury, type CampaignView } from "../lib/stellar";
import { useWallet } from "../lib/wallet";
import { MediaEditor, ProfileEditor } from "./Foundation";

export function Admin() {
  return (
    <>
      <PageHeader eyebrow={tr("Administración", "Administration")} title={tr("Panel de admin", "Admin dashboard")}>
        {tr(
          "Aprueba fundaciones, valida evidencia y libera el pago final, pausa campañas y gestiona quién es admin.",
          "Approve nonprofits, validate evidence and release the final payment, pause campaigns and manage admins.",
        )}
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet title={tr("Conecta tu wallet de admin", "Connect your admin wallet")} text={tr("Solo las wallets autorizadas como admin de BITAJÓN pueden usar este panel.", "Only wallets authorized as BITAJÓN admins can use this panel.")}>
          <AdminGate />
        </RequireWallet>
      </section>
    </>
  );
}

function AdminGate() {
  const { isAdmin, address } = useWallet();
  if (!isAdmin)
    return (
      <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title={tr("Esta cuenta no es admin", "This account is not an admin")}>
        {tr(
          "Pídele a un admin actual que agregue esta dirección en la sección «Admins» de este panel:",
          "Ask a current admin to add this address in the “Admins” section of this panel:",
        )}
        <span className="mt-3 flex items-center justify-center gap-1 font-mono text-xs break-all">
          {address} {address && <CopyButton value={address} />}
        </span>
      </EmptyState>
    );
  return <AdminInner />;
}

/**
 * Acciones de admin: la wallet del admin solo firma un mensaje (prueba que es admin) y la
 * llave del equipo firma la transacción en el servidor por el governance-account.
 */
function useAdmin() {
  const { address, signMessage } = useWallet();
  const refreshAll = useRefreshAll();
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  async function act(op: AdminOp, msgs: { loading: string; success: string }, campaignId?: bigint) {
    if (!address) return null;
    setPending(true);
    const id = toast.loading(msgs.loading, { description: tr("Firma el mensaje en tu wallet; la transacción la firma la cuenta del equipo.", "Sign the message in your wallet; the team account signs the transaction.") });
    try {
      const res = await adminAction({ address, signMessage }, op);
      toast.success(msgs.success, {
        id,
        description: undefined,
        action: res.hash ? { label: tr("Ver", "View"), onClick: () => window.open(explorer.tx(res.hash!), "_blank", "noopener") } : undefined,
      });
      await refreshAll(campaignId);
      await qc.invalidateQueries({ queryKey: ["admins"] });
      return res;
    } catch (e) {
      toast.error(friendlyError(e), { id, description: undefined });
      return null;
    } finally {
      setPending(false);
    }
  }
  return { act, pending };
}

function AdminInner() {
  const events = useEvents();
  const campaigns = useCampaigns();
  const registered = registeredNonprofitsFrom(events.data);
  const [lookup, setLookup] = useState("");
  const validLookup = StrKey.isValidEd25519PublicKey(lookup.trim());
  const toReview = (campaigns.data ?? []).filter((v) => stageOf(v) === "review");

  return (
    <div className="space-y-10">
      <TeamStatus />

      <section>
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <FileCheck2 className="h-5 w-5 text-leaf-600" /> {tr("Evidencia por validar", "Evidence to validate")}
        </h2>
        <div className="mt-4 space-y-4">
          {campaigns.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : toReview.length === 0 ? (
            <p className="rounded-2xl bg-sand p-5 text-sm text-slate-600">{tr("No hay campañas con evidencia pendiente.", "No campaigns with pending evidence.")}</p>
          ) : (
            toReview.map((v) => <ReviewCard key={v.id.toString()} view={v} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Building2 className="h-5 w-5 text-leaf-600" /> {tr("Fundaciones", "Nonprofits")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{tr("Todas las fundaciones registradas. También puedes buscar una por su dirección.", "All registered nonprofits. You can also search one by its address.")}</p>
        <label className="relative mt-4 block max-w-xl">
          <span className="sr-only">{tr("Buscar fundación por dirección", "Search nonprofit by address")}</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !rounded-full !pl-10 font-mono" placeholder={tr("Dirección G… de la fundación", "Nonprofit G… address")} value={lookup} onChange={(e) => setLookup(e.target.value)} />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {validLookup && <NonprofitRow address={lookup.trim()} />}
          {events.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : registered.length === 0 && !validLookup ? (
            <p className="rounded-2xl bg-sand p-5 text-sm text-slate-600 md:col-span-2">{tr("Aún no hay fundaciones registradas.", "No nonprofits registered yet.")}</p>
          ) : (
            registered.filter((r) => r.address !== lookup.trim()).map((r) => <NonprofitRow key={r.address} address={r.address} at={r.at} />)
          )}
        </div>
      </section>

      <CampaignsAdmin />
      <AdminsSection />
      <RouterConfig />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cuenta del equipo                                                     */
/* ------------------------------------------------------------------ */

function TeamStatus() {
  const team = useTeamInfo();
  if (team.isLoading) return <Spinner className="h-6 w-6 text-brand-600" />;
  if (!team.data) return null;
  const t = team.data;
  const cmd = `node contracts/scripts/add-signer.mjs deployer ${t.governance ?? GOVERNANCE_ID} ${t.public_key_hex}`;
  return (
    <section className={`card p-6 ${t.is_signer ? "" : "border-amber-300 bg-amber-50/60"}`}>
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <KeyRound className="h-5 w-5 text-leaf-600" /> {tr("Cuenta del equipo", "Team account")}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {tr(
          "Es la que firma las acciones de admin (como firmante del governance-account multisig) y la verificadora de las bóvedas. Su llave vive cifrada en el servidor de BITAJÓN.",
          "It signs admin actions (as a signer of the multisig governance-account) and is the vaults' verifier. Its key lives encrypted on the BITAJÓN server.",
        )}
      </p>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
          <dt className="text-slate-500">{tr("Dirección", "Address")}</dt>
          <dd className="mt-1">
            <AddressLink address={t.address} chars={6} />
          </dd>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
          <dt className="text-slate-500">{tr("Firmante del admin multisig", "Multisig admin signer")}</dt>
          <dd className={`mt-1 font-semibold ${t.is_signer ? "text-leaf-700" : "text-amber-800"}`}>{t.is_signer ? tr("Sí", "Yes") : tr("Todavía no", "Not yet")}</dd>
        </div>
        <div className="rounded-xl bg-white p-3 ring-1 ring-slate-200/70">
          <dt className="text-slate-500">{tr("Cuenta activa en la red", "Account active on the network")}</dt>
          <dd className="mt-1 font-semibold text-brand-900">{t.funded ? tr("Sí", "Yes") : tr("Se activa en la primera acción", "Activated on first action")}</dd>
        </div>
      </dl>
      {!t.is_signer && (
        <div className="mt-4 rounded-xl bg-white p-4 text-sm ring-1 ring-amber-200">
          <p className="font-semibold text-amber-950">
            {tr("Falta un paso: quien tenga la llave del deployer debe agregar esta cuenta como firmante (una sola vez):", "One step left: whoever holds the deployer key must add this account as a signer (only once):")}
          </p>
          <div className="mt-2 flex items-start gap-1 rounded-lg bg-slate-900 p-3">
            <code className="flex-1 font-mono text-xs break-all text-leaf-200">{cmd}</code>
            <CopyButton value={cmd} />
          </div>
          <p className="mt-2 text-xs text-slate-600">
            {tr("Mientras tanto, aprobar, pausar y liberar fondos fallará con «no autorizado».", "Until then, approving, pausing and releasing funds will fail as “unauthorized”.")}
          </p>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Evidencia                                                            */
/* ------------------------------------------------------------------ */

function ReviewCard({ view }: { view: CampaignView }) {
  const { act, pending } = useAdmin();
  const team = useTeamInfo();
  const vault = view.vault!;
  const m = milestoneOf(view);
  // Huella que este admin está revisando: se envía como `expected_evidence`. Si la fundación la
  // cambia mientras tanto, el contrato rechaza la liberación (protección TOCTOU).
  const [reviewed] = useState(() => toHex(vault.evidence_hash!));
  const teamIsVerifier = team.data && vault.verifier === team.data.address;

  return (
    <div className="card grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <StageBadge stage="review" milestone={m} />
        <Link to={`/campanas/${view.id.toString()}`} className="mt-2 block text-lg font-semibold text-brand-900 hover:text-brand-700">
          {view.campaign.name}
        </Link>
        <p className="mt-1 text-sm text-slate-600">
          {tr("Total en custodia:", "Total in custody:")} <Money units={vault.total_deposited} inline />.{" "}
          {tr(`Al liberar, la fundación recibe el ${100 - m}% restante.`, `On release, the nonprofit gets the remaining ${100 - m}%.`)}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          {tr("Verificador:", "Verifier:")} <AddressLink address={vault.verifier} />
        </p>
        {team.data && !teamIsVerifier ? (
          <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            {tr("El verificador de esta campaña no es la cuenta del equipo. Asígnala para poder liberar desde aquí.", "This campaign's verifier is not the team account. Assign it to release from here.")}
            <button
              type="button"
              className="btn-outline mt-2 !py-2"
              disabled={pending}
              onClick={() =>
                act(
                  { op: "set-verifier", campaign_id: Number(view.id) },
                  { loading: tr("Cambiando el verificador…", "Changing the verifier…"), success: tr("La cuenta del equipo es ahora la verificadora.", "The team account is now the verifier.") },
                  view.id,
                )
              }
            >
              {tr("Asignar a la cuenta del equipo", "Assign to the team account")}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-primary mt-4"
            disabled={pending || !team.data}
            onClick={() => {
              if (!window.confirm(tr("¿Confirmas que revisaste la evidencia y quieres liberar el pago final?", "Do you confirm you reviewed the evidence and want to release the final payment?"))) return;
              void act(
                { op: "release-final", campaign_id: Number(view.id), expected_evidence: reviewed },
                { loading: tr("Liberando el pago final…", "Releasing the final payment…"), success: tr("Pago final liberado.", "Final payment released.") },
                view.id,
              );
            }}
          >
            {pending && <Spinner className="h-4 w-4" />} {tr(`Liberar ${100 - m}% final`, `Release final ${100 - m}%`)}
          </button>
        )}
      </div>
      <EvidencePanel campaignId={view.id} evidenceHash={vault.evidence_hash!} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Fundaciones                                                          */
/* ------------------------------------------------------------------ */

function NonprofitRow({ address, at }: { address: string; at?: string }) {
  const profile = useProfile(address);
  const meta = useNonprofitMeta(address);
  const { act, pending } = useAdmin();
  const { address: admin, signMessage } = useWallet();
  const [editing, setEditing] = useState(false);
  const [priv, setPriv] = useState<{ loading: boolean; match?: boolean | null; missing?: boolean; email?: string | null; emailOk?: boolean | null }>({ loading: false });
  const p = profile.data;
  const status = p?.status.tag;

  async function openPrivate(openRut: boolean) {
    if (!admin || !p) return;
    // La pestaña se abre ya (por el bloqueador de ventanas emergentes) y luego se le pone la URL firmada.
    const tab = openRut ? window.open("", "_blank") : null;
    setPriv({ loading: true });
    try {
      const res = await getNonprofitPrivate({ address: admin, signMessage }, address);
      const email = res.email ?? null;
      let emailOk: boolean | null = null;
      if (email) {
        const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(email.toLowerCase())));
        emailOk = toHex(h) === toHex(p.email_hash);
      }
      if (openRut) {
        if (!res.url) tab?.close();
        else if (tab) tab.location.href = res.url;
        else window.open(res.url, "_blank", "noopener");
      }
      setPriv({ loading: false, missing: !res.url, match: res.rut_sha256 ? res.rut_sha256 === toHex(p.rut_hash) : null, email, emailOk });
    } catch (e) {
      tab?.close();
      setPriv({ loading: false });
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="card p-5">
      {profile.isLoading ? (
        <Spinner className="h-5 w-5 text-slate-400" />
      ) : !p ? (
        <p className="text-sm text-slate-600">
          <AddressLink address={address} /> {tr("no está registrada.", "is not registered.")}
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <NonprofitLogo path={meta.data?.logo_path} name={p.legal_name} size="h-11 w-11" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-brand-900">{p.legal_name}</p>
                <p className="text-xs text-slate-500">
                  NIT {p.tax_id}
                  {meta.data?.login_method === "email" && ` · ${tr("entra con correo", "email sign-in")}`}
                </p>
              </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                status === "Approved" ? "bg-leaf-50 text-leaf-800 ring-leaf-200" : status === "Revoked" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"
              }`}
            >
              {status === "Approved" ? tr("Aprobada", "Approved") : status === "Revoked" ? tr("Revocada", "Revoked") : tr("Pendiente", "Pending")}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <AddressLink address={address} />
            <span>
              {tr("Cert. retención", "Retention cert.")}: {p.retention_certificate ? tr("sí", "yes") : "no"}
            </span>
            <span>Habeas Data: {p.data_consent ? tr("sí", "yes") : "no"}</span>
            {at && <span>{relativeTime(at)}</span>}
          </div>
          {meta.data?.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{meta.data.description}</p>}
          {meta.data && <SocialLinks socials={meta.data} className="mt-3" />}
          <div className="mt-4 space-y-1 rounded-xl bg-sand p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-brand-800 hover:underline disabled:opacity-60" onClick={() => openPrivate(true)} disabled={priv.loading}>
                {priv.loading ? <Spinner className="h-4 w-4" /> : <FileLock2 className="h-4 w-4" />} {tr("Ver RUT (privado)", "View RUT (private)")}
              </button>
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-brand-800 hover:underline disabled:opacity-60" onClick={() => openPrivate(false)} disabled={priv.loading}>
                <Mail className="h-4 w-4" /> {tr("Ver correo (privado)", "View email (private)")}
              </button>
            </div>
            {priv.missing && <p className="text-xs text-amber-800">{tr("La fundación todavía no ha subido el archivo del RUT.", "The nonprofit hasn't uploaded the RUT file yet.")}</p>}
            {priv.match === true && (
              <p className="inline-flex items-center gap-1 text-xs text-leaf-800">
                <ShieldCheck className="h-3.5 w-3.5" /> {tr("El RUT coincide con la huella registrada en la red.", "The RUT matches the fingerprint registered on the network.")}
              </p>
            )}
            {priv.match === false && (
              <p className="inline-flex items-center gap-1 text-xs text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5" /> {tr("El RUT NO coincide con la huella registrada en la red: revísalo antes de aprobar.", "The RUT does NOT match the fingerprint on the network: check it before approving.")}
              </p>
            )}
            {priv.email && (
              <p className="text-xs text-slate-700">
                <a className="font-semibold text-brand-700 hover:underline" href={`mailto:${priv.email}`}>
                  {priv.email}
                </a>{" "}
                {priv.emailOk === true
                  ? tr("· coincide con la huella en la red", "· matches the on-chain fingerprint")
                  : priv.emailOk === false
                    ? tr("· NO coincide con la huella en la red", "· does NOT match the on-chain fingerprint")
                    : ""}
              </p>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {status !== "Approved" && (
              <button
                type="button"
                className="btn-primary !py-2"
                disabled={pending}
                onClick={() => act({ op: "approve", nonprofit: address }, { loading: tr("Aprobando…", "Approving…"), success: tr(`${p.legal_name} aprobada.`, `${p.legal_name} approved.`) })}
              >
                <BadgeCheck className="h-4 w-4" /> {tr("Aprobar", "Approve")}
              </button>
            )}
            {status !== "Revoked" && (
              <button
                type="button"
                className="btn-outline !py-2 !text-rose-700"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(tr(`¿Revocar a ${p.legal_name}? No podrá crear campañas nuevas.`, `Revoke ${p.legal_name}? It won't be able to create new campaigns.`))) return;
                  void act({ op: "revoke", nonprofit: address }, { loading: tr("Revocando…", "Revoking…"), success: tr(`${p.legal_name} revocada.`, `${p.legal_name} revoked.`) });
                }}
              >
                <Ban className="h-4 w-4" /> {tr("Revocar", "Revoke")}
              </button>
            )}
            <button type="button" className="btn-ghost !py-2" onClick={() => setEditing(!editing)}>
              <Pencil className="h-4 w-4" /> {tr("Editar perfil", "Edit profile")}
            </button>
          </div>
          {editing && (
            <div className="mt-4">
              <ProfileEditor profile={p} meta={meta.data} target={address} onDone={() => setEditing(false)} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Campañas: fotos y pausa                                              */
/* ------------------------------------------------------------------ */

function CampaignsAdmin() {
  const campaigns = useCampaigns();
  const metaMap = useCampaignMetaMap();
  const { act, pending } = useAdmin();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <ImageIcon className="h-5 w-5 text-leaf-600" /> {tr("Campañas", "Campaigns")}
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {tr(
          "Cambia la portada y la galería de cualquier campaña, o pausa una campaña si ves algo raro (se detienen las donaciones y los donantes pueden pedir reembolso).",
          "Change any campaign's cover and gallery, or pause a campaign if something looks wrong (donations stop and donors can claim refunds).",
        )}
      </p>
      <div className="mt-4 space-y-3">
        {campaigns.isLoading && <Spinner className="h-6 w-6 text-brand-600" />}
        {(campaigns.data ?? []).map((v) => {
          const id = v.id.toString();
          const meta = metaMap.data?.get(id);
          const cover = publicUrl(BUCKETS.media, meta?.cover_path);
          const stage = stageOf(v);
          const canPause = v.vault && !v.vault.final_release_done && stage !== "cancelled";
          return (
            <div key={id} className="card p-4">
              <div className="flex flex-wrap items-center gap-4">
                {cover ? (
                  <img src={cover} alt="" className="h-14 w-20 shrink-0 rounded-xl object-cover" />
                ) : (
                  <span className="grid h-14 w-20 shrink-0 place-items-center rounded-xl bg-sand text-slate-400">
                    <ImageIcon className="h-5 w-5" />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <Link to={`/campanas/${id}`} className="block truncate font-semibold text-brand-900 hover:text-brand-700">
                    #{id} · {v.campaign.name}
                  </Link>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <StageBadge stage={stage} milestone={milestoneOf(v)} />
                    {tr(`${(meta?.gallery ?? []).length} fotos en la galería`, `${(meta?.gallery ?? []).length} photos in the gallery`)}
                  </div>
                </div>
                <div className="flex gap-2">
                  {canPause &&
                    (v.vault!.paused ? (
                      <button
                        type="button"
                        className="btn-outline !py-2"
                        disabled={pending}
                        onClick={() => act({ op: "unpause", campaign_id: Number(v.id) }, { loading: tr("Reanudando…", "Resuming…"), success: tr("Campaña reanudada.", "Campaign resumed.") }, v.id)}
                      >
                        <Play className="h-4 w-4" /> {tr("Reanudar", "Resume")}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn-outline !py-2 !text-orange-700"
                        disabled={pending}
                        onClick={() => {
                          if (!window.confirm(tr("¿Pausar esta campaña? Se detienen las donaciones y los donantes podrán pedir reembolso.", "Pause this campaign? Donations stop and donors will be able to claim refunds."))) return;
                          void act({ op: "pause", campaign_id: Number(v.id) }, { loading: tr("Pausando…", "Pausing…"), success: tr("Campaña pausada.", "Campaign paused.") }, v.id);
                        }}
                      >
                        <Pause className="h-4 w-4" /> {tr("Pausar", "Pause")}
                      </button>
                    ))}
                  <button type="button" className="btn-outline !py-2" onClick={() => setOpen(open === id ? null : id)}>
                    {open === id ? tr("Cerrar", "Close") : tr("Fotos", "Photos")}
                  </button>
                </div>
              </div>
              {open === id && <MediaEditor campaignId={v.id} meta={meta} onDone={() => setOpen(null)} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Admins                                                               */
/* ------------------------------------------------------------------ */

function AdminsSection() {
  const { address } = useWallet();
  const admins = useQuery({ queryKey: ["admins"], queryFn: listAdmins, staleTime: 60_000 });
  const { act, pending } = useAdmin();
  const [newAddr, setNewAddr] = useState("");
  const [label, setLabel] = useState("");
  const valid = StrKey.isValidEd25519PublicKey(newAddr.trim());

  return (
    <section className="card p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <Users className="h-5 w-5 text-leaf-600" /> Admins
      </h2>
      <p className="mt-1 text-sm text-slate-600">
        {tr(
          "Wallets que pueden usar este panel. Las acciones las firma la cuenta del equipo, así que agregar un admin no cambia nada en los contratos.",
          "Wallets that can use this panel. Actions are signed by the team account, so adding an admin doesn't change anything in the contracts.",
        )}
      </p>
      <ul className="mt-4 divide-y divide-slate-100">
        {(admins.data ?? []).map((a) => (
          <li key={a.address} className="flex items-center justify-between gap-3 py-2.5">
            <span className="flex items-center gap-2 text-sm">
              <AddressLink address={a.address} chars={6} /> <span className="text-slate-500">{a.label}</span>
            </span>
            {a.address !== address && (
              <button
                type="button"
                className="text-rose-700 hover:text-rose-900"
                aria-label={tr("Quitar admin", "Remove admin")}
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(tr("¿Quitar este admin?", "Remove this admin?"))) return;
                  void act({ op: "remove-admin", address: a.address }, { loading: tr("Quitando…", "Removing…"), success: tr("Admin quitado.", "Admin removed.") });
                }}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <label className="block">
          <span className="label">{tr("Dirección G… del nuevo admin", "New admin's G… address")}</span>
          <input className="input font-mono text-xs" value={newAddr} onChange={(e) => setNewAddr(e.target.value.trim())} placeholder="G…" />
        </label>
        <label className="block">
          <span className="label">{tr("Nombre", "Name")}</span>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Gabriel" />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!valid || pending}
          onClick={async () => {
            const r = await act({ op: "add-admin", address: newAddr.trim(), label }, { loading: tr("Agregando…", "Adding…"), success: tr("Admin agregado.", "Admin added.") });
            if (r) {
              setNewAddr("");
              setLabel("");
            }
          }}
        >
          <UserPlus className="h-4 w-4" /> {tr("Agregar", "Add")}
        </button>
      </div>
    </section>
  );
}

function RouterConfig() {
  const fee = useFeeBps();
  const treasury = useQuery({ queryKey: ["treasury"], queryFn: getTreasury, staleTime: 60_000 });
  return (
    <section className="card p-6">
      <h2 className="text-xl font-semibold">{tr("Configuración del protocolo", "Protocol settings")}</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
        <div className="rounded-xl bg-sand p-3">
          <dt className="text-slate-500">{tr("Comisión de plataforma", "Platform fee")}</dt>
          <dd className="mt-1 font-semibold text-brand-900">{fee.data === undefined ? "…" : `${fee.data} bps (${fee.data / 100}%)`}</dd>
        </div>
        <div className="rounded-xl bg-sand p-3">
          <dt className="text-slate-500">{tr("Tesorería", "Treasury")}</dt>
          <dd className="mt-1">{treasury.data ? <AddressLink address={treasury.data} /> : "…"}</dd>
        </div>
        <div className="rounded-xl bg-sand p-3">
          <dt className="text-slate-500">{tr("Admin on-chain (multisig)", "On-chain admin (multisig)")}</dt>
          <dd className="mt-1">
            <AddressLink address={GOVERNANCE_ID} kind="contract" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
