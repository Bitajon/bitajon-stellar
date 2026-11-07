import { HeartHandshake } from "lucide-react";
import { Link } from "react-router-dom";
import { RequireWallet } from "../components/RequireWallet";
import { EmptyState, PageHeader, Spinner, StageBadge, TxLink } from "../components/ui";
import { donationsFrom, useCampaigns, useEvents } from "../hooks/queries";
import { formatToken, relativeTime } from "../lib/format";
import { stageOf } from "../lib/status";
import { useWallet } from "../lib/wallet";

export function MyDonations() {
  return (
    <>
      <PageHeader eyebrow="Tu impacto" title="Mis donaciones">
        Sigue en qué etapa está cada campaña que apoyaste y verifica cada movimiento en el explorador.
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet title="Conecta tu wallet" text="Tus donaciones se identifican por la dirección de tu wallet.">
          <Inner />
        </RequireWallet>
      </section>
    </>
  );
}

function Inner() {
  const { address } = useWallet();
  const events = useEvents();
  const campaigns = useCampaigns();
  const mine = donationsFrom(events.data).filter((d) => d.donor === address);
  const total = mine.reduce((a, d) => a + d.gross, 0n);
  const byId = new Map((campaigns.data ?? []).map((v) => [v.id.toString(), v]));
  const supported = new Set(mine.map((d) => d.campaignId.toString())).size;

  if (events.isLoading)
    return (
      <div className="grid place-items-center py-16">
        <Spinner className="h-8 w-8 text-brand-600" />
      </div>
    );

  if (mine.length === 0)
    return (
      <EmptyState
        icon={<HeartHandshake className="h-6 w-6" />}
        title="Aún no vemos donaciones recientes"
        action={
          <Link to="/campanas" className="btn-primary">
            Explorar campañas
          </Link>
        }
      >
        Aquí aparecen todas las donaciones hechas desde esta wallet (registradas en Stellar).
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Donado" value={formatToken(total)} />
        <Stat label="Donaciones" value={String(mine.length)} />
        <Stat label="Campañas apoyadas" value={String(supported)} />
      </div>
      <ul className="card divide-y divide-slate-100">
        {mine.map((d) => {
          const v = byId.get(d.campaignId.toString());
          return (
            <li key={d.txHash} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link to={`/campanas/${d.campaignId.toString()}`} className="font-semibold text-brand-900 hover:text-brand-700">
                  {v?.campaign.name ?? `Campaña #${d.campaignId.toString()}`}
                </Link>
                <p className="text-xs text-slate-500">
                  {relativeTime(d.at)} · <TxLink hash={d.txHash} />
                </p>
              </div>
              <div className="flex items-center gap-4">
                {v && <StageBadge stage={stageOf(v)} />}
                <span className="text-right font-bold text-brand-900">{formatToken(d.gross)}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-brand-900">{value}</p>
    </div>
  );
}
