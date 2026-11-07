import { ArrowRight, Building2, Eye, HeartHandshake, ShieldCheck, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { CampaignCard } from "../components/CampaignCard";
import { HowItWorks } from "../components/HowItWorks";
import { EmptyState, ErrorBox, ProgressBar, SkeletonCard } from "../components/ui";
import { useCampaigns } from "../hooks/queries";
import { formatToken, percent } from "../lib/format";
import { raised, stageOf } from "../lib/status";

export function Home() {
  const campaigns = useCampaigns();
  const list = campaigns.data ?? [];
  const featured = [...list]
    .filter((v) => stageOf(v) === "active")
    .concat(list.filter((v) => stageOf(v) !== "active" && stageOf(v) !== "cancelled"))
    .slice(0, 3);
  const totalRaised = list.reduce((acc, v) => acc + raised(v), 0n);
  const completed = list.filter((v) => stageOf(v) === "completed").length;
  const hero = featured[0];

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden bg-sand">
        <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-leaf-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-96 w-96 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="container-page relative grid items-center gap-12 py-16 sm:py-20 lg:grid-cols-[1.1fr_1fr] lg:py-24">
          <div className="animate-rise">
            <p className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-semibold text-leaf-800 shadow-soft ring-1 ring-leaf-100">
              <Sprout className="h-3.5 w-3.5" /> Donaciones con trazabilidad en Stellar
            </p>
            <h1 className="mt-5 text-4xl leading-[1.05] font-semibold sm:text-5xl lg:text-6xl">
              Dona con la certeza de que <span className="text-ribbon">llega a donde debe.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              Apoya campañas de fundaciones colombianas: kits escolares, Navidad, la fiesta del niño. Tu aporte queda en custodia y la
              fundación solo recibe el total cuando demuestra en qué lo usó.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/campanas" className="btn-primary !px-6 !py-3 text-base">
                Ver campañas <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/fundacion" className="btn-outline !px-6 !py-3 text-base">
                <Building2 className="h-4 w-4" /> Soy una fundación
              </Link>
            </div>
            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              <Stat label="Campañas" value={campaigns.isLoading ? "…" : String(list.length)} />
              <Stat label="Recaudado" value={campaigns.isLoading ? "…" : formatToken(totalRaised, 0)} />
              <Stat label="Completadas" value={campaigns.isLoading ? "…" : String(completed)} />
            </dl>
          </div>

          {/* Tarjeta ilustrativa: usa la campaña destacada real si existe */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <img src="/brand/mark.png" alt="" className="pointer-events-none absolute -top-10 -right-6 w-48 opacity-90 sm:w-64" />
            <div className="card relative overflow-hidden p-6 shadow-lift">
              <p className="eyebrow">{hero ? "Campaña destacada" : "Así se ve una campaña"}</p>
              <h3 className="mt-2 text-2xl font-semibold">{hero ? hero.campaign.name : "Tu campaña podría estar aquí"}</h3>
              <p className="mt-1 text-sm text-slate-500">{hero ? hero.campaign.location : "Meta, fecha límite y evidencia pública"}</p>
              <div className="mt-6">
                <ProgressBar value={hero ? percent(raised(hero), hero.campaign.target_amount) : 64} size="lg" />
              </div>
              <div className="mt-3 flex justify-between text-sm">
                <span className="font-bold text-brand-900">{hero ? formatToken(raised(hero)) : "Recaudado"}</span>
                <span className="text-slate-500">{hero ? `de ${formatToken(hero.campaign.target_amount)}` : "Meta"}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                <Check text="Fondos en custodia on-chain" />
                <Check text="50% se libera al llegar a la meta" />
                <Check text="50% restante contra evidencia" />
              </ul>
              {hero && (
                <Link to={`/campanas/${hero.id.toString()}`} className="btn-navy mt-6 w-full">
                  Donar a esta campaña
                </Link>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CONFIANZA */}
      <section className="border-y border-slate-200/70 bg-white">
        <div className="container-page grid gap-6 py-8 sm:grid-cols-3">
          <Trust icon={<ShieldCheck className="h-5 w-5" />} title="Nadie toca tu aporte" text="Un contrato inteligente lo custodia, no una persona." />
          <Trust icon={<Eye className="h-5 w-5" />} title="Todo es verificable" text="Cada donación y liberación queda en el explorador público." />
          <Trust icon={<HeartHandshake className="h-5 w-5" />} title="Resultados, no promesas" text="El último pago depende de la evidencia de la fundación." />
        </div>
      </section>

      {/* CAMPAÑAS */}
      <section className="container-page py-16 sm:py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="eyebrow">Campañas</p>
            <h2 className="mt-2 text-3xl font-semibold sm:text-4xl">Causas que puedes apoyar hoy</h2>
          </div>
          <Link to="/campanas" className="btn-ghost">
            Ver todas <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8">
          {campaigns.isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : campaigns.isError ? (
            <ErrorBox error={campaigns.error} onRetry={() => campaigns.refetch()} />
          ) : featured.length === 0 ? (
            <EmptyState
              icon={<Sprout className="h-6 w-6" />}
              title="Todavía no hay campañas"
              action={
                <Link to="/fundacion" className="btn-primary">
                  Registrar mi fundación
                </Link>
              }
            >
              Cuando una fundación aprobada publique su primera campaña, aparecerá aquí.
            </EmptyState>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.map((v) => (
                <CampaignCard key={v.id.toString()} view={v} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CÓMO FUNCIONA */}
      <section className="bg-sand py-16 sm:py-20">
        <div className="container-page">
          <p className="eyebrow">Cómo funciona</p>
          <h2 className="mt-2 max-w-2xl text-3xl font-semibold sm:text-4xl">La confianza se construye mostrando resultados</h2>
          <div className="mt-10">
            <HowItWorks />
          </div>
        </div>
      </section>

      {/* FUNDACIONES */}
      <section className="container-page py-16 sm:py-20">
        <div className="ribbon-gradient relative overflow-hidden rounded-[2rem] px-6 py-12 text-white sm:px-12">
          <svg className="absolute inset-0 h-full w-full opacity-15" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden>
            <path d="M-40 260 C 160 80, 320 80, 460 190 S 720 320, 840 60" fill="none" stroke="white" strokeWidth="22" strokeLinecap="round" />
          </svg>
          <div className="relative max-w-2xl">
            <h2 className="text-3xl font-semibold text-white sm:text-4xl">¿Tu fundación necesita recaudar para una campaña?</h2>
            <p className="mt-3 text-white/85">
              Regístrate con tu NIT, espera la aprobación y publica campañas que tus donantes pueden seguir en tiempo real. Sin
              intermediarios y con un registro público de cada peso.
            </p>
            <Link to="/fundacion" className="btn mt-6 bg-white !px-6 !py-3 text-base text-brand-800 hover:bg-brand-50">
              Empezar como fundación <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</dt>
      <dd className="mt-1 font-display text-2xl font-semibold text-brand-900">{value}</dd>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-3">
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-leaf-100 text-leaf-700">
        <ShieldCheck className="h-3.5 w-3.5" />
      </span>
      <span className="text-slate-700">{text}</span>
    </li>
  );
}

function Trust({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <div className="flex gap-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">{icon}</span>
      <div>
        <p className="font-semibold text-brand-900">{title}</p>
        <p className="text-sm text-slate-600">{text}</p>
      </div>
    </div>
  );
}
