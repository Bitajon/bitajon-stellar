import type { ReactNode } from "react";
import { ArrowLeft, BadgeCheck, CalendarClock, ImageIcon, MapPin, Pencil, Settings2, Users } from "lucide-react";
import { useState } from "react";
import { MediaEditor, ProfileEditor } from "./Foundation";
import { Link, useParams } from "react-router-dom";
import { CampaignCover } from "../components/CampaignCover";
import { DonateCard } from "../components/DonateCard";
import { EvidencePanel } from "../components/EvidencePanel";
import { Gallery } from "../components/Gallery";
import { NonprofitCard } from "../components/Nonprofit";
import { MilestoneTrack } from "../components/MilestoneTrack";
import { AddressLink, EmptyState, ErrorBox, ProgressBar, Spinner, StageBadge, TxLink } from "../components/ui";
import { CONTRACTS } from "../config";
import { donationsFrom, milestonesFrom, useCampaign, useCampaignMetaMap, useEvents, useNonprofitMeta, useProfile } from "../hooks/queries";
import { BUCKETS, publicUrl } from "../lib/offchain";
import { formatDate, percent, relativeTime, shortAddress, timeLeftLabel } from "../lib/format";
import { Money } from "../lib/currency";
import { tr } from "../lib/i18n";
import { milestoneOf, raised, refundable, stageInfo, stageOf } from "../lib/status";
import { useWallet } from "../lib/wallet";

function parseId(raw: string | undefined): bigint | null {
  return raw && /^\d+$/.test(raw) ? BigInt(raw) : null;
}

