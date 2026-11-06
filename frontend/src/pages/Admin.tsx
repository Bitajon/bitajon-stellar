import { StrKey } from "@stellar/stellar-sdk";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, Building2, FileCheck2, FileLock2, ImageIcon, Pencil, Search, ShieldAlert, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EvidencePanel } from "../components/EvidencePanel";
import { NonprofitLogo, SocialLinks } from "../components/Nonprofit";
import { RequireWallet } from "../components/RequireWallet";
import { AddressLink, EmptyState, PageHeader, Spinner, StageBadge } from "../components/ui";
import { ADMIN_ADDRESS } from "../config";
import { registeredNonprofitsFrom, useCampaignMetaMap, useCampaigns, useEvents, useFeeBps, useNonprofitMeta, useProfile } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { friendlyError } from "../lib/errors";
import { formatToken, relativeTime, shortAddress } from "../lib/format";
import { toHex } from "../lib/hash";
import { BUCKETS, getRutUrl, publicUrl } from "../lib/offchain";
import { MediaEditor, ProfileEditor } from "./Foundation";
import { stageOf } from "../lib/status";
import { approveNonprofit, getTreasury, releaseFinal, revokeNonprofit } from "../lib/stellar";
import { toast } from "sonner";
import { useWallet } from "../lib/wallet";

export function Admin() {
  return (
    <>
      <PageHeader eyebrow="Administración" title="Panel de admin">
        Aprueba fundaciones y libera el pago final cuando la evidencia esté validada.
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet title="Conecta la cuenta admin" text="Solo la cuenta admin de los contratos puede aprobar fundaciones y liberar fondos.">
          <AdminGate />
        </RequireWallet>
      </section>
    </>
  );
}

function AdminGate() {
  const { isAdmin } = useWallet();
  if (!isAdmin)
    return (
      <EmptyState icon={<ShieldAlert className="h-6 w-6" />} title="Esta cuenta no es la admin">
        Los contratos tienen como admin a <b className="font-mono">{shortAddress(ADMIN_ADDRESS, 6)}</b>. Conecta esa cuenta en tu wallet para usar este
        panel.
      </EmptyState>
    );
  return <AdminInner />;
}

