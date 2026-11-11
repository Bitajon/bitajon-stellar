#!/usr/bin/env bash
#
# extend-ttl.sh — Extiende y verifica el TTL de Wasm e instancias de Bitajón.
#
# Uso:
#   ./scripts/extend-ttl.sh [options]
#
# Opciones:
#   --network <net>       testnet (default) | futurenet | mainnet
#   --source <identity>   identidad del CLI (default: deployer)
#   --env-file <path>     archivo .env con contract IDs
#                         (default: <repo>/.env.testnet)
#   --dry-run             muestra qué se extendería sin ejecutar
#   -h, --help            muestra esta ayuda
#
# Requisitos:
#   - stellar-cli >= 30.0.1
#   - Identidad configurada con fondos (default: deployer)
#   - .env.testnet generado por deploy.sh con los 5 contract IDs
#   - Wasm compilados en contracts/target/wasm32v1-none/release/
#
# ¿Por qué es necesario?
#   En Soroban, tanto el código Wasm como la instancia del contrato tienen un
#   Time-To-Live (TTL) en ledgers. Si expiran, el contrato deja de ser
#   invocable hasta que se restaure manualmente. Este script extiende ambos
#   TTLs y verifica que la operación fue exitosa.
#
# ¿De dónde saca los datos?
#   - Contract IDs: del .env.testnet generado por deploy.sh.
#   - Wasm hashes: sha256(wasm_bytes), que es exactamente cómo Soroban
#     identifica un Wasm. Se computa con sha256sum (o shasum -a 256 en macOS).
#     Si no hay sha256sum, cae a `stellar contract hash` como fallback.
#
# Recomendación:
#   Ejecutar cada ~25 días (antes de que el TTL de 30 días expire).
#   Considerar automatizarlo con un cron job o GitHub Actions.
#

set -euo pipefail

# --- Configuración por defecto ---
NETWORK="testnet"
SOURCE="deployer"
EXTEND_LEDGERS=535679  # ~30 días (máximo permitido por el CLI)
DRY_RUN=false
ROUTER_CONFIGURED="unknown"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="$(dirname "$SCRIPT_DIR")"
REPO_ROOT="$(dirname "$CONTRACTS_DIR")"
WASM_DIR="$CONTRACTS_DIR/target/wasm32v1-none/release"
ENV_FILE="$REPO_ROOT/.env.testnet"

# --- Parseo de argumentos ---
while [[ $# -gt 0 ]]; do
  case "$1" in
    --network)  NETWORK="$2";  shift 2 ;;
    --source)   SOURCE="$2";   shift 2 ;;
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --dry-run)  DRY_RUN=true;  shift ;;
    -h|--help)
      sed -n '2,38p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) echo "❌ Argumento desconocido: $1" >&2; exit 1 ;;
  esac
done

# --- Logging ---
log_info()  { printf 'ℹ️  %s\n' "$*" >&2; }
log_ok()    { printf '✅ %s\n' "$*" >&2; }
log_warn()  { printf '⚠️  %s\n' "$*" >&2; }
log_error() { printf '❌ %s\n' "$*" >&2; }
log_section() {
  printf '\n═══════════════════════════════════════════════════════\n' >&2
  printf '  %s\n' "$*" >&2
  printf '═══════════════════════════════════════════════════════\n' >&2
}
link() { printf '\e]8;;%s\e\\%s\e]8;;\e\\' "$1" "$1"; }

# --- Verificaciones ---

check_cli() {
  if ! command -v stellar &>/dev/null; then
    log_error "stellar-cli no está instalado."
    echo "  curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh" >&2
    exit 1
  fi
  log_info "Stellar CLI: $(stellar --version | head -n1 | awk '{print $2}')"
}

check_source() {
  if ! stellar keys address "$SOURCE" &>/dev/null; then
    log_error "La identidad '$SOURCE' no existe."
    echo "  stellar keys generate $SOURCE --network $NETWORK --fund" >&2
    exit 1
  fi
  log_info "Usando identidad '$SOURCE' ($(stellar keys address "$SOURCE"))"
}

check_env_file() {
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "No se encontró el archivo .env en: $ENV_FILE"
    echo >&2
    echo "  Archivo esperado: $ENV_FILE" >&2
    echo "  (o pasa la ruta explícita con --env-file <path>)" >&2
    echo >&2
    echo "  ¿Ya corriste deploy.sh? Si no:" >&2
    echo "    cd $CONTRACTS_DIR && ./scripts/deploy.sh --fund" >&2
    exit 1
  fi
  # shellcheck disable=SC1090
  source "$ENV_FILE"

  local missing=()
  for var in GOVERNANCE_ID NP_ID CR_ID CV_ID DR_ID; do
    [[ -z "${!var:-}" ]] && missing+=("$var")
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    log_error "Faltan variables en $ENV_FILE: ${missing[*]}"
    exit 1
  fi
  ROUTER_CONFIGURED="${AUTHORIZED_ROUTER_CONFIGURED:-unknown}"
  log_info "Contract IDs cargados de $ENV_FILE"
}

