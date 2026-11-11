#!/usr/bin/env bash
#
# deploy.sh — Despliegue completo de Bitajón en Testnet con governance-account.
#
# Uso:
#   ./scripts/deploy.sh [options]
#
# Opciones:
#   --network <net>       testnet (default) | futurenet | mainnet
#   --source <identity>   identidad del CLI (default: deployer)
#   --treasury <addr>     dirección de tesorería (default: address de --source)
#   --fee-bps <n>         fee de plataforma en bps (default: 0)
#   --fund                fondea la identidad con Friendbot (solo testnet)
#   --skip-verify         no ejecuta el smoke test final
#   --env-file <path>     archivo de salida (default: <repo>/.env.testnet)
#   -h, --help            muestra esta ayuda
#
# Requisitos:
#   - stellar-cli >= 30.0.1
#   - Contratos compilados (stellar contract build ejecutado antes)
#   - Identidad configurada con fondos
#
# ¿Qué hace?
#   1. Verifica el entorno (CLI, identidad, Wasm).
#   2. Hace backup del .env anterior si existe.
#   3. Despliega governance-account con [signer] y threshold=1.
#   4. Despliega nonprofit-registry con governance-account como admin.
#   5. Despliega campaign-registry con governance-account como admin.
#   6. Despliega campaign-vault con governance-account como admin.
#   7. Despliega donation-router con governance-account como admin.
#   8. Intenta configurar authorized_router (best-effort, ver nota).
#   9. Smoke test: lee cada contrato para confirmar que responde.
#  10. Guarda las direcciones en .env.testnet.
#
# ¿Qué NO hace?
#   - Aprobar nonprofits o crear campañas (requieren firmar con
#     governance-account; usar frontend o @stellar/stellar-sdk).
#
# Nota sobre authorized_router:
#   El CLI no puede firmar transacciones en nombre de un smart account
#   (C...) porque no construye auth entries con sub-firmas. El paso 8
#   intenta con --source <identity>, que es un signer de governance-account;
#   si el CLI lo soporta en tu versión, funciona. Si no, imprime el comando
#   exacto para ejecutarlo desde el frontend o @stellar/stellar-sdk.
#   Mientras fee_bps=0, el bypass no aplica (no hay fee que saltar).
#
# Sobre mainnet:
#   Antes de desplegar a mainnet, asegúrate de que governance-account tenga
#   >= 2 signers y threshold >= 2. Un solo signer en mainnet es un riesgo
#   operacional serio.
#

set -euo pipefail

# --- Configuración por defecto ---
NETWORK="testnet"
SOURCE="deployer"
TREASURY=""
FEE_BPS=0
FUND=false
SKIP_VERIFY=false
ROUTER_CONFIGURED="unknown"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$CONTRACTS_DIR")"
WASM_DIR="$CONTRACTS_DIR/target/wasm32v1-none/release"
ENV_FILE="$REPO_ROOT/.env.testnet"

# --- Parseo de argumentos ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)     NETWORK="$2"; shift 2 ;;
    --source)      SOURCE="$2"; shift 2 ;;
    --treasury)    TREASURY="$2"; shift 2 ;;
    --fee-bps)     FEE_BPS="$2"; shift 2 ;;
    --fund)        FUND=true; shift ;;
    --skip-verify) SKIP_VERIFY=true; shift ;;
    --env-file)    ENV_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '3,48p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "❌ Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

