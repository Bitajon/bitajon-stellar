import { Check } from "lucide-react";
import type { Milestone } from "../hooks/queries";
import { relativeTime } from "../lib/format";
import { tr } from "../lib/i18n";
import { milestoneOf } from "../lib/status";
import type { CampaignView } from "../lib/stellar";
import { TxLink } from "./ui";

type Step = { key: Milestone["kind"]; title: string; text: string; done: boolean };

export function MilestoneTrack({ view, milestones }: { view: CampaignView; milestones: Milestone[] }) {
  const v = view.vault;
  const m = milestoneOf(view);
  const steps: Step[] = [
    {
      key: "vault",
      title: tr("Bóveda abierta", "Vault opened"),
      text: tr("La campaña empezó a recibir donaciones en custodia.", "The campaign started receiving donations in custody."),
      done: Boolean(v),
    },
    {
      key: "initial",
      title: tr(`Meta alcanzada · ${m}% liberado`, `Goal reached · ${m}% released`),
      text: tr(`El contrato envió automáticamente el ${m}% a la fundación.`, `The contract automatically sent ${m}% to the nonprofit.`),
      done: Boolean(v?.initial_release_done),
    },
    {
      key: "evidence",
      title: tr("Evidencia publicada", "Evidence published"),
      text: tr("La fundación registró la huella de sus fotos o facturas.", "The nonprofit registered the fingerprint of its photos or invoices."),
      done: Boolean(v?.evidence_hash),
    },
    {
      key: "final",
      title: tr("100% liberado", "100% released"),
      text: tr(`El verificador validó la evidencia y se liberó el ${100 - m}% restante.`, `The verifier validated the evidence and the remaining ${100 - m}% was released.`),
      done: Boolean(v?.final_release_done),
    },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="relative space-y-6 pl-10">
      <span className="absolute top-2 bottom-2 left-[0.95rem] w-0.5 bg-slate-200" aria-hidden />
      {steps.map((s, i) => {
        const ev = milestones.find((x) => x.kind === s.key);
        const isCurrent = i === current;
        return (
          <li key={s.key} className="relative">
            <span
              className={`absolute top-0 -left-10 grid h-8 w-8 place-items-center rounded-full ring-4 ring-white ${
                s.done ? "bg-leaf-600 text-white" : isCurrent ? "bg-brand-700 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {s.done ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{i + 1}</span>}
            </span>
            <p className={`font-semibold ${s.done || isCurrent ? "text-brand-900" : "text-slate-500"}`}>{s.title}</p>
            <p className="text-sm text-slate-600">{s.text}</p>
            {ev && (
              <p className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
                {relativeTime(ev.at)} <TxLink hash={ev.txHash} />
              </p>
            )}
          </li>
        );
      })}
      {v?.paused && (
        <li className="relative rounded-xl bg-orange-50 p-3 text-sm text-orange-900">
          {tr("La campaña está pausada por el admin. Las donaciones están detenidas y se pueden pedir reembolsos.", "The campaign is paused by the admin. Donations are stopped and refunds can be claimed.")}
        </li>
      )}
    </ol>
  );
}
