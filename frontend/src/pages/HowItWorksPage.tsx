import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { HowItWorks } from "../components/HowItWorks";
import { AddressLink, PageHeader } from "../components/ui";
import { CONTRACT_LABELS, CONTRACTS, GOVERNANCE_ID, MILESTONE_MAX, MILESTONE_RECOMMENDED, TOKEN_SYMBOL } from "../config";
import { useFeeBps } from "../hooks/queries";
import { PriceNote } from "../lib/currency";
import { locale, tr } from "../lib/i18n";

const faq = () => [
  {
    q: tr("¿Qué es Stellar y por qué se usa aquí?", "What is Stellar and why is it used here?"),
    a: tr(
      "Stellar es una red pública de pagos. Cada donación, liberación y evidencia queda registrada en ella y cualquiera la puede revisar en el explorador. Las comisiones por transacción son de fracciones de centavo.",
      "Stellar is a public payments network. Every donation, release and piece of evidence is recorded there and anyone can check it in the explorer. Transaction fees are fractions of a cent.",
    ),
  },
  {
    q: tr("¿Qué pasa con mi aporte apenas dono?", "What happens to my gift right after I donate?"),
    a: tr(
      "Va a la bóveda de la campaña, un contrato inteligente que lo custodia. La fundación no lo recibe hasta que la campaña llega a su meta.",
      "It goes to the campaign's vault, a smart contract that holds it. The nonprofit doesn't receive it until the campaign reaches its goal.",
    ),
  },
  {
    q: tr("¿Por qué se libera solo una parte al llegar a la meta?", "Why is only part released when the goal is reached?"),
    a: tr(
      `Para que la fundación pueda empezar a ejecutar, pero el resto dependa de que demuestre el uso de los recursos con evidencia (fotos, facturas, actas de entrega). Cada fundación elige ese porcentaje al crear la campaña (sugerimos ${MILESTONE_RECOMMENDED}%) y nunca puede pasar de ${MILESTONE_MAX}%: al menos el ${100 - MILESTONE_MAX}% siempre queda atado a la evidencia.`,
      `So the nonprofit can start working, while the rest depends on proving how the funds were used (photos, invoices, delivery records). Each nonprofit picks that percentage when creating the campaign (we suggest ${MILESTONE_RECOMMENDED}%) and it can never exceed ${MILESTONE_MAX}%: at least ${100 - MILESTONE_MAX}% is always tied to evidence.`,
    ),
  },
  {
    q: tr("¿Qué pasa si la campaña no llega a la meta?", "What if the campaign doesn't reach its goal?"),
    a: tr(
      "Si la fecha límite pasa sin llegar a la meta, si la fundación cancela la campaña o si el admin la pausa, cada donante puede pedir el reembolso de su aporte desde «Mis donaciones». El contrato devuelve el dinero directamente a tu wallet.",
      "If the deadline passes without reaching the goal, if the nonprofit cancels the campaign or if the admin pauses it, every donor can claim a refund from “My donations”. The contract sends the money straight back to your wallet.",
    ),
  },
  {
    q: tr("¿Quién valida la evidencia?", "Who validates the evidence?"),
    a: tr(
      "Cada campaña tiene un verificador: la cuenta del equipo de BITAJÓN. Revisa las fotos y facturas y, si están bien, libera el resto. El contrato comprueba que la evidencia liberada sea exactamente la que se revisó.",
      "Each campaign has a verifier: the BITAJÓN team account. It reviews the photos and invoices and, if they check out, releases the rest. The contract verifies that the released evidence is exactly the one that was reviewed.",
    ),
  },
  {
    q: tr("¿Quién es el admin de la plataforma?", "Who is the platform admin?"),
    a: tr(
      "No es una sola persona: es una cuenta multifirma en la red (governance-account). Aprobar fundaciones o pausar una campaña necesita la firma de sus firmantes autorizados.",
      "It's not a single person: it's a multisig account on the network (governance-account). Approving nonprofits or pausing a campaign requires its authorized signers.",
    ),
  },
  {
    q: tr("¿Dónde quedan las fotos y facturas?", "Where are the photos and invoices stored?"),
    a: tr(
      "Quedan publicadas en la campaña para que cualquiera las vea. Además, su huella digital (SHA-256) se registra en Stellar: tu navegador recalcula la huella de cada archivo y la compara con la de la red, así que si alguien cambia una foto o una factura, la página lo muestra.",
      "They are published on the campaign for anyone to see. Their digital fingerprint (SHA-256) is also registered on Stellar: your browser recomputes each file's fingerprint and compares it with the network's, so if anyone changes a photo or invoice, the page shows it.",
    ),
  },
  {
    q: tr("¿Quién ve el RUT y el correo de la fundación?", "Who sees the nonprofit's RUT and email?"),
    a: tr(
      "Solo los admins de BITAJÓN, para aprobar la fundación. Se guardan en un espacio privado y en la red solo queda su huella (Ley 1581 de Habeas Data).",
      "Only BITAJÓN admins, to approve the nonprofit. They are stored privately and only their fingerprint goes on the network (Colombian data-protection law 1581).",
    ),
  },
  {
    q: tr("¿Las fundaciones necesitan una wallet?", "Do nonprofits need a wallet?"),
    a: tr(
      "No. Pueden entrar con su correo: les llega un código y se crea su cuenta en Stellar automáticamente. Después pueden vincular una wallet propia (Varial) para retirar los fondos.",
      "No. They can sign in with their email: they get a code and their Stellar account is created automatically. Later they can link their own wallet (Varial) to withdraw funds.",
    ),
  },
  {
    q: tr("¿Necesito criptomonedas? ¿Cuánto es en pesos?", "Do I need crypto? How much is it in dollars?"),
    a: tr(
      `En esta demo se usa ${TOKEN_SYMBOL} de testnet, que es gratis y no tiene valor real. Lo obtienes desde el menú de tu cuenta con «Obtener XLM de prueba». Los valores en COP y USD que ves junto a cada monto son una referencia con el precio actual del XLM.`,
      `This demo uses testnet ${TOKEN_SYMBOL}, which is free and has no real value. You get it from your account menu with “Get test XLM”. The COP and USD values next to each amount are a reference using the current XLM price.`,
    ),
  },
];