export function CampaignDetail() {
  const id = parseId(useParams().id);
  const q = useCampaign(id);
  const events = useEvents();
  const { address, isAdmin } = useWallet();
  const [editing, setEditing] = useState<null | "fotos" | "perfil">(null);
  const view = q.data;
  const profile = useProfile(view?.campaign.nonprofit);
  const nonprofitMeta = useNonprofitMeta(view?.campaign.nonprofit);
  const metaMap = useCampaignMetaMap();

  if (id === null) return <NotFoundCampaign />;
  if (q.isLoading)
    return (
      <div className="grid min-h-[50vh] place-items-center">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );
  if (q.isError)
    return (
      <div className="container-page py-16">
        <ErrorBox error={q.error} onRetry={() => q.refetch()} />
      </div>
    );
  if (!view) return <NotFoundCampaign />;

  const { campaign, vault } = view;
  const stage = stageOf(view);
  const m = milestoneOf(view);
  const got = raised(view);
  const pct = percent(got, campaign.target_amount);
  const donations = donationsFrom(events.data).filter((d) => d.campaignId === view.id);
  const donors = new Set(donations.map((d) => d.donor)).size;
  const milestones = milestonesFrom(events.data, view.id);
  const isOwner = address === campaign.nonprofit;
  const approved = profile.data?.status.tag === "Approved";
  const media = metaMap.data?.get(view.id.toString());
  const coverUrl = publicUrl(BUCKETS.media, media?.cover_path);
  const galleryUrls = (media?.gallery ?? []).map((p) => publicUrl(BUCKETS.media, p)!).filter(Boolean);

  return (
    <div className="pb-10">
      <div className="container-page pt-6">
        <Link to="/campanas" className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-800">
          <ArrowLeft className="h-4 w-4" /> {tr("Todas las campañas", "All campaigns")}
        </Link>
      </div>

      <div className="container-page mt-5 grid gap-8 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <div className="overflow-hidden rounded-[2rem]">
            <CampaignCover name={campaign.name} description={campaign.description} imageUrl={coverUrl} className="h-56 sm:h-80" big />
          </div>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <StageBadge stage={stage} milestone={m} />
            <span className="text-sm text-slate-500">
              {tr("Campaña", "Campaign")} #{view.id.toString()}
            </span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold sm:text-4xl">{campaign.name}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1.5 font-semibold text-brand-800">
              {approved && <BadgeCheck className="h-4 w-4 text-leaf-600" />}
              {nonprofitMeta.data?.display_name || profile.data?.legal_name || shortAddress(campaign.nonprofit)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" /> {campaign.location || "Colombia"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarClock className="h-4 w-4" /> {tr("Cierra el", "Closes on")} {formatDate(campaign.deadline)}
            </span>
          </div>

          {(isOwner || isAdmin) && (
            <div className="mt-5 flex flex-wrap gap-2">
              <button type="button" className="btn-outline !py-2" onClick={() => setEditing(editing === "fotos" ? null : "fotos")}>
                <ImageIcon className="h-4 w-4" /> {tr("Cambiar fotos", "Change photos")}
              </button>
              {profile.data && (
                <button type="button" className="btn-outline !py-2" onClick={() => setEditing(editing === "perfil" ? null : "perfil")}>
                  <Pencil className="h-4 w-4" /> {tr("Editar perfil de la fundación", "Edit nonprofit profile")}
                </button>
              )}
              {isAdmin && !isOwner && <span className="self-center text-xs text-slate-500">{tr("Como admin puedes editar cualquier campaña y fundación.", "As an admin you can edit any campaign and nonprofit.")}</span>}
            </div>
          )}
          {editing === "fotos" && <MediaEditor campaignId={view.id} meta={media} onDone={() => setEditing(null)} />}
          {editing === "perfil" && profile.data && (
            <div className="mt-5">
              <ProfileEditor profile={profile.data} meta={nonprofitMeta.data} target={campaign.nonprofit} onDone={() => setEditing(null)} />
            </div>
          )}

          {isOwner && (
            <Link to="/fundacion" className="mt-5 flex items-center gap-2 rounded-2xl bg-brand-50 p-4 text-sm font-semibold text-brand-800 ring-1 ring-brand-100 hover:bg-brand-100">
              <Settings2 className="h-4 w-4" /> {tr("Esta campaña es de tu fundación. Gestiónala desde tu panel.", "This campaign belongs to your nonprofit. Manage it from your dashboard.")}
            </Link>
          )}

          <section className="mt-8">
            <h2 className="text-xl font-semibold">{tr("Sobre la campaña", "About the campaign")}</h2>
            <p className="mt-3 leading-relaxed whitespace-pre-line text-slate-700">{campaign.description || tr("Sin descripción.", "No description.")}</p>
          </section>

          {galleryUrls.length > 0 && (
            <section className="mt-8">
              <h2 className="text-xl font-semibold">{tr("Fotos de la causa", "Photos of the cause")}</h2>
              <div className="mt-4">
                <Gallery urls={galleryUrls} title={campaign.name} />
              </div>
            </section>
          )}

          <div className="mt-8">
            <NonprofitCard address={campaign.nonprofit} />
          </div>

          <section className="card mt-8 p-6">
            <h2 className="text-xl font-semibold">{tr("Ruta de los fondos", "Path of the funds")}</h2>
            <p className="mt-1 text-sm text-slate-600">{stageInfo(stage, m).hint}</p>
            {refundable(view) && (
              <Link to="/mis-donaciones" className="mt-3 inline-flex text-sm font-semibold text-amber-800 underline">
                {tr("¿Donaste? Pide tu reembolso en «Mis donaciones»", "Did you donate? Claim your refund in “My donations”")}
              </Link>
            )}
            <div className="mt-6">
              <MilestoneTrack view={view} milestones={milestones} />
            </div>
          </section>

          {vault?.evidence_hash && (
            <section className="card mt-8 p-6">
              <h2 className="text-xl font-semibold">{tr("Evidencia", "Evidence")}</h2>
              <div className="mt-4">
                <EvidencePanel campaignId={view.id} evidenceHash={vault.evidence_hash} />
              </div>
            </section>
          )}

          <section className="card mt-8 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold">{tr("Donaciones recientes", "Recent donations")}</h2>
              {events.isFetching && <Spinner className="h-4 w-4 text-slate-400" />}
            </div>
            {donations.length === 0 ? (
              <p className="mt-3 text-sm text-slate-600">{events.isLoading ? tr("Cargando…", "Loading…") : tr("Todavía no hay donaciones. ¡Puedes ser la primera persona!", "No donations yet. You can be the first!")}</p>
            ) : (
              <ul className="mt-4 divide-y divide-slate-100">
                {donations.slice(0, 20).map((d) => (
                  <li key={d.txHash + d.donor} className="flex items-center justify-between gap-3 py-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-full bg-leaf-50 text-xs font-bold text-leaf-800">{d.donor.slice(1, 3)}</span>
                      <div>
                        <AddressLink address={d.donor} />
                        <p className="text-xs text-slate-500">{relativeTime(d.at)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Money units={d.net} className="text-sm font-bold text-brand-900" fiatClassName="block text-[0.7rem] font-normal text-slate-500" />
                      <TxLink hash={d.txHash}>tx</TxLink>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint mt-4">{tr("El historial sale de los eventos de Stellar copiados en BITAJÓN. El total recaudado siempre se lee del contrato.", "The history comes from Stellar events copied into BITAJÓN. The total raised is always read from the contract.")}</p>
          </section>

          <section className="mt-8 rounded-2xl bg-sand p-5 text-sm">
            <h2 className="font-display text-lg font-semibold">{tr("Datos on-chain", "On-chain data")}</h2>
            <dl className="mt-3 grid gap-2 sm:grid-cols-2">
              <Info label={tr("Fundación", "Nonprofit")} value={<AddressLink address={campaign.nonprofit} />} />
              {vault && <Info label={tr("Verificador", "Verifier")} value={<AddressLink address={vault.verifier} />} />}
              <Info label={tr("Primer desembolso", "First payout")} value={<span className="font-semibold text-brand-900">{m}%</span>} />
              <Info label="Token" value={<AddressLink address={campaign.token_address} kind="contract" />} />
              <Info label={tr("Registro de campañas", "Campaign registry")} value={<AddressLink address={CONTRACTS.campaignRegistry} kind="contract" />} />
              <Info label={tr("Bóveda", "Vault")} value={<AddressLink address={CONTRACTS.campaignVault} kind="contract" />} />
            </dl>
          </section>
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="card p-6">
            <Money units={got} className="font-display text-3xl font-semibold text-brand-900" fiatClassName="block font-sans text-sm font-medium text-slate-500" />
            <p className="mt-1 text-sm text-slate-500">
              {tr("recaudado de", "raised of")} <Money units={campaign.target_amount} inline />
            </p>
            <div className="mt-4">
              <ProgressBar value={pct} size="lg" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2 text-center">
              <Mini label={tr("Avance", "Progress")} value={`${Math.floor(pct)}%`} />
              <Mini label={tr("Donantes", "Donors")} value={events.isLoading ? "…" : String(donors)} icon={<Users className="h-3.5 w-3.5" />} />
              <Mini label={tr("Tiempo", "Time")} value={timeLeftLabel(campaign.deadline).replace("Quedan ", "").replace("Queda ", "").replace(" left", "")} />
            </div>
          </div>
          <div className="mt-4">
            <DonateCard view={view} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-200/70">
      <dt className="text-slate-500">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Mini({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) {
  return (
    <div className="rounded-xl bg-sand px-2 py-2.5">
      <p className="inline-flex items-center gap-1 text-sm font-bold text-brand-900">
        {icon}
        {value}
      </p>
      <p className="text-[0.7rem] font-medium text-slate-500">{label}</p>
    </div>
  );
}

function NotFoundCampaign() {
  return (
    <div className="container-page py-16">
      <EmptyState
        icon={<MapPin className="h-6 w-6" />}
        title={tr("No encontramos esta campaña", "We couldn't find this campaign")}
        action={
          <Link to="/campanas" className="btn-primary">
            {tr("Ver campañas", "See campaigns")}
          </Link>
        }
      >
        {tr("Puede que el enlace esté mal o que la campaña todavía no exista en la red.", "The link may be wrong or the campaign may not exist on the network yet.")}
      </EmptyState>
    </div>
  );
}