check_wasm_dir() {
  if [[ ! -d "$WASM_DIR" ]]; then
    log_error "No existe $WASM_DIR. Compila primero:"
    echo "  cd $CONTRACTS_DIR && stellar contract build" >&2
    exit 1
  fi
}

# --- Wasm hash ---
#
# In Soroban, the Wasm hash IS sha256(wasm_bytes). This is how the protocol
# identifies uploaded Wasm. We compute it locally with sha256sum, which is
# faster and more reliable than parsing `stellar contract hash` output.

compute_wasm_hash() {
  local wasm_file="$1"
  [[ ! -f "$wasm_file" ]] && return 1

  if command -v sha256sum &>/dev/null; then
    sha256sum "$wasm_file" | awk '{print tolower($1)}'
    return 0
  fi
  if command -v shasum &>/dev/null; then
    shasum -a 256 "$wasm_file" | awk '{print tolower($1)}'
    return 0
  fi

  # Fallback: stellar contract hash
  local output
  if output=$(stellar contract hash --wasm "$wasm_file" 2>/dev/null); then
    output=$(printf '%s' "$output" | sed -E 's/\x1b\[[0-9;]*m//g')
    local hash
    hash=$(printf '%s' "$output" | grep -oE '[a-fA-F0-9]{64}' | head -n1 | tr 'A-F' 'a-f')
    [[ -n "$hash" ]] && { echo "$hash"; return 0; }
  fi

  return 1
}

# --- Extensión ---

extend_wasm() {
  local hash="$1" name="$2"
  local output exit_code

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[dry-run] would extend Wasm of $name ($hash)"
    return 0
  fi

  log_info "Extendiendo Wasm de $name ($hash)..."

  output=$(stellar contract extend \
      --source "$SOURCE" --network "$NETWORK" \
      --wasm-hash "$hash" \
      --ledgers-to-extend "$EXTEND_LEDGERS" 2>&1) && exit_code=0 || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    local new_ttl
    new_ttl=$(echo "$output" | grep -oP 'New ttl ledger: \K\d+' || echo "unknown")
    log_ok "Wasm de $name extendido. Nuevo TTL: $new_ttl"
  elif echo "$output" | grep -q "No changes detected"; then
    log_warn "Wasm de $name ya tenía TTL suficiente. Sin cambios."
  else
    log_error "Fallo al extender Wasm de $name (exit $exit_code)."
    printf '%s\n' "$output" | head -n 10 >&2
    return 1
  fi
}

extend_instance() {
  local id="$1" name="$2"
  local output exit_code

  if [[ "$DRY_RUN" == "true" ]]; then
    log_info "[dry-run] would extend instance of $name ($id)"
    return 0
  fi

  log_info "Extendiendo instancia de $name ($id)..."

  output=$(stellar contract extend \
      --source "$SOURCE" --network "$NETWORK" \
      --id "$id" \
      --ledgers-to-extend "$EXTEND_LEDGERS" 2>&1) && exit_code=0 || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    local new_ttl
    new_ttl=$(echo "$output" | grep -oP 'New ttl ledger: \K\d+' || echo "unknown")
    log_ok "Instancia de $name extendida. Nuevo TTL: $new_ttl"
    log_info "  ↳ $(link "https://stellar.expert/explorer/$NETWORK/contract/$id")"
  elif echo "$output" | grep -q "No changes detected"; then
    log_warn "Instancia de $name ya tenía TTL suficiente. Sin cambios."
  else
    log_error "Fallo al extender instancia de $name (exit $exit_code)."
    printf '%s\n' "$output" | head -n 10 >&2
    return 1
  fi
}

# --- Smoke test ---

verify_contract_alive() {
  local id="$1" name="$2" fn="$3"
  shift 3
  local args=("$@")

  log_info "Verificando $name.$fn..."

  local output exit_code
  output=$(stellar contract invoke \
      --id "$id" --source "$SOURCE" --network "$NETWORK" \
      -- "$fn" "${args[@]}" 2>&1) && exit_code=0 || exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    local clean
    clean=$(printf '%s\n' "$output" \
      | grep -v "Simulation identified as read-only" \
      | grep -v "Send by rerunning with" \
      | tr '\n' ' ' | sed 's/  */ /g; s/^ //; s/ $//')
    log_ok "$name responde: $clean"
  else
    log_warn "$name no respondió."
    printf '%s\n' "$output" | head -n 5 >&2
    return 1
  fi
}

