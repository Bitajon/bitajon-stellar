import { BadgeCheck, FileCheck2, HandCoins, LockKeyhole, Target } from "lucide-react";

const STEPS = [
  {
    icon: BadgeCheck,
    title: "Fundaciones verificadas",
    text: "Cada fundación se registra con su NIT y la huella de su RUT. Solo puede crear campañas cuando el equipo la aprueba.",
  },
  {
    icon: Target,
    title: "Campañas con un fin concreto",
    text: "Kits escolares, Navidad, la fiesta del niño: cada campaña tiene meta, fecha límite y lugar.",
  },
  {
    icon: LockKeyhole,
    title: "Tu aporte queda en custodia",
    text: "La donación no va a una cuenta bancaria: queda guardada en un contrato inteligente que nadie puede mover a su antojo.",
  },
  {
    icon: HandCoins,
    title: "50% al llegar a la meta",
    text: "Cuando la campaña alcanza su meta, el contrato libera automáticamente la mitad para que la fundación empiece.",
  },
  {
    icon: FileCheck2,
    title: "50% contra evidencia",
    text: "La fundación sube fotos o facturas. Al validarlas, se libera el resto. La huella de la evidencia queda pública.",
  },
];

export function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-5"}`}>
      {STEPS.map((s, i) => (
        <li key={s.title} className="card relative p-5">
          <div className="flex items-center justify-between">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand-50 to-leaf-50 text-brand-700 ring-1 ring-brand-100">
              <s.icon className="h-5 w-5" />
            </span>
            <span className="font-display text-3xl font-semibold text-slate-200">{i + 1}</span>
          </div>
          <h3 className="mt-4 text-base font-semibold">{s.title}</h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{s.text}</p>
        </li>
      ))}
    </ol>
  );
}
