import { useQuery } from "@tanstack/react-query";
import { FileText, ShieldAlert, ShieldCheck } from "lucide-react";
import { useEvidenceRecords } from "../hooks/queries";
import { toHex } from "../lib/hash";
import { BUCKETS, publicUrl, verifyEvidence, type EvidenceRecord } from "../lib/offchain";
import { EvidenceVerifier } from "./EvidenceVerifier";
import { Gallery } from "./Gallery";
import { Spinner } from "./ui";

/**
 * Muestra la evidencia publicada por la fundación y la verifica sola:
 * la huella del manifiesto debe ser la registrada on-chain y cada archivo debe
 * coincidir con su huella dentro del manifiesto.
 */
export function EvidencePanel({ campaignId, evidenceHash }: { campaignId: bigint; evidenceHash: Uint8Array }) {
  const onChain = toHex(evidenceHash);
  const records = useEvidenceRecords(campaignId);
  const record = records.data?.find((r) => r.manifest_sha256 === onChain) ?? null;

  if (records.isLoading) return <Spinner className="h-5 w-5 text-slate-400" />;
  if (!record) {
    // Evidencia registrada solo como huella (sin archivos publicados).
    return <EvidenceVerifier evidenceHash={evidenceHash} />;
  }
  return <PublishedEvidence record={record} onChain={onChain} />;
}

function PublishedEvidence({ record, onChain }: { record: EvidenceRecord; onChain: string }) {
  const check = useQuery({
    queryKey: ["evidence-check", record.manifest_sha256],
    queryFn: () => verifyEvidence(record, onChain),
    staleTime: Infinity,
  });
  const images = record.manifest.files.filter((f) => f.type.startsWith("image/"));
  const docs = record.manifest.files.filter((f) => !f.type.startsWith("image/"));
  const fileOk = (path: string) => check.data?.files.find((f) => f.path === path)?.ok;

  return (
    <div className="space-y-5">
      <div
        className={`flex items-start gap-3 rounded-2xl p-4 text-sm ${
          check.isLoading ? "bg-slate-50 text-slate-700" : check.data?.allOk ? "bg-leaf-50 text-leaf-900" : "bg-amber-50 text-amber-900"
        }`}
      >
        {check.isLoading ? (
          <Spinner className="mt-0.5 h-4 w-4 shrink-0" />
        ) : check.data?.allOk ? (
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
        ) : (
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
        )}
        <div>
          <p className="font-semibold">
            {check.isLoading
              ? "Verificando la evidencia contra la red…"
              : check.data?.allOk
                ? `Evidencia verificada: ${record.manifest.files.length} archivo${record.manifest.files.length === 1 ? "" : "s"} coinciden con la huella registrada en Stellar.`
                : "Algún archivo no coincide con la huella registrada en Stellar."}
          </p>
          <p className="mt-0.5 text-xs opacity-80">La verificación la hace tu navegador: calcula la huella SHA-256 de cada archivo y la compara con la que quedó en el contrato.</p>
        </div>
      </div>

      {record.manifest.note && <p className="text-sm leading-relaxed whitespace-pre-line text-slate-700">{record.manifest.note}</p>}

      {images.length > 0 && <Gallery urls={images.map((f) => publicUrl(BUCKETS.evidence, f.path)!)} title="Evidencia" />}

      {docs.length > 0 && (
        <ul className="space-y-2">
          {docs.map((f) => (
            <li key={f.path}>
              <a
                href={publicUrl(BUCKETS.evidence, f.path)!}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 text-sm ring-1 ring-slate-200 hover:bg-brand-50"
              >
                <span className="flex min-w-0 items-center gap-2 font-semibold text-brand-900">
                  <FileText className="h-4 w-4 shrink-0 text-leaf-600" /> <span className="truncate">{f.name}</span>
                </span>
                {fileOk(f.path) !== undefined &&
                  (fileOk(f.path) ? <ShieldCheck className="h-4 w-4 shrink-0 text-leaf-600" /> : <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />)}
              </a>
            </li>
          ))}
        </ul>
      )}

      <details className="text-xs text-slate-500">
        <summary className="cursor-pointer font-semibold text-brand-700">Detalle técnico</summary>
        <p className="mt-2">Huella registrada on-chain (manifiesto):</p>
        <code className="block break-all text-brand-900">{onChain}</code>
        <ul className="mt-2 space-y-1">
          {record.manifest.files.map((f) => (
            <li key={f.path} className="break-all">
              {f.name}: <code>{f.sha256}</code>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
