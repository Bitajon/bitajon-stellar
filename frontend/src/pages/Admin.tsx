import { StrKey } from "@stellar/stellar-sdk";
import { useQuery } from "@tanstack/react-query";
import { BadgeCheck, Ban, Building2, FileCheck2, Search, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { EvidenceVerifier } from "../components/EvidenceVerifier";
import { RequireWallet } from "../components/RequireWallet";
import { AddressLink, EmptyState, PageHeader, Spinner, StageBadge } from "../components/ui";
import { ADMIN_ADDRESS } from "../config";
import { registeredNonprofitsFrom, useCampaigns, useEvents, useFeeBps, useProfile } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { formatToken, relativeTime, shortAddress } from "../lib/format";
import { stageOf } from "../lib/status";
import { approveNonprofit, getTreasury, releaseFinal, revokeNonprofit } from "../lib/stellar";
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
        Los contratos tienen como admin a <b className="font-mono">{shortAddress(ADMIN_ADDRESS, 6)}</b>. Conecta esa cuenta en Freighter para usar este
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
        <p className="mt-1 text-sm text-slate-600">Registros recientes (últimos días que guarda la red). Para una fundación más antigua, búscala por su dirección.</p>
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
  const { run, pending } = useTx();
  const p = profile.data;
  const status = p?.status.tag;

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
            <div className="min-w-0">
              <p className="truncate font-semibold text-brand-900">{p.legal_name}</p>
              <p className="text-xs text-slate-500">
                NIT {p.tax_id} · {p.email}
              </p>
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
          </div>
        </>
      )}
    </div>
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
      <EvidenceVerifier evidenceHash={evidence} />
    </div>
  );
}
