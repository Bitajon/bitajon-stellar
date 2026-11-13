import { Search, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, ErrorBox, PageHeader, SkeletonCard } from "../components/ui";
import { useCampaigns } from "../hooks/queries";
import { tr } from "../lib/i18n";
import { stageOf, type Stage } from "../lib/status";

type FilterKey = "all" | "open" | "progress" | "done" | "refund";
const filters = (): { key: FilterKey; label: string; stages: Stage[] | null }[] => [
  { key: "all", label: tr("Todas", "All"), stages: null },
  { key: "open", label: tr("Recibiendo donaciones", "Accepting donations"), stages: ["active"] },
  { key: "progress", label: tr("En ejecución", "In progress"), stages: ["funded", "review"] },
  { key: "done", label: tr("Completadas", "Completed"), stages: ["completed"] },
  { key: "refund", label: tr("Con reembolso", "Refundable"), stages: ["expired", "cancelled", "paused"] },
];

export function Campaigns() {
  const campaigns = useCampaigns();
  const [filter, setFilter] = useState<FilterKey>("all");
  const FILTERS = filters();
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const f = filters().find((x) => x.key === filter)!;
    const term = q.trim().toLowerCase();
    return (campaigns.data ?? [])
      .filter((v) => (f.stages ? f.stages.includes(stageOf(v)) : stageOf(v) !== "draft"))
      .filter((v) =>
        term ? `${v.campaign.name} ${v.campaign.location} ${v.campaign.description}`.toLowerCase().includes(term) : true,
      )
      .sort((a, b) => Number(b.id - a.id));
  }, [campaigns.data, filter, q]);

  return (
    <>
      <PageHeader eyebrow={tr("Campañas", "Campaigns")} title={tr("Elige a quién apoyar", "Choose who to support")}>
        {tr(
          "Todas las campañas son de fundaciones aprobadas. Tu donación queda en custodia hasta que la campaña llega a su meta.",
          "All campaigns belong to approved nonprofits. Your donation stays in custody until the campaign reaches its goal.",
        )}
      </PageHeader>
      <section className="container-page py-10">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                role="tab"
                aria-selected={filter === f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition ${
                  filter === f.key ? "bg-brand-700 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-brand-200"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <label className="relative sm:w-72">
            <span className="sr-only">{tr("Buscar campañas", "Search campaigns")}</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input !rounded-full !py-2.5 !pl-10" placeholder={tr("Buscar por nombre o lugar", "Search by name or place")} value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
        </div>

        <div className="mt-8">
          {campaigns.isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : campaigns.isError ? (
            <ErrorBox error={campaigns.error} onRetry={() => campaigns.refetch()} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<Sprout className="h-6 w-6" />}
              title={q || filter !== "all" ? tr("No hay campañas con ese filtro", "No campaigns match that filter") : tr("Todavía no hay campañas", "No campaigns yet")}
              action={
                <Link to="/fundacion" className="btn-primary">
                  {tr("Publicar una campaña", "Publish a campaign")}
                </Link>
              }
            >
              {tr("Las campañas aparecen cuando la fundación abre su bóveda para recibir donaciones.", "Campaigns appear when the nonprofit opens its vault to receive donations.")}
            </EmptyState>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((v) => (
                <CampaignCard key={v.id.toString()} view={v} />
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
