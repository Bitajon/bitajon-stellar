import { BadgeCheck, FileCheck2, HandCoins, LockKeyhole, Target } from "lucide-react";
import { tr } from "../lib/i18n";

const steps = () => [
  {
    icon: BadgeCheck,
    title: tr("Fundaciones verificadas", "Verified nonprofits"),
    text: tr(
      "Cada fundación se registra con su NIT y la huella de su RUT. Solo puede crear campañas cuando el equipo la aprueba.",
      "Each nonprofit registers with its tax ID (NIT) and the fingerprint of its RUT. It can only create campaigns once the team approves it.",
    ),
  },
  {
  icon: Target,
  title: tr("Campañas con un fin concreto", "Campaigns with a clear purpose"),
  text: tr(
    "Kits escolares, Navidad, la fiesta del niño: cada campaña tiene meta, fecha límite y lugar. BITAJÓN no cobra comisiones a las fundaciones ni a las ONG e invita a los donantes a dar una comisión tipo propina para mantener el funcionamiento de la plataforma.",
    "School kits, Christmas, Children's Day: every campaign has a goal, a deadline and a place. BITAJÓN does not charge nonprofits or NGOs any fees and invites donors to give a tip-style fee to keep the platform running.",
  ),
},
  {
    icon: LockKeyhole,
    title: tr("Tu aporte queda en custodia", "Your gift is held in custody"),
    text: tr(
      "La donación no va a una cuenta bancaria: queda guardada en un contrato inteligente que nadie puede mover a su antojo.",
      "Your donation doesn't go to a bank account: it's held in a smart contract that nobody can move at will.",
    ),
  },

  {
  icon: HandCoins,
  title: tr("Primer desembolso al llegar a la meta", "First payout when the goal is reached"),
  text: tr(
      "Cuando la campaña alcanza su meta, el contrato libera automáticamente el porcentaje que eligió la fundación (por ejemplo 50%). Si no la alcanza, tu aporte no queda atrapado: puedes recuperarlo y, si quieres, destinarlo a otra causa. Nadie puede desviarlo: solo puede ir a la fundación según las reglas del contrato o volver a ti.",
      "When the campaign reaches its goal, the contract automatically releases the percentage the nonprofit chose (for example 50%). If it doesn't, your gift isn't stuck: you can get it back and, if you wish, give it to another cause. Nobody can divert it: it can only go to the nonprofit under the contract's rules or back to you.",
    ),
  },
{
  icon: FileCheck2,
  title: tr("El resto contra evidencia", "The rest against evidence"),
  text: tr(
    "La fundación sube fotos o facturas. Al validarlas, se libera el resto. La huella de la evidencia queda pública y cualquiera puede comprobarla.",
    "The nonprofit uploads photos or invoices. Once validated, the rest is released. The evidence fingerprint is public and anyone can check it.",
  ),
},
];

export function HowItWorks({ compact = false }: { compact?: boolean }) {
  return (
    <ol className={`grid gap-4 ${compact ? "sm:grid-cols-2 lg:grid-cols-5" : "md:grid-cols-2 lg:grid-cols-5"}`}>
      {steps().map((s, i) => (
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