function AdminInner() {
  const events = useEvents();
  const campaigns = useCampaigns();
  const fee = useFeeBps();
  const treasury = useQuery({ queryKey: ["treasury"], queryFn: getTreasury, staleTime: 60_000 });
  const registered = registeredNonprofitsFrom(events.data);
  const [lookup, setLookup] = useState("");
  const validLookup = StrKey.isValidEd25519PublicKey(lookup.trim());
  const toReview = (campaigns.data ?? []).filter((v) => stageOf(v) === "review");

  return (
    <div className="space-y-10">
      <section>
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <FileCheck2 className="h-5 w-5 text-leaf-600" /> Evidencia por validar
        </h2>
        <div className="mt-4 space-y-4">
          {campaigns.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : toReview.length === 0 ? (
            <p className="rounded-2xl bg-sand p-5 text-sm text-slate-600">No hay campañas con evidencia pendiente.</p>
          ) : (
            toReview.map((v) => <ReviewCard key={v.id.toString()} id={v.id} name={v.campaign.name} evidence={v.vault!.evidence_hash!} total={v.vault!.total_deposited} />)
          )}
        </div>
      </section>

      <section>
        <h2 className="flex items-center gap-2 text-2xl font-semibold">
          <Building2 className="h-5 w-5 text-leaf-600" /> Fundaciones
        </h2>
        <p className="mt-1 text-sm text-slate-600">Todas las fundaciones registradas. También puedes buscar una por su dirección.</p>
        <label className="relative mt-4 block max-w-xl">
          <span className="sr-only">Buscar fundación por dirección</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className="input !rounded-full !pl-10 font-mono" placeholder="Dirección G… de la fundación" value={lookup} onChange={(e) => setLookup(e.target.value)} />
        </label>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {validLookup && <NonprofitRow address={lookup.trim()} />}
          {events.isLoading ? (
            <Spinner className="h-6 w-6 text-brand-600" />
          ) : registered.length === 0 && !validLookup ? (
            <p className="rounded-2xl bg-sand p-5 text-sm text-slate-600 md:col-span-2">No hay registros recientes.</p>
          ) : (
            registered.filter((r) => r.address !== lookup.trim()).map((r) => <NonprofitRow key={r.address} address={r.address} at={r.at} />)
          )}
        </div>
      </section>

      <MediaAdmin />

      <section className="card p-6">
        <h2 className="text-xl font-semibold">Configuración del router</h2>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-sand p-3">
            <dt className="text-slate-500">Comisión de plataforma</dt>
            <dd className="mt-1 font-semibold text-brand-900">{fee.data === undefined ? "…" : `${fee.data} bps (${fee.data / 100}%)`}</dd>
          </div>
          <div className="rounded-xl bg-sand p-3">
            <dt className="text-slate-500">Tesorería</dt>
            <dd className="mt-1">{treasury.data ? <AddressLink address={treasury.data} /> : "…"}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}

function NonprofitRow({ address, at }: { address: string; at?: string }) {
  const profile = useProfile(address);
  const meta = useNonprofitMeta(address);
  const { run, pending } = useTx();
  const { address: admin, signMessage } = useWallet();
  const [editing, setEditing] = useState(false);
  const [rut, setRut] = useState<{ loading: boolean; match?: boolean | null; missing?: boolean }>({ loading: false });
  const p = profile.data;
  const status = p?.status.tag;

  async function openRut() {
    if (!admin || !p) return;
    // La pestaña se abre ya (por el bloqueador de ventanas emergentes) y luego se le pone la URL firmada.
    const tab = window.open("", "_blank");
    setRut({ loading: true });
    try {
      const res = await getRutUrl({ address: admin, signMessage }, address);
      if (!res.url) {
        tab?.close();
        setRut({ loading: false, missing: true });
        return;
      }
      if (tab) tab.location.href = res.url;
      else window.open(res.url, "_blank", "noopener");
      setRut({ loading: false, match: res.rut_sha256 ? res.rut_sha256 === toHex(p.rut_hash) : null });
    } catch (e) {
      tab?.close();
      setRut({ loading: false });
      toast.error(friendlyError(e));
    }
  }

  return (
    <div className="card p-5">
      {profile.isLoading ? (
        <Spinner className="h-5 w-5 text-slate-400" />
      ) : !p ? (
        <p className="text-sm text-slate-600">
          <AddressLink address={address} /> no está registrada.
        </p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
            <NonprofitLogo path={meta.data?.logo_path} name={p.legal_name} size="h-11 w-11" />
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-900">{p.legal_name}</p>
              <p className="text-xs text-slate-500">
                NIT {p.tax_id} · {p.email}
              </p>
            </div>
            </div>
            <span
              className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${
                status === "Approved" ? "bg-leaf-50 text-leaf-800 ring-leaf-200" : status === "Revoked" ? "bg-rose-50 text-rose-800 ring-rose-200" : "bg-amber-50 text-amber-800 ring-amber-200"
              }`}
            >
              {status === "Approved" ? "Aprobada" : status === "Revoked" ? "Revocada" : "Pendiente"}
            </span>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <AddressLink address={address} />
            <span>Cert. retención: {p.retention_certificate ? "sí" : "no"}</span>
            <span>Habeas Data: {p.data_consent ? "sí" : "no"}</span>
            {at && <span>{relativeTime(at)}</span>}
          </div>
          {meta.data?.description && <p className="mt-3 line-clamp-3 text-sm text-slate-600">{meta.data.description}</p>}
          {meta.data && <SocialLinks socials={meta.data} className="mt-3" />}
          <div className="mt-4 rounded-xl bg-sand p-3 text-sm">
            <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-brand-800 hover:underline disabled:opacity-60" onClick={openRut} disabled={rut.loading}>
              {rut.loading ? <Spinner className="h-4 w-4" /> : <FileLock2 className="h-4 w-4" />} Ver RUT (privado)
            </button>
            {rut.missing && <p className="mt-1 text-xs text-amber-800">La fundación todavía no ha subido el archivo del RUT.</p>}
            {rut.match === true && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-leaf-800">
                <ShieldCheck className="h-3.5 w-3.5" /> El archivo coincide con la huella del RUT registrada en la red.
              </p>
            )}
            {rut.match === false && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-amber-800">
                <ShieldAlert className="h-3.5 w-3.5" /> El archivo NO coincide con la huella registrada en la red: revísalo antes de aprobar.
              </p>
            )}
          </div>
          <div className="mt-4 flex gap-2">
            {status !== "Approved" && (
              <button type="button" className="btn-primary !py-2" disabled={pending} onClick={() => run((s) => approveNonprofit(s, address), { loading: "Aprobando…", success: `${p.legal_name} aprobada.` })}>
                <BadgeCheck className="h-4 w-4" /> Aprobar
              </button>
            )}
            {status !== "Revoked" && (
              <button
                type="button"
                className="btn-outline !py-2 !text-rose-700"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(`¿Revocar a ${p.legal_name}? No podrá crear campañas nuevas.`)) return;
                  void run((s) => revokeNonprofit(s, address), { loading: "Revocando…", success: `${p.legal_name} revocada.` });
                }}
              >
                <Ban className="h-4 w-4" /> Revocar
              </button>
            )}
            <button type="button" className="btn-ghost !py-2" onClick={() => setEditing(!editing)}>
              <Pencil className="h-4 w-4" /> Editar perfil
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

/** Fotos de todas las campañas: el admin puede cambiarlas sin entrar con cada fundación. */
function MediaAdmin() {
  const campaigns = useCampaigns();
  const metaMap = useCampaignMetaMap();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section>
      <h2 className="flex items-center gap-2 text-2xl font-semibold">
        <ImageIcon className="h-5 w-5 text-leaf-600" /> Fotos de las campañas
      </h2>
      <p className="mt-1 text-sm text-slate-600">Con la cuenta admin puedes cambiar la portada y la galería de cualquier campaña. El perfil y logo de cada fundación se editan abajo, en «Fundaciones».</p>
      <div className="mt-4 space-y-3">
        {campaigns.isLoading && <Spinner className="h-6 w-6 text-brand-600" />}
        {(campaigns.data ?? []).map((v) => {
          const id = v.id.toString();
          const meta = metaMap.data?.get(id);
          const cover = publicUrl(BUCKETS.media, meta?.cover_path);
          return (
            <div key={id} className="card p-4">
              <div className="flex items-center gap-4">
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
                  <p className="text-xs text-slate-500">{(meta?.gallery ?? []).length} fotos en la galería</p>
                </div>
                <button type="button" className="btn-outline !py-2" onClick={() => setOpen(open === id ? null : id)}>
                  {open === id ? "Cerrar" : "Fotos"}
                </button>
              </div>
              {open === id && <MediaEditor campaignId={v.id} meta={meta} onDone={() => setOpen(null)} />}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ReviewCard({ id, name, evidence, total }: { id: bigint; name: string; evidence: Uint8Array; total: bigint }) {
  const { run, pending } = useTx();
  return (
    <div className="card grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]">
      <div>
        <StageBadge stage="review" />
        <Link to={`/campanas/${id.toString()}`} className="mt-2 block text-lg font-semibold text-brand-900 hover:text-brand-700">
          {name}
        </Link>
        <p className="mt-1 text-sm text-slate-600">Total en custodia: {formatToken(total)}. Al liberar, la fundación recibe lo que queda en la bóveda.</p>
        <button
          type="button"
          className="btn-primary mt-4"
          disabled={pending}
          onClick={() => {
            if (!window.confirm("¿Confirmas que revisaste la evidencia y quieres liberar el pago final?")) return;
            void run((s) => releaseFinal(s, id), { loading: "Liberando el pago final…", success: "Pago final liberado." }, { campaignId: id });
          }}
        >
          {pending && <Spinner className="h-4 w-4" />} Liberar 50% final
        </button>
      </div>
      <EvidencePanel campaignId={id} evidenceHash={evidence} />
    </div>
  );
}