# --- Funciones de logging (todas a stderr, para no contaminar stdout) ---
log_info()    { printf 'ℹ️  %s\n' "$*" >&2; }
log_ok()      { printf '✅ %s\n' "$*" >&2; }
log_warn()    { printf '⚠️  %s\n' "$*" >&2; }
log_error()   { printf '❌ %s\n' "$*" >&2; }
log_section() {
  printf '\n═══════════════════════════════════════════════════════\n' >&2
  printf '  %s\n' "$*" >&2
  printf '═══════════════════════════════════════════════════════\n' >&2
}
link() { printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$1"; }

# --- Verificaciones previas ---

check_cli() {
  if ! command -v stellar &>/dev/null; then
    log_error "stellar-cli no está instalado."
    echo "  curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh" >&2
    exit 1
  fi
  local version
  version=$(stellar --version | head -n1 | awk '{print $2}')
  log_info "Stellar CLI: $version"
}

check_source() {
  if ! stellar keys address "$SOURCE" &>/dev/null; then
    log_error "La identidad '$SOURCE' no existe. Créala con:"
    echo "  stellar keys generate $SOURCE --network $NETWORK --fund" >&2
    exit 1
  fi
  SOURCE_ADDR=$(stellar keys address "$SOURCE")
  log_info "Source: $SOURCE ($SOURCE_ADDR)"

  if [[ -z "$TREASURY" ]]; then
    TREASURY="$SOURCE_ADDR"
    log_info "Treasury (default): $TREASURY"
  else
    log_info "Treasury: $TREASURY"
  fi
}

check_wasm() {
  local missing=()
  for name in governance_account nonprofit_registry campaign_registry campaign_vault donation_router; do
    [[ ! -f "$WASM_DIR/$name.wasm" ]] && missing+=("$name.wasm")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Faltan Wasm en $WASM_DIR:"
    printf '  - %s\n' "${missing[@]}" >&2
    echo "  Ejecuta primero: cd $CONTRACTS_DIR && stellar contract build" >&2
    exit 1
  fi
  log_info "Wasm verificados en $WASM_DIR"
}

fund_if_requested() {
  if [[ "$FUND" == "true" ]]; then
    log_info "Fondeando $SOURCE_ADDR con Friendbot..."
    curl -sf "https://friendbot.stellar.org/?addr=$SOURCE_ADDR" >/dev/null 2>&1 || true
    log_ok "Friendbot OK (o la cuenta ya tenía fondos)."
  fi
}

warn_if_mainnet() {
  if [[ "$NETWORK" == "mainnet" ]]; then
    log_warn "Estás desplegando a MAINNET."
    log_warn "Verifica que governance-account tenga >= 2 signers y threshold >= 2."
    log_warn "Un solo signer en mainnet es un riesgo operacional."
    read -r -p "¿Continuar? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
      log_error "Abortado."
      exit 1
    fi
  fi
}

# --- Extracción del contract ID del output de deploy ---

extract_contract_id() {
  local output="$1"
  local id

  # Intent 1: URL de lab.stellar.org
  id=$(echo "$output" | grep -oP 'https://lab\.stellar\.org/r/\w+/\K[A-Z2-7]{56}' | tail -1)
  [[ -n "$id" ]] && { echo "$id"; return 0; }

  # Fallback: buscar cualquier C-address en el output
  id=$(echo "$output" | grep -oP '\bC[A-Z2-7]{55}\b' | tail -1)
  [[ -n "$id" ]] && { echo "$id"; return 0; }

  return 1
}

# --- Deploy (imprime el contract ID a stdout, todo lo demás a stderr) ---

deploy() {
  local wasm_name="$1"
  local log_name="$2"
  shift 2
  local args=("$@")

  log_info "Desplegando $log_name..."

  local output exit_code
  output=$(stellar contract deploy \
    --wasm "$WASM_DIR/$wasm_name.wasm" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "${args[@]}" 2>&1) && exit_code=0 || exit_code=$?

  if [[ $exit_code -ne 0 ]]; then
    log_error "Fallo al desplegar $log_name:"
    printf '%s\n' "$output" >&2
    return 1
  fi

  local contract_id
  if ! contract_id=$(extract_contract_id "$output"); then
    log_error "No pude extraer el contract ID del output de $log_name:"
    printf '%s\n' "$output" >&2
    return 1
  fi

  log_ok "$log_name: $contract_id"
  printf '%s\n' "$contract_id"
}

# --- Verificación (smoke test de lectura) ---

verify() {
  local id="$1"
  local name="$2"
  local fn="$3"
  shift 3
  local args=("$@")

  local output exit_code
  output=$(stellar contract invoke \
    --id "$id" \
    --source "$SOURCE" \
    --network "$NETWORK" \
    -- "$fn" "${args[@]}" 2>&1) && exit_code=0 || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log_ok "$name.$fn → $output"
    return 0
  else
    log_error "$name.$fn falló:"
    printf '%s\n' "$output" | head -n 10 >&2
    return 1
  fi
}

# --- Main ---

main() {
  log_section "Bitajón Deploy — $NETWORK"
  log_info "Repo: $REPO_ROOT"
  log_info "Wasm: $WASM_DIR"

  check_cli
  check_source
  check_wasm
  warn_if_mainnet
  fund_if_requested
  echo

  # Backup del .env si existe
  if [[ -f "$ENV_FILE" ]]; then
    local backup="${ENV_FILE}.backup.$(date +%Y%m%dT%H%M%SZ)"
    cp "$ENV_FILE" "$backup"
    log_info "Backup del .env anterior: $backup"
  fi
  echo

  # 1. governance-account
  log_section "1/5 — governance-account"
  GOVERNANCE_ID=$(deploy "governance_account" "governance-account" \
    --signers "[\"$SOURCE_ADDR\"]" --threshold 1) || exit 1
  log_info "GOVERNANCE_ID=$GOVERNANCE_ID"
  verify "$GOVERNANCE_ID" "governance-account" "get_threshold" || exit 1
  echo

  # 2. nonprofit-registry
  log_section "2/5 — nonprofit-registry"
  NP_ID=$(deploy "nonprofit_registry" "nonprofit-registry" \
    --admin "$GOVERNANCE_ID") || exit 1
  log_info "NP_ID=$NP_ID"
  verify "$NP_ID" "nonprofit-registry" "get_admin" || exit 1
  echo

  # 3. campaign-registry
  log_section "3/5 — campaign-registry"
  CR_ID=$(deploy "campaign_registry" "campaign-registry" \
    --admin "$GOVERNANCE_ID" --nonprofit_registry "$NP_ID") || exit 1
  log_info "CR_ID=$CR_ID"
  verify "$CR_ID" "campaign-registry" "get_admin" || exit 1
  echo

  # 4. campaign-vault
  log_section "4/5 — campaign-vault"
  CV_ID=$(deploy "campaign_vault" "campaign-vault" \
    --admin "$GOVERNANCE_ID" --campaign_registry "$CR_ID") || exit 1
  log_info "CV_ID=$CV_ID"
  verify "$CV_ID" "campaign-vault" "get_authorized_router" || exit 1
  echo

  # 5. donation-router
  log_section "5/5 — donation-router"
  DR_ID=$(deploy "donation_router" "donation-router" \
    --admin "$GOVERNANCE_ID" --treasury "$TREASURY" \
    --campaign_vault "$CV_ID" --fee_bps "$FEE_BPS") || exit 1
  log_info "DR_ID=$DR_ID"
  verify "$DR_ID" "donation-router" "get_fee_bps" || exit 1
  echo

  # Best-effort: set_authorized_router
  log_section "Configurando authorized_router (best-effort)"
  log_info "Intentando set_authorized_router desde $SOURCE..."
  if stellar contract invoke \
      --id "$CV_ID" --source "$SOURCE" --network "$NETWORK" \
      -- set_authorized_router \
        --admin "$GOVERNANCE_ID" \
        --router "\"$DR_ID\"" >/dev/null 2>&1; then
    log_ok "authorized_router configurado correctamente."
    ROUTER_CONFIGURED="yes"
  else
    log_warn "El CLI no pudo firmar por governance-account (limitación conocida)."
    log_warn "Ejecuta esto desde el frontend o @stellar/stellar-sdk:"
    {
      echo "  stellar contract invoke \\"
      echo "    --id $CV_ID --network $NETWORK \\"
      echo "    -- set_authorized_router \\"
      echo "      --admin $GOVERNANCE_ID \\"
      echo "      --router '\"$DR_ID\"'"
    } >&2
    log_warn "Mientras fee_bps=$FEE_BPS, el bypass del fee no aplica."
    ROUTER_CONFIGURED="no"
  fi
  echo

  # Smoke test final (si no se hizo por deploy individual)
  if [[ "$SKIP_VERIFY" != "true" ]]; then
    log_section "Smoke test adicional"
    verify "$GOVERNANCE_ID" "governance-account" "get_signers" || exit 1
    verify "$CV_ID" "campaign-vault" "get_vault" --campaign_id 999 2>/dev/null || true
    echo
  fi

  # Escribir .env.testnet
  log_section "Guardando direcciones en $ENV_FILE"
  cat > "$ENV_FILE" <<EOF
# Bitajón contracts — deployed $(date -u +"%Y-%m-%dT%H:%M:%SZ")
# Network: $NETWORK
# Source: $SOURCE ($SOURCE_ADDR)
# Treasury: $TREASURY
# Fee: $FEE_BPS bps

GOVERNANCE_ID=$GOVERNANCE_ID
NP_ID=$NP_ID
CR_ID=$CR_ID
CV_ID=$CV_ID
DR_ID=$DR_ID

# Metadata
TREASURY=$TREASURY
FEE_BPS=$FEE_BPS
AUTHORIZED_ROUTER_CONFIGURED=$ROUTER_CONFIGURED
EOF
  log_ok "Direcciones guardadas."
  echo

  # Resumen
  log_section "Resumen"
  echo "  Network:    $NETWORK"
  echo "  Source:     $SOURCE ($SOURCE_ADDR)"
  echo "  Treasury:   $TREASURY"
  echo "  Fee:        $FEE_BPS bps"
  echo "  Router:     $([[ "$ROUTER_CONFIGURED" == "yes" ]] && echo "✅ configurado" || echo "⚠️  pendiente")"
  echo
  echo "  Contratos:"
  printf '    %-22s %s\n' "governance-account:" "$GOVERNANCE_ID"
  printf '    %-22s %s\n' "nonprofit-registry:" "$NP_ID"
  printf '    %-22s %s\n' "campaign-registry:"  "$CR_ID"
  printf '    %-22s %s\n' "campaign-vault:"     "$CV_ID"
  printf '    %-22s %s\n' "donation-router:"    "$DR_ID"
  echo
  echo "  Stellar Expert:"
  for id in "$GOVERNANCE_ID" "$NP_ID" "$CR_ID" "$CV_ID" "$DR_ID"; do
    echo "    $(link "https://stellar.expert/explorer/$NETWORK/contract/$id")"
  done
  echo
  echo "  Siguiente paso:"
  echo "    1. Actualizar CONFIGS en frontend/supabase/functions/bitajon/index.ts"
  echo "    2. Actualizar bindings TS con: stellar contract bindings typescript ..."
  echo "    3. Regenerar .env del frontend con las direcciones de $ENV_FILE"
  echo
  log_ok "=== Deploy completado ==="
}

main "$@"
