import { HeartHandshake, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { TOKEN_SYMBOL } from "../config";
import { useBalance, useFeeBps, useQuote } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { formatAmount, formatToken, parseAmount, toUnits } from "../lib/format";
import { canDonate, remaining } from "../lib/status";
import { donate, grossForNet, type CampaignView } from "../lib/stellar";
import { useWallet } from "../lib/wallet";
import { ConnectButton } from "./ConnectButton";
import { Spinner, TxLink } from "./ui";

const PRESETS = [10, 25, 50, 100];

export function DonateCard({ view }: { view: CampaignView }) {
  const { address } = useWallet();
  const fee = useFeeBps();
  const balance = useBalance(address);
  const { run, pending } = useTx();
  const [input, setInput] = useState("25");
  const [lastHash, setLastHash] = useState("");

  const gross = parseAmount(input);
  const quote = useQuote(gross);
  const feeBps = fee.data ?? 0;
  const maxGross = useMemo(() => grossForNet(remaining(view), feeBps), [view, feeBps]);
  const open = canDonate(view);

  let problem: string | null = null;
  if (gross === null) problem = "Escribe un monto válido.";
  else if (gross <= 0n) problem = "El monto debe ser mayor a cero.";
  else if (gross > maxGross) problem = `A esta campaña le faltan ${formatToken(maxGross)} para su meta. Ese es el máximo que puedes donar.`;
  else if (balance.data !== undefined && balance.data !== null && gross > balance.data)
    problem = "No tienes saldo suficiente en tu wallet.";

  async function onDonate() {
    if (!gross || problem) return;
    const res = await run((s) => donate(s, view.id, gross), { loading: "Enviando tu donación…", success: "¡Gracias! Tu donación quedó en custodia." }, { campaignId: view.id });
    if (res) setLastHash(res.hash);
  }

  if (!open) {
    return (
      <div className="card p-6">
        <p className="font-semibold text-brand-900">Esta campaña no está recibiendo donaciones</p>
        <p className="mt-1 text-sm text-slate-600">Revisa el estado de la campaña y su evidencia más abajo.</p>
      </div>
    );
  }

  return (
    <div className="card p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <HeartHandshake className="h-5 w-5 text-leaf-600" /> Haz tu aporte
      </h2>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {PRESETS.map((p) => {
          const active = gross === toUnits(p);
          return (
            <button
              key={p}
              type="button"
              onClick={() => setInput(String(p))}
              className={`rounded-xl py-2.5 text-sm font-bold transition ${active ? "bg-leaf-600 text-white shadow-soft" : "bg-leaf-50 text-leaf-800 hover:bg-leaf-100"}`}
            >
              {p}
            </button>
          );
        })}
      </div>
      <label className="mt-4 block">
        <span className="label">Monto en {TOKEN_SYMBOL}</span>
        <div className="relative">
          <input className="input !pr-16 text-lg font-semibold" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-invalid={Boolean(problem)} />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-slate-400">{TOKEN_SYMBOL}</span>
        </div>
      </label>
      {problem && gross !== null && <p className="mt-2 text-xs font-medium text-rose-700">{problem}</p>}

      {/* Desglose: transparencia total sobre el fee */}
      <dl className="mt-4 space-y-1.5 rounded-2xl bg-sand p-4 text-sm">
        <Row label="Tú donas" value={gross ? formatToken(quote.data?.gross_amount ?? gross) : "—"} />
        <Row label={`Comisión de plataforma (${(feeBps / 100).toLocaleString("es-CO")}%)`} value={gross ? formatToken(quote.data?.fee_amount ?? 0n) : "—"} />
        <div className="my-1 border-t border-slate-200" />
        <Row strong label="Llega a la campaña" value={gross ? formatToken(quote.data?.net_amount ?? gross) : "—"} />
      </dl>

      <div className="mt-5">
        {address ? (
          <button type="button" className="btn-primary w-full !py-3.5 text-base" disabled={pending || Boolean(problem)} onClick={onDonate}>
            {pending ? <Spinner className="h-4 w-4" /> : null} Donar {gross && !problem ? formatAmount(gross) + " " + TOKEN_SYMBOL : ""}
          </button>
        ) : (
          <ConnectButton full />
        )}
      </div>
      {balance.data === null && address && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Tu cuenta aún no tiene fondos en testnet. Ábrela desde el menú de tu wallet con «Obtener XLM de prueba».
        </p>
      )}
      {lastHash && (
        <div className="mt-3 rounded-xl bg-leaf-50 p-3 text-sm text-leaf-900">
          Donación registrada. <TxLink hash={lastHash}>Verla en el explorador</TxLink>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Tu aporte queda en la bóveda de la campaña. La fundación recibe el 50% al llegar a la meta y el otro 50% cuando se valida su evidencia.
      </p>
    </div>
  );
}

function Row({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className={strong ? "font-semibold text-brand-900" : "text-slate-600"}>{label}</dt>
      <dd className={strong ? "font-bold text-leaf-700" : "font-medium text-slate-800"}>{value}</dd>
    </div>
  );
}
