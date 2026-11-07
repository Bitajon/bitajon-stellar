import { CalendarClock, MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useCampaignMetaMap, useNonprofitMeta, useProfile } from "../hooks/queries";
import { BUCKETS, publicUrl } from "../lib/offchain";
import { formatToken, percent, timeLeftLabel } from "../lib/format";
import { raised, stageOf } from "../lib/status";
import type { CampaignView } from "../lib/stellar";
import { CampaignCover } from "./CampaignCover";
import { ProgressBar, StageBadge } from "./ui";

export function CampaignCard({ view }: { view: CampaignView }) {
  const { campaign } = view;
  const stage = stageOf(view);
  const got = raised(view);
  const pct = percent(got, campaign.target_amount);
  const profile = useProfile(campaign.nonprofit);
  const nonprofitMeta = useNonprofitMeta(campaign.nonprofit);
  const metaMap = useCampaignMetaMap();
  const cover = publicUrl(BUCKETS.media, metaMap.data?.get(view.id.toString())?.cover_path);

  return (
    <Link
      to={`/campanas/${view.id.toString()}`}
      className="card group flex flex-col overflow-hidden transition duration-300 hover:-translate-y-1 hover:shadow-lift"
    >
      <CampaignCover name={campaign.name} description={campaign.description} imageUrl={cover} />
      <div className="flex flex-1 flex-col p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <StageBadge stage={stage} />
          <span className="text-xs font-medium text-slate-400">#{view.id.toString()}</span>
        </div>
        <h3 className="line-clamp-2 text-lg leading-snug font-semibold group-hover:text-brand-700">{campaign.name}</h3>
        <p className="mt-1 line-clamp-1 text-sm text-slate-500">
          {nonprofitMeta.data?.display_name || profile.data?.legal_name || "Fundación verificada"}
        </p>
        <div className="mt-4 flex-1" />
        <ProgressBar value={pct} />
        <div className="mt-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-base font-bold text-brand-900">{formatToken(got)}</p>
            <p className="text-xs text-slate-500">de {formatToken(campaign.target_amount)}</p>
          </div>
          <p className="text-sm font-bold text-leaf-700">{Math.floor(pct)}%</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-xs text-slate-500">
          <span className="inline-flex items-center gap-1">
            <MapPin className="h-3.5 w-3.5" /> {campaign.location || "Colombia"}
          </span>
          <span className="inline-flex items-center gap-1">
            <CalendarClock className="h-3.5 w-3.5" /> {timeLeftLabel(campaign.deadline)}
          </span>
        </div>
      </div>
    </Link>
  );
}