# --- Main ---

main() {
  log_section "Extendiendo TTL — $NETWORK"
  log_info "Repo:      $REPO_ROOT"
  log_info "Wasm dir:  $WASM_DIR"
  log_info "Env file:  $ENV_FILE"
  log_info "Ledgers:   $EXTEND_LEDGERS (~30 días)"
  [[ "$DRY_RUN" == "true" ]] && log_warn "Modo DRY-RUN activado (sin cambios on-chain)"

  check_cli
  check_source
  check_env_file
  check_wasm_dir
  echo

  local -a NAMES=(
    "governance-account"
    "nonprofit-registry"
    "campaign-registry"
    "campaign-vault"
    "donation-router"
  )
  local -a WASM_FILES=(
    "$WASM_DIR/governance_account.wasm"
    "$WASM_DIR/nonprofit_registry.wasm"
    "$WASM_DIR/campaign_registry.wasm"
    "$WASM_DIR/campaign_vault.wasm"
    "$WASM_DIR/donation_router.wasm"
  )
  local -a CONTRACT_IDS=(
    "$GOVERNANCE_ID" "$NP_ID" "$CR_ID" "$CV_ID" "$DR_ID"
  )

  local failures=0

  # --- Fase 1: Wasm TTL ---
  log_section "Fase 1 — Wasm TTL"
  for i in "${!NAMES[@]}"; do
    local name="${NAMES[$i]}"
    local wasm_file="${WASM_FILES[$i]}"

    if [[ ! -f "$wasm_file" ]]; then
      log_warn "$name: Wasm no encontrado en $wasm_file. Se salta."
      continue
    fi

    local hash
    if hash=$(compute_wasm_hash "$wasm_file"); then
      log_info "$name: sha256 = $hash"
      if ! extend_wasm "$hash" "$name"; then
        failures=$((failures + 1))
      fi
    else
      log_error "$name: no pude computar el sha256 del Wasm."
      log_error "  Archivo: $wasm_file"
      log_error "  Necesitas sha256sum o shasum -a 256 instalado."
      failures=$((failures + 1))
    fi
  done
  echo

  # --- Fase 2: Instancias TTL ---
  log_section "Fase 2 — Instancias TTL"
  for i in "${!NAMES[@]}"; do
    if ! extend_instance "${CONTRACT_IDS[$i]}" "${NAMES[$i]}"; then
      failures=$((failures + 1))
    fi
  done
  echo

  # --- Fase 3: Smoke tests ---
  log_section "Fase 3 — Smoke tests"
  verify_contract_alive "$GOVERNANCE_ID" "governance-account" "get_threshold" \
    || failures=$((failures + 1))
  verify_contract_alive "$NP_ID" "nonprofit-registry" "is_approved" \
    --nonprofit GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5 \
    || failures=$((failures + 1))
  verify_contract_alive "$CR_ID" "campaign-registry" "get_admin" \
    || failures=$((failures + 1))
  verify_contract_alive "$CV_ID" "campaign-vault" "get_authorized_router" \
    || failures=$((failures + 1))
  verify_contract_alive "$DR_ID" "donation-router" "get_fee_bps" \
    || failures=$((failures + 1))
  echo

  # --- Advertencia de authorized_router ---
  if [[ "$ROUTER_CONFIGURED" != "yes" ]]; then
    log_warn "authorized_router NO está configurado (AUTHORIZED_ROUTER_CONFIGURED=$ROUTER_CONFIGURED)."
    log_warn "Mientras fee_bps=0 no aplica, pero debes configurarlo antes de habilitar fees."
    echo "  stellar contract invoke \\"
    echo "    --id $CV_ID --network $NETWORK \\"
    echo "    -- set_authorized_router \\"
    echo "      --admin $GOVERNANCE_ID \\"
    echo "      --router '\"$DR_ID\"'"
    echo
  fi

  # --- Resumen ---
  log_section "Resumen"
  if [[ $failures -eq 0 ]]; then
    log_ok "=== TTL extendido y verificado exitosamente ==="
    echo "Contratos:"
    for i in "${!NAMES[@]}"; do
      printf '  %-22s %s\n' "${NAMES[$i]}:" \
        "$(link "https://stellar.expert/explorer/$NETWORK/contract/${CONTRACT_IDS[$i]}")"
    done
  else
    log_error "=== $failures operaciones fallaron. Revisa los logs. ==="
    exit 1
  fi
}

main "$@"
