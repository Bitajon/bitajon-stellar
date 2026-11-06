import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { HowItWorks } from "../components/HowItWorks";
import { AddressLink, PageHeader } from "../components/ui";
import { CONTRACT_LABELS, CONTRACTS, MILESTONE_PERCENTAGE, TOKEN_SYMBOL } from "../config";
import { useFeeBps } from "../hooks/queries";

const FAQ = [
  {
    q: "¿Qué es Stellar y por qué se usa aquí?",
    a: "Stellar es una red pública de pagos. Cada donación, liberación y evidencia queda registrada en ella y cualquiera la puede revisar en el explorador. Las comisiones por transacción son de fracciones de centavo.",
  },
  {
    q: "¿Qué pasa con mi aporte apenas dono?",
    a: "Va a la bóveda de la campaña, un contrato inteligente que lo custodia. La fundación no lo recibe hasta que la campaña llega a su meta.",
  },
  {
    q: `¿Por qué se libera solo el ${MILESTONE_PERCENTAGE}% al llegar a la meta?`,
    a: "Para que la fundación pueda empezar a ejecutar, pero el resto dependa de que demuestre el uso de los recursos con evidencia (fotos, facturas, actas de entrega).",
  },
  {
    q: "¿Dónde quedan las fotos y facturas?",
    a: "Quedan publicadas en la campaña para que cualquiera las vea. Además, su huella digital (SHA-256) se registra en Stellar: tu navegador recalcula la huella de cada archivo y la compara con la de la red, así que si alguien cambia una foto o una factura, la página lo muestra.",
  },
  {
    q: "¿Quién ve el RUT de la fundación?",
    a: "Solo el administrador de BITAJÓN, para aprobar la fundación. El archivo se guarda en un espacio privado y en la red solo queda su huella, para comprobar que no se cambió.",
  },
  {
    q: "¿Qué pasa si la campaña no llega a la meta?",
    a: "En esta versión los fondos quedan en la bóveda y el administrador decide su destino. La devolución automática a los donantes está en el plan de trabajo.",
  },
  {
    q: "¿Necesito criptomonedas?",
    a: `En esta demo se usa ${TOKEN_SYMBOL} de testnet, que es gratis y no tiene valor real. Lo obtienes desde el menú de tu wallet con "Obtener XLM de prueba".`,
  },
];

export function HowItWorksPage() {
  const fee = useFeeBps();
  return (
    <>
      <PageHeader eyebrow="Cómo funciona" title="Un modelo de pago por avance">
        BITAJÓN cambia el «confía en nosotros» por «compruébalo tú». El dinero se libera por etapas y cada etapa queda registrada.
      </PageHeader>
      <section className="container-page py-12">
        <HowItWorks />
      </section>

      <section className="container-page grid gap-10 py-6 lg:grid-cols-[1.3fr_1fr]">
        <div>
          <h2 className="text-2xl font-semibold">Preguntas frecuentes</h2>
          <div className="mt-5 divide-y divide-slate-200 rounded-3xl border border-slate-200 bg-white">
            {FAQ.map((f) => (
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
            <h3 className="text-lg font-semibold">Comisión de la plataforma</h3>
            <p className="mt-1 font-display text-4xl font-semibold text-leaf-700">
              {fee.data === undefined ? "…" : `${(fee.data / 100).toLocaleString("es-CO")}%`}
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Se lee en vivo del contrato. Antes de donar siempre verás cuánto va a la campaña y cuánto a la plataforma.
            </p>
          </div>
          <div className="card p-6">
            <h3 className="text-lg font-semibold">Contratos</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {(Object.keys(CONTRACTS) as (keyof typeof CONTRACTS)[]).map((k) => (
                <li key={k} className="flex items-center justify-between gap-2">
                  <span className="text-slate-600">{CONTRACT_LABELS[k]}</span>
                  <AddressLink address={CONTRACTS[k]} kind="contract" />
                </li>
              ))}
            </ul>
          </div>
          <Link to="/campanas" className="btn-primary w-full">
            Ver campañas <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </section>
    </>
  );
}
