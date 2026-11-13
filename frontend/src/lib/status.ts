import { tr } from "./i18n";
import type { CampaignView } from "./stellar";

export type Stage = "draft" | "active" | "paused" | "expired" | "funded" | "review" | "completed" | "cancelled";

export function stageInfo(stage: Stage, milestone = 50): { label: string; tone: string; hint: string } {
  const rest = 100 - milestone;
  switch (stage) {
    case "draft":
      return {
        label: tr("Por activar", "Not active yet"),
        tone: "bg-slate-100 text-slate-700 ring-slate-200",
        hint: tr("La fundación aún no abre la bóveda, así que no recibe donaciones.", "The nonprofit hasn't opened the vault yet, so it can't receive donations."),
      };
    case "active":
      return {
        label: tr("Recibiendo donaciones", "Accepting donations"),
        tone: "bg-emerald-50 text-emerald-800 ring-emerald-200",
        hint: tr("Las donaciones quedan en custodia hasta llegar a la meta.", "Donations are held in custody until the goal is reached."),
      };
    case "paused":
      return {
        label: tr("Pausada", "Paused"),
        tone: "bg-orange-50 text-orange-800 ring-orange-200",
        hint: tr(
          "El admin pausó la campaña mientras revisa algo. No recibe donaciones y quienes donaron pueden pedir su reembolso.",
          "The admin paused this campaign while reviewing something. It can't receive donations and donors can claim a refund.",
        ),
      };
    case "expired":
      return {
        label: tr("Cerrada sin llegar a la meta", "Closed without reaching the goal"),
        tone: "bg-amber-50 text-amber-800 ring-amber-200",
        hint: tr("Pasó la fecha límite antes de alcanzar la meta. Quienes donaron pueden pedir su reembolso.", "The deadline passed before reaching the goal. Donors can claim a refund."),
      };
    case "funded":
      return {
        label: tr("Meta alcanzada", "Goal reached"),
        tone: "bg-sky-50 text-sky-800 ring-sky-200",
        hint: tr(`Se liberó el ${milestone}% a la fundación. Falta que suba la evidencia.`, `${milestone}% was released to the nonprofit. Waiting for its evidence.`),
      };
    case "review":
      return {
        label: tr("Evidencia en revisión", "Evidence under review"),
        tone: "bg-indigo-50 text-indigo-800 ring-indigo-200",
        hint: tr(
          `La fundación subió evidencia. El verificador la revisa para liberar el ${rest}% restante.`,
          `The nonprofit submitted evidence. The verifier reviews it to release the remaining ${rest}%.`,
        ),
      };
    case "completed":
      return {
        label: tr("Completada", "Completed"),
        tone: "bg-brand-50 text-brand-800 ring-brand-200",
        hint: tr("Se liberó el 100% de los fondos con evidencia verificada.", "100% of the funds were released with verified evidence."),
      };
    case "cancelled":
      return {
        label: tr("Cancelada", "Cancelled"),
        tone: "bg-rose-50 text-rose-800 ring-rose-200",
        hint: tr("La fundación canceló esta campaña. Quienes donaron pueden pedir su reembolso.", "The nonprofit cancelled this campaign. Donors can claim a refund."),
      };
  }
}

export function stageOf(v: CampaignView, nowSec = Math.floor(Date.now() / 1000)): Stage {
  const { campaign, vault } = v;
  if (campaign.status.tag === "Cancelled") return "cancelled";
  if (!vault) return "draft";
  if (vault.final_release_done) return "completed";
  if (vault.initial_release_done) return vault.evidence_hash ? "review" : "funded";
  if (vault.paused) return "paused";
  if (Number(vault.deadline) < nowSec) return "expired";
  return "active";
}

/** Solo se puede donar a campañas activas, con bóveda, antes de la fecha y sin llegar a la meta. */
export function canDonate(v: CampaignView): boolean {
  return stageOf(v) === "active";
}

/** Los donantes pueden pedir reembolso si la campaña se canceló, expiró o fue pausada antes del primer desembolso. */
export function refundable(v: CampaignView): boolean {
  if (!v.vault || v.vault.initial_release_done) return false;
  const s = stageOf(v);
  return s === "cancelled" || s === "expired" || s === "paused";
}

export function raised(v: CampaignView): bigint {
  return v.vault?.total_deposited ?? 0n;
}

export function remaining(v: CampaignView): bigint {
  const r = v.campaign.target_amount - raised(v);
  return r > 0n ? r : 0n;
}

export function milestoneOf(v: CampaignView): number {
  return Number(v.campaign.milestone_percentage ?? 50);
}
