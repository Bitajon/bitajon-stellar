import { Check } from "lucide-react";
import { MILESTONE_PERCENTAGE } from "../config";
import type { Milestone } from "../hooks/queries";
import { relativeTime } from "../lib/format";
import type { CampaignView } from "../lib/stellar";
import { TxLink } from "./ui";

type Step = { key: Milestone["kind"]; title: string; text: string; done: boolean };

export function MilestoneTrack({ view, milestones }: { view: CampaignView; milestones: Milestone[] }) {
  const v = view.vault;
  const steps: Step[] = [
    { key: "vault", title: "Bóveda abierta", text: "La campaña empezó a recibir donaciones en custodia.", done: Boolean(v) },
    {
      key: "initial",
      title: `Meta alcanzada · ${MILESTONE_PERCENTAGE}% liberado`,
      text: "El contrato envió automáticamente la primera mitad a la fundación.",
      done: Boolean(v?.initial_release_done),
    },
    { key: "evidence", title: "Evidencia publicada", text: "La fundación registró la huella de sus fotos o facturas.", done: Boolean(v?.evidence_hash) },
    { key: "final", title: "100% liberado", text: "El admin validó la evidencia y se liberó el resto.", done: Boolean(v?.final_release_done) },
  ];
  const current = steps.findIndex((s) => !s.done);

  return (
    <ol className="relative space-y-6 pl-10">
      <span className="absolute top-2 bottom-2 left-[0.95rem] w-0.5 bg-slate-200" aria-hidden />
      {steps.map((s, i) => {
        const ev = milestones.find((m) => m.kind === s.key);
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
    </ol>
  );
}