export function HowItWorksPage() {
  const fee = useFeeBps();
  return (
    <>
      <PageHeader eyebrow={tr("Cómo funciona", "How it works")} title={tr("Un modelo de pago por avance", "A pay-for-progress model")}>
        {tr(
          "BITAJÓN cambia el «confía en nosotros» por «compruébalo tú». El dinero se libera por etapas y cada etapa queda registrada.",
          "BITAJÓN replaces “trust us” with “check it yourself”. Money is released in stages and every stage is recorded.",
        )}
      </PageHeader>
      <section className="container-page py-12">
        <HowItWorks />
      </section>

      <section className="container-page grid gap-10 py-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="text-2xl font-semibold">{tr("Preguntas frecuentes", "FAQ")}</h2>
          <div className="mt-5 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
            {faq().map((f) => (
              <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold text-brand-900">
                  {f.q}
                  <span className="text-xl text-leaf-600 transition group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-slate-600">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
        <aside className="space-y-4">
          <div className="card p-6">
            <h3 className="text-lg font-semibold">{tr("Comisión de la plataforma", "Platform fee")}</h3>
            <p className="mt-1 font-display text-4xl font-semibold text-leaf-700">
              {fee.data === undefined ? "…" : `${(fee.data / 100).toLocaleString(locale())}%`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {tr(
                "Se lee en vivo del contrato. Antes de donar siempre verás cuánto va a la campaña y cuánto a la plataforma.",
                "Read live from the contract. Before donating you'll always see how much goes to the campaign and how much to the platform.",
              )}
            </p>
            <div className="mt-3">
              <PriceNote />
            </div>
          </div>
          <div className="card p-6">
            <h3 className="text-lg font-semibold">{tr("Contratos", "Contracts")}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(Object.keys(CONTRACTS) as (keyof typeof CONTRACTS)[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">{tr(...CONTRACT_LABELS[k])}</span>
                  <AddressLink address={CONTRACTS[k]} kind="contract" />
                </li>
              ))}
              <li className="flex items-center justify-between gap-2">
                <span className="text-slate-600">{tr("Admin multifirma", "Multisig admin")}</span>
                <AddressLink address={GOVERNANCE_ID} kind="contract" />
              </li>
            </ul>
          </div>
          <Link to="/campanas" className="btn-primary w-full">
            {tr("Ver campañas", "See campaigns")} <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </section>
    </>
  );
}
