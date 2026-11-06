import type { CampaignView } from "./stellar";

export type Stage = "draft" | "active" | "expired" | "funded" | "review" | "completed" | "cancelled";

export const STAGE_INFO: Record<Stage, { label: string; tone: string; hint: string }> = {
  draft: {
    label: "Por activar",
    tone: "bg-slate-100 text-slate-700 ring-slate-200",
    hint: "La fundación aún no abre la bóveda, así que no recibe donaciones.",
  },
  active: {
    label: "Recibiendo donaciones",
    tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
    hint: "Las donaciones quedan en custodia hasta llegar a la meta.",
  },
  expired: {
    label: "Cerrada sin llegar a la meta",
    tone: "bg-amber-50 text-amber-800 ring-amber-200",
    hint: "Pasó la fecha límite antes de alcanzar la meta.",
  },
  funded: {
    label: "Meta alcanzada",
    tone: "bg-sky-50 text-sky-800 ring-sky-200",
    hint: "Se liberó el 50% a la fundación. Falta que suba la evidencia.",
  },
  review: {
    label: "Evidencia en revisión",
    tone: "bg-indigo-50 text-indigo-800 ring-indigo-200",
    hint: "La fundación subió evidencia. El admin la revisa para liberar el 50% restante.",
  },
  completed: {
    label: "Completada",
    tone: "bg-brand-50 text-brand-800 ring-brand-200",
    hint: "Se liberó el 100% de los fondos con evidencia verificada.",
  },
  cancelled: {
    label: "Cancelada",
    tone: "bg-rose-50 text-rose-800 ring-rose-200",
    hint: "La fundación canceló esta campaña.",
  },
};

export function stageOf(v: CampaignView, nowSec = Math.floor(Date.now() / 1000)): Stage {
  const { campaign, vault } = v;
  if (campaign.status.tag === "Cancelled") return "cancelled";
  if (!vault) return "draft";
  if (vault.final_release_done) return "completed";
  if (vault.initial_release_done) return vault.evidence_hash ? "review" : "funded";
  if (Number(vault.deadline) < nowSec) return "expired";
  return "active";
}

/** Solo se puede donar a campañas activas, con bóveda, antes de la fecha y sin llegar a la meta. */
export function canDonate(v: CampaignView): boolean {
  return stageOf(v) === "active";
}

export function raised(v: CampaignView): bigint {
  return v.vault?.total_deposited ?? 0n;
}

export function remaining(v: CampaignView): bigint {
  const r = v.campaign.target_amount - raised(v);
  return r > 0n ? r : 0n;
}
