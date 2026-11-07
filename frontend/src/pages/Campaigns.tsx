import { Search, Sprout } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CampaignCard } from "../components/CampaignCard";
import { EmptyState, ErrorBox, PageHeader, SkeletonCard } from "../components/ui";
import { useCampaigns } from "../hooks/queries";
import { stageOf, type Stage } from "../lib/status";

const FILTERS: { key: "all" | "open" | "progress" | "done"; label: string; stages: Stage[] | null }[] = [
  { key: "all", label: "Todas", stages: null },
  { key: "open", label: "Recibiendo donaciones", stages: ["active"] },
  { key: "progress", label: "En ejecución", stages: ["funded", "review"] },
  { key: "done", label: "Completadas", stages: ["completed"] },
];

export function Campaigns() {
  const campaigns = useCampaigns();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");
  const [q, setQ] = useState("");

  const list = useMemo(() => {
    const f = FILTERS.find((x) => x.key === filter)!;
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
      <PageHeader eyebrow="Campañas" title="Elige a quién apoyar">
        Todas las campañas son de fundaciones aprobadas. Tu donación queda en custodia hasta que la campaña llega a su meta.
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
            <span className="sr-only">Buscar campañas</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input className="input !rounded-full !py-2.5 !pl-10" placeholder="Buscar por nombre o lugar" value={q} onChange={(e) => setQ(e.target.value)} />
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
              title={q || filter !== "all" ? "No hay campañas con ese filtro" : "Todavía no hay campañas"}
              action={
                <Link to="/fundacion" className="btn-primary">
                  Publicar una campaña
                </Link>
              }
            >
              Las campañas aparecen cuando la fundación abre su bóveda para recibir donaciones.
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
