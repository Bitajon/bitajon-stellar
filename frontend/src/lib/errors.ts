// Mensajes para los códigos de error compartidos por los 4 contratos (thriving-types::Error).
const CONTRACT_ERRORS: Record<number, string> = {
  1: "No tienes permisos para esta acción.",
  2: "La fundación no está registrada.",
  3: "La fundación aún no está aprobada por el admin.",
  4: "Esta fundación ya está registrada.",
  5: "La campaña no existe.",
  6: "La campaña no está activa.",
  8: "Aún no se ha subido evidencia.",
  11: "El monto debe ser mayor a cero.",
  12: "La fecha límite debe ser futura.",
  13: "El porcentaje de hito debe estar entre 1 y 100.",
  16: "Los fondos finales ya fueron liberados.",
  18: "Solo el admin puede liberar fondos.",
  19: "El monto supera lo que le falta a la campaña para llegar a la meta.",
  20: "Esta campaña ya tiene una bóveda.",
  21: "La liberación inicial aún no se ha hecho.",
  22: "La campaña ya cerró.",
  23: "Esta campaña ya está finalizada.",
  24: "La evidencia no puede estar vacía.",
  25: "El fee supera el máximo permitido (10%).",
  26: "Depósito no autorizado: las donaciones deben pasar por el router.",
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

/** Convierte cualquier error (contrato, Freighter, red) en un mensaje para el usuario. */
export function friendlyError(err: unknown): string {
  const code = contractErrorCode(err);
  if (code !== null) return CONTRACT_ERRORS[code] ?? `El contrato rechazó la operación (código ${code}).`;

  const text = errorText(err);
  const lower = text.toLowerCase();
  if (lower.includes("user declined") || lower.includes("rejected") || lower.includes("denied"))
    return "Cancelaste la firma en Freighter.";
  if (lower.includes("error(auth")) return "La firma no autoriza esta operación.";
  if (lower.includes("account not found") || lower.includes("404"))
    return "Tu cuenta aún no existe en la red. Usa el botón para obtener XLM de prueba.";
  if (lower.includes("insufficient") || lower.includes("balance") || lower.includes("underfunded"))
    return "No tienes saldo suficiente para esta operación.";
  if (lower.includes("failed to fetch") || lower.includes("network"))
    return "No se pudo conectar con la red de Stellar. Revisa tu conexión e inténtalo de nuevo.";
  if (lower.includes("freighter")) return text;
  return "Algo salió mal al procesar la operación. Inténtalo de nuevo.";
}

export function isNotFound(err: unknown, code: number): boolean {
  return contractErrorCode(err) === code;
}
