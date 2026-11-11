import { FileSearch, ShieldAlert, ShieldCheck } from "lucide-react";
import { tr } from "../lib/i18n";
import { useState } from "react";
import { sha256File, toHex } from "../lib/hash";
import { CopyButton } from "./ui";

/** Permite a cualquiera comprobar que un archivo coincide con la huella publicada on-chain. */
export function EvidenceVerifier({ evidenceHash }: { evidenceHash: Uint8Array }) {
  const expected = toHex(evidenceHash);
  const [result, setResult] = useState<{ name: string; ok: boolean; hex: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function check(file: File) {
    setBusy(true);
    try {
      const hex = toHex(await sha256File(file));
      setResult({ name: file.name, ok: hex === expected, hex });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-slate-600">{tr("Huella SHA-256 registrada por la fundación:", "SHA-256 fingerprint registered by the nonprofit:")}</p>
      <div className="mt-2 flex items-start gap-1 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
        <code className="flex-1 font-mono text-xs break-all text-brand-900">{expected || tr("(vacía)", "(empty)")}</code>
        {expected && <CopyButton value={expected} />}
      </div>
      <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 px-4 py-5 text-sm font-semibold text-brand-800 transition hover:border-leaf-400 hover:bg-leaf-50">
        <FileSearch className="h-4 w-4" />
        {busy ? tr("Calculando…", "Calculating…") : tr("Comprobar un archivo de evidencia", "Check an evidence file")}
        <input
          type="file"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void check(f);
            e.target.value = "";
          }}
        />
      </label>
      <p className="hint">{tr("El archivo no se sube a ningún lado: la huella se calcula en tu navegador.", "The file is not uploaded anywhere: the fingerprint is computed in your browser.")}</p>
      {result && (
        <div className={`mt-3 flex items-start gap-2 rounded-xl p-3 text-sm ${result.ok ? "bg-leaf-50 text-leaf-900" : "bg-amber-50 text-amber-900"}`}>
          {result.ok ? <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>
            <b>{result.name}</b> {result.ok ? tr("coincide con la evidencia registrada.", "matches the registered evidence.") : tr("no coincide con la evidencia registrada.", "does not match the registered evidence.")}
          </span>
        </div>
      )}
    </div>
  );
}
