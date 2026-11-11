import { HeartHandshake, RotateCcw } from "lucide-react";
import { Link } from "react-router-dom";
import { RequireWallet } from "../components/RequireWallet";
import { EmptyState, PageHeader, Spinner, StageBadge, TxLink } from "../components/ui";
import { donationsFrom, refundsFrom, useCampaigns, useEvents } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { Money, useFiatValue } from "../lib/currency";
import { formatToken, relativeTime } from "../lib/format";
import { tr } from "../lib/i18n";
import { milestoneOf, refundable, stageOf } from "../lib/status";
import { claimRefund, type CampaignView } from "../lib/stellar";
import { useWallet } from "../lib/wallet";

export function MyDonations() {
  return (
    <>
      <PageHeader eyebrow={tr("Tu impacto", "Your impact")} title={tr("Mis donaciones", "My donations")}>
        {tr(
          "Sigue en qué etapa está cada campaña que apoyaste, verifica cada movimiento en el explorador y pide tu reembolso si una campaña no llegó a la meta.",
          "Follow each campaign you supported, verify every movement in the explorer and claim a refund if a campaign didn't reach its goal.",
        )}
      </PageHeader>
      <section className="container-page py-10">
        <RequireWallet title={tr("Conecta tu wallet", "Connect your wallet")} text={tr("Tus donaciones se identifican por la dirección de tu wallet.", "Your donations are identified by your wallet address.")}>
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
  const toFiat = useFiatValue();
  const mine = donationsFrom(events.data).filter((d) => d.donor === address);
  const myRefunds = refundsFrom(events.data).filter((r) => r.donor === address);
  const total = mine.reduce((a, d) => a + d.gross, 0n);
  const byId = new Map((campaigns.data ?? []).map((v) => [v.id.toString(), v]));
  const supported = new Set(mine.map((d) => d.campaignId.toString())).size;

  // Aporte neto pendiente por campaña (donado − reembolsado) para saber dónde se puede pedir reembolso.
  const pending = new Map<string, bigint>();
  for (const d of mine) pending.set(d.campaignId.toString(), (pending.get(d.campaignId.toString()) ?? 0n) + d.net);
  for (const r of myRefunds) pending.set(r.campaignId.toString(), (pending.get(r.campaignId.toString()) ?? 0n) - r.amount);
  const refunds = [...pending.entries()]
    .map(([id, amount]) => ({ id, amount, view: byId.get(id) }))
    .filter((x) => x.amount > 0n && x.view && refundable(x.view));

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
        title={tr("Aún no vemos donaciones", "No donations yet")}
        action={
          <Link to="/campanas" className="btn-primary">
            {tr("Explorar campañas", "Explore campaigns")}
          </Link>
        }
      >
        {tr("Aquí aparecen todas las donaciones hechas desde esta cuenta (registradas en Stellar).", "All donations made from this account (recorded on Stellar) show up here.")}
      </EmptyState>
    );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label={tr("Donado", "Donated")} value={formatToken(total)} sub={toFiat(total)} />
        <Stat label={tr("Donaciones", "Donations")} value={String(mine.length)} />
        <Stat label={tr("Campañas apoyadas", "Campaigns supported")} value={String(supported)} />
      </div>

      {refunds.length > 0 && (
        <div className="card border-amber-200 bg-amber-50/60 p-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-amber-950">
            <RotateCcw className="h-5 w-5" /> {tr("Puedes recuperar tu aporte", "You can get your gift back")}
          </h2>
          <p className="mt-1 text-sm text-amber-900">
            {tr(
              "Estas campañas no llegaron a la meta, se cancelaron o están pausadas. El contrato te devuelve lo que aportaste.",
              "These campaigns didn't reach their goal, were cancelled or are paused. The contract returns what you gave.",
            )}
          </p>
          <ul className="mt-4 space-y-3">
            {refunds.map((r) => (
              <RefundRow key={r.id} view={r.view!} amount={r.amount} />
            ))}
          </ul>
        </div>
      )}

      <ul className="card divide-y divide-slate-100">
        {mine.map((d) => {
          const v = byId.get(d.campaignId.toString());
          return (
            <li key={d.txHash} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <Link to={`/campanas/${d.campaignId.toString()}`} className="font-semibold text-brand-900 hover:text-brand-700">
                  {v?.campaign.name ?? `${tr("Campaña", "Campaign")} #${d.campaignId.toString()}`}
                </Link>
                <p className="text-xs text-slate-500">
                  {relativeTime(d.at)} · <TxLink hash={d.txHash} />
                </p>
              </div>
              <div className="flex items-center gap-4">
                {v && <StageBadge stage={stageOf(v)} milestone={milestoneOf(v)} />}
                <Money units={d.gross} className="text-right font-bold text-brand-900" />
              </div>
            </li>
          );
        })}
        {myRefunds.map((r) => (
          <li key={r.txHash} className="flex flex-col gap-3 bg-slate-50/60 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-semibold text-slate-700">
                {tr("Reembolso", "Refund")} · {byId.get(r.campaignId.toString())?.campaign.name ?? `#${r.campaignId.toString()}`}
              </p>
              <p className="text-xs text-slate-500">
                {relativeTime(r.at)} · <TxLink hash={r.txHash} />
              </p>
            </div>
            <span className="text-right font-bold text-leaf-700">+{formatToken(r.amount)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RefundRow({ view, amount }: { view: CampaignView; amount: bigint }) {
  const { run, pending } = useTx();
  return (
    <li className="flex flex-col gap-3 rounded-xl bg-white p-4 ring-1 ring-amber-200 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <Link to={`/campanas/${view.id.toString()}`} className="font-semibold text-brand-900 hover:text-brand-700">
          {view.campaign.name}
        </Link>
        <div className="mt-1">
          <StageBadge stage={stageOf(view)} milestone={milestoneOf(view)} />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Money units={amount} className="text-right font-bold text-brand-900" />
        <button
          type="button"
          className="btn-primary !py-2"
          disabled={pending}
          onClick={() =>
            run((s) => claimRefund(s, view.id), { loading: tr("Pidiendo tu reembolso…", "Claiming your refund…"), success: tr("Reembolso recibido en tu wallet.", "Refund received in your wallet.") }, { campaignId: view.id })
          }
        >
          {pending ? <Spinner className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />} {tr("Pedir reembolso", "Claim refund")}
        </button>
      </div>
    </li>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</p>
      <p className="mt-1 font-display text-2xl font-semibold text-brand-900">{value}</p>
      {sub && <p className="text-xs text-slate-500">≈ {sub}</p>}
    </div>
  );
}
