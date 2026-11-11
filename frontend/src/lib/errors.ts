import { tr } from "./i18n";

// Mensajes para los códigos de error compartidos por los contratos (protocol-types::Error, v0.2).
const CONTRACT_ERRORS: Record<number, [string, string]> = {
  1: ["No tienes permisos para esta acción.", "You don't have permission for this action."],
  2: ["La fundación no está registrada.", "The nonprofit is not registered."],
  3: ["La fundación aún no está aprobada.", "The nonprofit is not approved yet."],
  4: ["Esta fundación ya está registrada.", "This nonprofit is already registered."],
  5: ["La campaña no existe.", "The campaign does not exist."],
  6: ["La campaña no está activa.", "The campaign is not active."],
  8: ["Aún no se ha subido evidencia.", "No evidence has been submitted yet."],
  11: ["El monto debe ser mayor a cero.", "The amount must be greater than zero."],
  12: ["La fecha límite debe ser futura.", "The deadline must be in the future."],
  13: ["El porcentaje del primer desembolso debe estar entre 1% y 90%.", "The first payout percentage must be between 1% and 90%."],
  16: ["Los fondos finales ya fueron liberados.", "The final funds were already released."],
  18: ["Solo el admin puede hacer esta acción.", "Only the admin can do this."],
  19: ["El monto supera lo que le falta a la campaña para llegar a la meta.", "The amount exceeds what the campaign still needs to reach its goal."],
  20: ["Esta campaña ya tiene una bóveda.", "This campaign already has a vault."],
  21: ["La liberación inicial aún no se ha hecho.", "The initial release has not happened yet."],
  22: ["La campaña ya cerró.", "The campaign has already closed."],
  23: ["Esta campaña ya está finalizada.", "This campaign is already finalized."],
  24: ["La evidencia no puede estar vacía.", "Evidence cannot be empty."],
  25: ["El fee supera el máximo permitido (10%).", "The fee exceeds the maximum allowed (10%)."],
  26: ["Depósito no autorizado: las donaciones deben pasar por el router.", "Unauthorized deposit: donations must go through the router."],
  27: ["Esta campaña aún no permite reembolsos.", "This campaign does not allow refunds yet."],
  28: ["No tienes aportes pendientes de reembolso en esta campaña.", "You have no contributions to refund in this campaign."],
  29: ["La evidencia cambió desde que la revisaste. Recarga y vuelve a revisarla.", "The evidence changed since you reviewed it. Reload and review it again."],
  30: ["Solo el verificador designado puede liberar el pago final.", "Only the designated verifier can release the final payment."],
  31: ["No eres el administrador pendiente.", "You are not the pending admin."],
  32: ["Esta campaña está pausada temporalmente.", "This campaign is temporarily paused."],
};

export function contractErrorCode(err: unknown): number | null {
  const text = errorText(err);
  const m = text.match(/Error\(Contract, #(\d+)\)/);
  return m ? Number(m[1]) : null;
}

function errorText(err: unknown): string {
  if (err == null) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) return `${err.message} ${String((err as { cause?: unknown }).cause ?? "")}`;
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

/** Convierte cualquier error (contrato, wallet, red) en un mensaje para el usuario. */
export function friendlyError(err: unknown): string {
  const code = contractErrorCode(err);
  if (code !== null) {
    const m = CONTRACT_ERRORS[code];
    return m ? tr(m[0], m[1]) : tr(`El contrato rechazó la operación (código ${code}).`, `The contract rejected the operation (code ${code}).`);
  }
  if (err instanceof Error && err.name === "BitajonError") return err.message;

  const text = errorText(err);
  const lower = text.toLowerCase();
  if (lower.includes("user declined") || lower.includes("rejected") || lower.includes("denied") || lower.includes("closed the modal"))
    return tr("Cancelaste la firma.", "You cancelled the signature.");
  if (lower.includes("error(auth")) return tr("La firma no autoriza esta operación.", "The signature does not authorize this operation.");
  if (lower.includes("account not found") || lower.includes("404"))
    return tr("Tu cuenta aún no existe en la red. Usa el botón para obtener XLM de prueba.", "Your account does not exist on the network yet. Use the button to get test XLM.");
  if (lower.includes("insufficient") || lower.includes("balance") || lower.includes("underfunded"))
    return tr("No tienes saldo suficiente para esta operación.", "You don't have enough balance for this operation.");
  if (lower.includes("failed to fetch") || lower.includes("network"))
    return tr("No se pudo conectar con la red de Stellar. Revisa tu conexión e inténtalo de nuevo.", "Could not reach the Stellar network. Check your connection and try again.");
  if (lower.includes("varial") || lower.includes("freighter") || lower.includes("blux")) return text;
  return tr("Algo salió mal al procesar la operación. Inténtalo de nuevo.", "Something went wrong. Please try again.");
}

export function isNotFound(err: unknown, code: number): boolean {
  return contractErrorCode(err) === code;
}
