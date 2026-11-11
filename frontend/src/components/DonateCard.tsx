import { HeartHandshake, Info } from "lucide-react";
import { useMemo, useState } from "react";
import { TOKEN_SYMBOL } from "../config";
import { useBalance, useFeeBps, useQuote } from "../hooks/queries";
import { useTx } from "../hooks/useTx";
import { PriceNote, useCurrency, useFiatValue, usePrice } from "../lib/currency";
import { formatAmount, formatToken, parseAmount, toUnits } from "../lib/format";
import { locale, tr } from "../lib/i18n";
import { canDonate, milestoneOf, remaining } from "../lib/status";
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
  const toFiat = useFiatValue();
  const { fiat } = useCurrency();
  const price = usePrice();
  const [input, setInput] = useState("25");
  const [lastHash, setLastHash] = useState("");

  const gross = parseAmount(input);
  const quote = useQuote(gross);
  const feeBps = fee.data ?? 0;
  const maxGross = useMemo(() => grossForNet(remaining(view), feeBps), [view, feeBps]);
  const open = canDonate(view);
  const m = milestoneOf(view);

  let problem: string | null = null;
  if (gross === null) problem = tr("Escribe un monto válido.", "Enter a valid amount.");
  else if (gross <= 0n) problem = tr("El monto debe ser mayor a cero.", "The amount must be greater than zero.");
  else if (gross > maxGross)
    problem = tr(
      `A esta campaña le faltan ${formatToken(maxGross)} para su meta. Ese es el máximo que puedes donar.`,
      `This campaign needs ${formatToken(maxGross)} to reach its goal. That's the most you can donate.`,
    );
  else if (balance.data !== undefined && balance.data !== null && gross > balance.data)
    problem = tr("No tienes saldo suficiente en tu wallet.", "You don't have enough balance in your wallet.");

  /** Monto en XLM que equivale a una cantidad en la moneda elegida (para "donar en pesos"). */
  function setFromFiat(value: string) {
    const n = Number(value.replace(/[^\d.]/g, ""));
    if (!price.data || !Number.isFinite(n) || n <= 0) return;
    const rate = fiat === "COP" ? price.data.cop : price.data.usd;
    setInput((n / rate).toFixed(2).replace(".", locale() === "es-CO" ? "," : "."));
  }

  async function onDonate() {
    if (!gross || problem) return;
    const res = await run(
      (s) => donate(s, view.id, gross),
      { loading: tr("Enviando tu donación…", "Sending your donation…"), success: tr("¡Gracias! Tu donación quedó en custodia.", "Thank you! Your donation is in custody.") },
      { campaignId: view.id },
    );
    if (res) setLastHash(res.hash);
  }

  if (!open) {
    return (
      <div className="card p-6">
        <p className="font-semibold text-brand-900">{tr("Esta campaña no está recibiendo donaciones", "This campaign is not accepting donations")}</p>
        <p className="mt-1 text-sm text-slate-600">{tr("Revisa el estado de la campaña y su evidencia más abajo.", "Check the campaign status and its evidence below.")}</p>
      </div>
    );
  }

  const fiatOfInput = gross ? toFiat(gross) : null;

  return (
    <div className="card p-6">
      <h2 className="flex items-center gap-2 text-xl font-semibold">
        <HeartHandshake className="h-5 w-5 text-leaf-600" /> {tr("Haz tu aporte", "Make your gift")}
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
        <span className="label">{tr(`Monto en ${TOKEN_SYMBOL}`, `Amount in ${TOKEN_SYMBOL}`)}</span>
        <div className="relative">
          <input className="input !pr-16 text-lg font-semibold" inputMode="decimal" value={input} onChange={(e) => setInput(e.target.value)} aria-invalid={Boolean(problem)} />
          <span className="absolute top-1/2 right-4 -translate-y-1/2 text-sm font-semibold text-slate-400">{TOKEN_SYMBOL}</span>
        </div>
      </label>
      {fiatOfInput && <p className="mt-1.5 text-sm font-medium text-slate-600">≈ {fiatOfInput}</p>}
      {price.data && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer font-semibold text-brand-700">{tr(`Calcular desde ${fiat}`, `Calculate from ${fiat}`)}</summary>
          <label className="mt-2 block">
            <span className="sr-only">{tr(`Monto en ${fiat}`, `Amount in ${fiat}`)}</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder={fiat === "COP" ? tr("Ej.: 20000", "E.g. 20000") : tr("Ej.: 5", "E.g. 5")}
              onChange={(e) => setFromFiat(e.target.value)}
            />
          </label>
        </details>
      )}
      {problem && gross !== null && <p className="mt-2 text-xs font-medium text-rose-700">{problem}</p>}

      {/* Desglose: transparencia total sobre el fee */}
      <dl className="mt-4 space-y-1.5 rounded-2xl bg-sand p-4 text-sm">
        <Row label={tr("Tú donas", "You donate")} value={gross ? formatToken(quote.data?.gross_amount ?? gross) : "—"} />
        <Row
          label={tr(`Comisión de plataforma (${(feeBps / 100).toLocaleString(locale())}%)`, `Platform fee (${(feeBps / 100).toLocaleString(locale())}%)`)}
          value={gross ? formatToken(quote.data?.fee_amount ?? 0n) : "—"}
        />
        <div className="my-1 border-t border-slate-200" />
        <Row strong label={tr("Llega a la campaña", "Goes to the campaign")} value={gross ? formatToken(quote.data?.net_amount ?? gross) : "—"} />
        {gross && toFiat(quote.data?.net_amount ?? gross) && <p className="text-right text-xs text-slate-500">≈ {toFiat(quote.data?.net_amount ?? gross)}</p>}
      </dl>

      <div className="mt-5">
        {address ? (
          <button type="button" className="btn-primary w-full !py-3.5 text-base" disabled={pending || Boolean(problem)} onClick={onDonate}>
            {pending ? <Spinner className="h-4 w-4" /> : null} {tr("Donar", "Donate")} {gross && !problem ? formatAmount(gross) + " " + TOKEN_SYMBOL : ""}
          </button>
        ) : (
          <ConnectButton full />
        )}
      </div>
      {balance.data === null && address && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-amber-800">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />{" "}
          {tr(
            "Tu cuenta aún no tiene fondos en testnet. Ábrela desde el menú de tu cuenta con «Obtener XLM de prueba».",
            "Your account has no testnet funds yet. Open it from your account menu with “Get test XLM”.",
          )}
        </p>
      )}
      {lastHash && (
        <div className="mt-3 rounded-xl bg-leaf-50 p-3 text-sm text-leaf-900">
          {tr("Donación registrada.", "Donation recorded.")} <TxLink hash={lastHash}>{tr("Verla en el explorador", "View it in the explorer")}</TxLink>
        </div>
      )}
      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        {tr(
          `Tu aporte queda en la bóveda de la campaña. La fundación recibe el ${m}% al llegar a la meta y el ${100 - m}% restante cuando se valida su evidencia. Si la campaña no llega a la meta, puedes pedir tu reembolso.`,
          `Your gift stays in the campaign's vault. The nonprofit receives ${m}% when the goal is reached and the remaining ${100 - m}% once its evidence is validated. If the campaign doesn't reach its goal, you can claim a refund.`,
        )}
      </p>
      <div className="mt-2">
        <PriceNote />
      </div>
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
