# 📦 Contracts — Bitajón

Este directorio contiene la capa de contratos inteligentes de **Bitajón**, implementada en **Rust** sobre **Soroban**, la plataforma de smart contracts de la red **Stellar**.

La misión de esta capa es materializar el **Modelo de Confianza** de Bitajón: sustituir el asistencialismo tradicional por un esquema de **"Pago por Avance"** verificable, donde los fondos se liberan únicamente cuando se demuestra evidencia del impacto real.

> **Estado actual**: 5 contratos desplegados y verificados en Testnet (Protocolo 30 - Bell). 122 tests en verde. Detalles de direcciones, transacciones y estado del despliegue en el [`README.md` raíz](../README.md).

---

## 📖 0. Glosario de Conceptos y su Rol en Bitajón

Para evitar ambigüedades arquitectónicas, definimos los siguientes conceptos clave y su responsabilidad dentro del ecosistema:

| Concepto | Definición General | Rol en Bitajón |
| :--- | :--- | :--- |
| **Crowdfunding** (Financiación Colectiva) | Modelo donde muchas personas aportan pequeñas cantidades para financiar una causa. | Es el **modelo de negocio** general de la plataforma. |
| **Fundraising** (Recaudación de Fondos) | Proceso general de conseguir recursos para una organización. | Es la **actividad** que realizan las fundaciones en la plataforma. |
| **Vaca / Pooling** (Colombia) | Fondo común donde varias personas aportan para un objetivo compartido. | Es la **mecánica de recolección** de fondos entre múltiples donantes hacia una misma campaña. |
| **Escrow** (Custodia Condicionada) | Mecanismo neutral que custodia fondos y los libera al cumplirse condiciones. | Es el **mecanismo técnico** de garantía. En nuestro caso, el contrato `campaign-vault`. |
| **Campaign** (Campaña) | Entidad que representa una iniciativa específica de recaudación. | Es la **unidad lógica** de negocio. Vive como entidad en `campaign-registry` y como estado financiero en `campaign-vault`. **No es un contrato separado**, sino una estructura de datos gestionada por dos contratos especializados. |

---

## 🧭 1. Prerrequisitos y Versiones

Para garantizar la reproducibilidad y compatibilidad con el runtime de Soroban del **Protocolo 30 (Bell)**, el entorno debe ceñirse a estas versiones.

| Componente | Versión Requerida | Notas |
| :--- | :--- | :--- |
| **Rust** | `1.84+` (estable) | El compilador debe soportar el target `wasm32v1-none`. |
| **Target Wasm** | `wasm32v1-none` | Único target soportado por Soroban. **No** usar `wasm32-unknown-unknown`. |
| **Soroban SDK** | `29.0.1` | Incluye parches para CVE-2026-32322 y CVE-2026-24889. |
| **Stellar CLI** | `30.0.1` | Requerida por el SDK 29.0.1. |
| **Protocolo de Red** | `30 (Bell)` | Testnet y Mainnet alineados (Noviembre 2026). |
| **Bun** | `1.1+` | Requerido para `scripts/bootstrap.mjs`. Alternativa: Node.js 20+. |

### 🛠️ Instalación del Entorno

```bash
# 1. Instalar Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Añadir el target correcto para Soroban
rustup target add wasm32v1-none

# 3. Instalar la Stellar CLI (versión 30.0.1)
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh

# 4. Verificar versiones
rustc --version          # Debe ser >= 1.84
stellar --version        # Debe ser 30.0.1
```

> ⚠️ **Advertencia crítica**: Construye siempre los contratos con `stellar contract build`. **Nunca** uses `cargo build` directamente, ya que este último no aplica las configuraciones específicas que el runtime de Soroban requiere para el target `wasm32v1-none`.

---

## 🏗️ 2. Arquitectura del Workspace

El proyecto se organiza como un **Cargo Workspace** que alberga múltiples *crates*, siguiendo los principios de **Scream Architecture**: los nombres de los crates revelan su responsabilidad sin necesidad de abrir el código.

### 📂 Estructura de Directorios

```text
contracts/
├── Cargo.toml                    # Workspace raíz
├── protocol-types/               # Librería: tipos de dominio, errores, constantes
│   └── src/lib.rs
├── protocol-interfaces/          # Librería: traits públicos para cross-contract calls
│   └── src/lib.rs
├── governance-account/           # Contrato: smart account multisig (Ed25519 pubkeys)
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/{integration,auth_flow}.rs
│   └── test_snapshots/
├── nonprofit-registry/           # Contrato: identidad y KYC de fundaciones
│   ├── src/{lib,storage,events,test}.rs
│   └── test_snapshots/
├── campaign-registry/            # Contrato: metadatos de campañas
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   └── test_snapshots/
├── campaign-vault/               # Contrato: custodia y liberación por hitos
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   └── test_snapshots/
├── donation-router/              # Contrato: punto de entrada único con fee
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   └── test_snapshots/
├── scripts/                      # Automatización operativa
│   ├── bootstrap.mjs             # Deploy + router config en una sola pasada
│   ├── extend-ttl.sh             # Extiende TTL de Wasm e instancias
│   └── package.json
├── docs/
│   ├── known-limitations.md
│   ├── frontend-guide.md
│   └── events-reference.md
└── README.md                     # Este archivo
```

### 🎯 ¿Por qué estos nombres?

| Nombre | Responsabilidad Única |
| :--- | :--- |
| **`protocol-types`** | Fuente única de verdad para `struct`, `enum`, errores y constantes del dominio. Cambiar un error aquí lo cambia en todo el ecosistema. |
| **`protocol-interfaces`** | Traits que definen las funciones públicas de cada contrato. Permiten cross-contract calls tipadas y desacopladas de la implementación. |
| **`governance-account`** | Smart account multisig Ed25519 (M-de-N) que puede actuar como `admin` de cualquier contrato o como `verifier` de una campaña. |
| **`nonprofit-registry`** | Ciclo de vida de las fundaciones (registro, aprobación, revocación). |
| **`campaign-registry`** | Creación y cancelación de campañas. Valida que la fundación esté aprobada. |
| **`campaign-vault`** | Custodia los fondos de cada campaña y los libera según el modelo de hitos. Es el "escrow" técnico. |
| **`donation-router`** | Punto de entrada único para donaciones. Aplica el fee de plataforma y enruta al vault. |

### 🧱 Jerarquía de dependencias

```text
protocol-types ◄─── protocol-interfaces ◄─── (todos los contratos)
       ▲                    ▲
       │                    │
       └── governance-account
       └── nonprofit-registry
       └── campaign-registry ◄─── nonprofit-registry (cross-call)
       └── campaign-vault    ◄─── campaign-registry (cross-call)
       └── donation-router   ◄─── campaign-vault    (cross-call)
```

---

## 🧩 3. Descripción de los Contratos

### 3.1. `governance-account` — Multisig Dinámico ✅

**Propósito**: Smart account multisig que puede actuar como `admin` de cualquier contrato o como `verifier` de una campaña.

**Modelo de Firmantes**:
- Signers son **Ed25519 public keys** (`BytesN<32>`), no `Address`.
- Firma: `Vec<SignerProof>` donde cada proof es `{ public_key: BytesN<32>, signature: BytesN<64> }`.
- La verificación se hace con `env.crypto().ed25519_verify()` directamente dentro de `__check_auth`.

**Por qué pubkeys y no Addresses**: `require_auth()` sobre una dirección `G...` requiere que esa dirección aparezca como su propio auth entry en la transacción, lo cual el SDK no puede construir para flujos anidados de smart accounts. La verificación Ed25519 directa sí funciona con un solo auth entry sobre el `governance-account`.

**Funciones exportadas**: `__constructor`, `add_signer`, `remove_signer`, `update_threshold`, `get_signers`, `get_threshold`, `is_signer`, `verify_signatures` (read-only para pre-check off-chain), `__check_auth`.

**Seguridad Aplicada**:
- ✅ Firma criptográfica verificada con `ed25519_verify`.
- ✅ Auto-ajuste de `threshold` si se remueve un signer y el threshold excede el conteo.
- ✅ `NoSigners` si se intenta remover el último signer (previene bricking).
- ✅ Threshold siempre `1..=signers.len()`.
- ✅ Cambios de configuración requieren el threshold actual (previene escalada de privilegios por un solo signer).
- ✅ `extend_instance_ttl` en cada entry point.

---

### 3.2. `nonprofit-registry` — La Identidad Verificada ✅

**Propósito**: Gestionar el ciclo de vida de las fundaciones que desean operar en la plataforma.

**Responsabilidades**:
- **Registro**: Una fundación se registra con un hash de su documentación legal (KYC/AML) almacenado off-chain. El estado inicial es siempre `Pending`.
- **Aprobación**: Solo el `admin` (que puede ser un `governance-account`) puede aprobar o revocar.
- **Consulta**: Expone `is_approved(address) -> bool` para cross-contract calls.

**Privacidad (Ley 1581 de 2012)**: `NonprofitProfile` almacena `email_hash: Bytes` en lugar del correo en claro. El RUT también se almacena como hash. Los datos personales nunca tocan la cadena.

**Transferencia de admin**: dos pasos (`propose_admin` / `accept_admin`) para prevenir lockout accidental.

**Funciones exportadas**: `__constructor`, `register_nonprofit`, `approve_nonprofit`, `revoke_nonprofit`, `is_approved`, `get_profile`, `propose_admin`, `accept_admin`, `get_admin`, `get_pending_admin`.

---

### 3.3. `campaign-registry` — Metadatos de Campañas ✅

**Propósito**: Registrar las campañas creadas por fundaciones aprobadas.

**Responsabilidades**:
- **Creación**: Una fundación aprobada crea una campaña con `name`, `description`, `location`, `target_amount`, `token_address`, `deadline` y `milestone_percentage`.
- **Validación**: Antes de crear, se invoca `nonprofit-registry.is_approved(fundacion)`.
- **Cancelación**: Solo la fundación dueña puede cancelar una campaña `Active`.

**Milestone obligatorio (Opción C)**: `milestone_percentage` debe estar en `MIN_MILESTONE_PERCENTAGE..=MAX_MILESTONE_PERCENTAGE` (`1..=90`). **No hay default implícito**. El cap de 90% garantiza que al menos 10% de `target_amount` quede atado a evidencia, preservando el modelo "Payment by Progress".

**Funciones exportadas**: `__constructor`, `create_campaign`, `cancel_campaign`, `get_campaign`, `propose_admin`, `accept_admin`, `get_admin`, `get_pending_admin`.

---

### 3.4. `campaign-vault` — El Motor de Custodia ✅

**Propósito**: Custodiar los fondos de cada campaña y liberarlos según el modelo de hitos.

**Modelo de Datos**:
```rust
pub struct VaultState {
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
    pub target_amount: i128,       // cacheado al crear el vault
    pub deadline: u64,             // cacheado al crear el vault
    pub milestone_percentage: u32, // cacheado al crear el vault
    pub verifier: Address,         // rol separado del admin
    pub total_deposited: i128,
    pub initial_release_done: bool,
    pub evidence_hash: Option<Bytes>,
    pub final_release_done: bool,
    pub paused: bool,              // freno de emergencia
}
```

**Flujo**:
1. **`create_vault`**: La fundación crea el vault de una campaña. Se cachean `token_address`, `target_amount`, `deadline` y `milestone_percentage` para evitar cross-calls en el hot-path.
2. **`deposit`**: Los donantes transfieren stablecoins. Al alcanzar `target_amount`, se libera automáticamente `milestone_percentage` a la fundación (patrón CEI estricto).
3. **`submit_evidence`**: La fundación sube el hash de la evidencia. Puede sobrescribirse hasta el `release_final`.
4. **`release_final`**: El **verifier** (no el admin) valida la evidencia y libera el balance restante.

**Fixes del feedback incorporados**:
- **H1 (refunds pull)**: `claim_refund(campaign_id, donor)` permite a cada donante reclamar su aporte cuando la campaña expira, se cancela, o se pausa sin haber liberado el milestone inicial. Contribuciones rastreadas por `(campaign, donor)` en storage persistente.
- **H2 (milestone custom)**: cacheado y usado en `deposit` y `release_final`.
- **H3 (TOCTOU)**: `release_final(campaign_id, verifier, expected_evidence)` falla con `InvalidEvidenceHash` si la evidencia cambió entre la revisión y la firma. Distingue `EvidenceNotSubmitted` (#8) de `InvalidEvidenceHash` (#29).
- **H4 (pause)**: `pause_vault` / `unpause_vault` bloquean depósitos y habilitan refunds inmediatos.

**Roles separados**: `admin` (configuración del protocolo) y `verifier` (validación de evidencia). Un admin comprometido no puede liberar el balance final; un verifier comprometido no puede reconfigurar el protocolo.

**Funciones exportadas**: `__constructor`, `create_vault`, `deposit`, `claim_refund`, `submit_evidence`, `release_final`, `pause_vault`, `unpause_vault`, `get_vault`, `set_authorized_router`, `get_authorized_router`, `set_verifier_for_campaign`, `propose_admin`, `accept_admin`, `get_admin`, `get_pending_admin`.

---

### 3.5. `donation-router` — Punto de Entrada Único ✅

**Propósito**: Ser el único punto de entrada para donaciones, abstrayendo al frontend y aplicando el fee de plataforma (Modelo B: fee descontado del gross).

**Flujo atómico**:
```text
donor → router.donate(campaign_id, amount)
         ├── fee = amount * fee_bps / 10_000
         ├── token.transfer(donor → treasury, fee)
         └── vault.deposit(campaign_id, donor, amount - fee)  ← cross-call
```

Todo ocurre en una sola transacción firmada por el donante. Si cualquier paso falla, la transacción completa revierte.

**Funciones exportadas**: `__constructor`, `donate`, `quote`, `update_fee_bps`, `update_treasury`, `get_fee_bps`, `get_treasury`, `get_campaign_vault`, `propose_admin`, `accept_admin`, `get_admin`, `get_pending_admin`.

---

## 🚀 4. Estado del Deploy

**Estado**: ✅ Desplegado y verificado en Testnet (Protocolo 30 - Bell)
**Fee de plataforma**: `0 bps` (intencional para el demo)
**Bypass del fee**: ✅ Cerrado (`authorized_router` configurado)
**TTL**: ✅ Extendido a ~30 días para los 5 Wasm + 5 instancias

Los detalles específicos del despliegue — identidad del deployer, direcciones `C...` de los 5 contratos, hashes de Wasm, hashes de transacciones de deploy, links a Stellar Expert y el archivo `.env.testnet` — viven en el [`README.md` raíz](../README.md), que es la fuente de verdad operativa del proyecto.

### 🔐 Sobre el modelo de gobernanza en Testnet

- **Fase actual**: `governance-account` con `[deployer]` y `threshold = 1`. Funcionalmente equivalente a una EOA, pero con el flujo multisig ya probado. Escalar a 2-de-3 es una llamada a `add_signer` + `update_threshold`, sin redeploy.
- **Pre-Mainnet**: Obligatorio que `governance-account` tenga `>= 2` signers y `threshold >= 2`. Un solo signer en Mainnet es un riesgo operacional serio.
- **Nota CLI**: `stellar contract invoke` no puede firmar por smart accounts (`C...`). Las operaciones de admin que requieran firma del `governance-account` deben pasar por `scripts/bootstrap.mjs` (que construye el `SorobanAuthorizationEntry` a mano) o por el frontend con `@stellar/stellar-sdk`.

---

## 🛡️ 5. Activación del `authorized_router`

Tras el deploy, el `campaign-vault` arranca en **modo abierto** (`authorized_router = None`). El script `scripts/bootstrap.mjs` configura el modo cerrado en la misma pasada del deploy, construyendo la firma Ed25519 correctamente:

```bash
cd contracts/scripts
bun install 
bun run bootstrap
```
Lo hice con bun, se puede con npm, pnpm, yarn, etc...

El script realiza automáticamente:
1. Deploy de los 5 contratos en orden de dependencia.
2. Configuración de `authorized_router` en el vault con un `SorobanAuthorizationEntry` firmado vía Ed25519 sobre la preimagen CAP-71 (envelope type 10).
3. Bump del instruction limit para cubrir el costo real de `__check_auth` con firmas.
4. Backup del `.env.testnet` anterior.
5. Escritura del nuevo `.env.testnet` con `AUTHORIZED_ROUTER_CONFIGURED=yes`.

### ¿Por qué funciona `authorized_router`?

Soroban considera que **la llamada directa de un contrato a otro está implícitamente autorizada**. Cuando el `donation-router` llama a `vault.deposit()`, el vault exige `router.require_auth()`, y esa autorización se cumple por el solo hecho de ser el invocador directo.

| Escenario | `router.require_auth()` | Resultado |
| :--- | :--- | :--- |
| `router.donate()` → `vault.deposit()` | ✅ Autorización implícita | **Pasa** |
| `donor.deposit()` (directo al vault) | ❌ El donor no puede producir la firma del router | **Falla** |
| Admin llama `set_authorized_router(admin, None)` | — | Modo abierto restaurado |

Tres tests de integración cubren los escenarios: `test_direct_deposit_blocked_when_router_configured`, `test_donate_works_when_router_is_authorized_in_vault`, `test_deposit_works_after_clearing_router`.

### Checklist de Deploy a Mainnet

Antes de habilitar el cobro de fee en producción:

1. ✅ Desplegar `donation-router`.
2. ✅ Llamar `vault.set_authorized_router(admin, Some(router_address))`.
3. ✅ Llamar `router.update_fee_bps(admin, 200)` (o el valor deseado).
4. ✅ Smoke test: el bypass directo debe fallar.
5. ✅ `governance-account` con `>= 2` signers y `threshold >= 2`.

> ⚠️ **Mientras `authorized_router = None`, el fee NO está protegido**. Esto es intencional para el MVP (fee = 0), pero **debe activarse antes del cobro real**.

---

## 💰 6. Modelo de Fee: Modelo B (Fee FROM DEPOSIT)

El `donation-router` aplica un fee configurable en **basis points** (`fee_bps`), con un **cap duro de 10%** (`MAX_FEE_BPS = 1000`).

### Fórmula

```text
fee_amount = (gross_amount * fee_bps) / 10_000
net_amount = gross_amount - fee_amount
```

- El **donante paga** `gross_amount`.
- La **tesorería recibe** `fee_amount`.
- El **vault recibe** `net_amount`.
- La **fundación recibe** `net_amount` (menos comisiones de red).

### ¿Por qué Modelo B?

| Modelo | Descripción | Decisión |
| :--- | :--- | :--- |
| **A. Fee ON TOP** | Donante paga `gross + fee`. Vault recibe `gross`. | ❌ Rechazado: cargo extra visible al donante. |
| **B. Fee FROM DEPOSIT** | Donante paga `gross`. Vault recibe `gross - fee`. | ✅ **Elegido**: alineado con Vaki/GoFundMe. |
| **C. Fee FROM RELEASE** | Se cobra al liberar fondos. | ❌ Rechazado: cash flow diferido, complejidad. |

### ⚠️ Los `target_amount` se expresan en **NET**

Esto es **crítico para el frontend**:

- Una campaña con `target_amount = 10_000` y `fee_bps = 200` (2%) requiere que el donante pague:

  ```text
  gross_amount = ceil(10_000 * 10_000 / (10_000 - 200)) = 10_204
  fee_amount   = 10_204 * 200 / 10_000 = 204
  net_amount   = 10_204 - 204 = 10_000
  ```

- El frontend debe:
  1. Llamar a `router.quote(gross_amount)` para obtener `{ gross, fee, net }`.
  2. Mostrar los 3 valores al donante.
  3. Calcular `gross` a partir del `target_amount` de la campaña.

Los contratos **intencionalmente no hacen este cálculo**: es una preocupación de UX, no de protocolo.

### ⚠️ El `milestone_percentage` es obligatorio

A diferencia del fee, el `milestone_percentage` **NO tiene default**. El frontend debe pedirlo al crear la campaña, dentro del rango `1..=90`. El valor recomendado para sugerir es `RECOMMENDED_MILESTONE_PERCENTAGE = 50`.

El cap de 90% garantiza que al menos 10% del `target_amount` quede siempre atado a evidencia, protegiendo a los donantes de una accountability vacía.

### Estado por defecto en Testnet

- `fee_bps = 0` (facilita demos sin fricción).
- El admin puede activar el fee sin redeploy vía `update_fee_bps(admin, new_fee_bps)`.

---

## 🧪 7. Estrategia de Pruebas

### 7.1. Estructura de Tests

| Capa | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Unit Tests** | `src/test.rs` | Lógica interna de un contrato aislado. Rápidos, sin cross-contract calls. |
| **Integration Tests** | `tests/integration.rs` | Flujo completo entre contratos. Despliegan todos los contratos y verifican cross-calls. |
| **Auth Flow Tests** | `tests/auth_flow.rs` (solo `governance-account`) | Verificación Ed25519 real con firmas generadas por `ed25519-dalek`. |
| **Differential Tests** | `test_snapshots/` | Detectan cambios no intencionados en el estado del ledger o los eventos. |

### 7.2. Cobertura Actual (122 tests)

| Contrato | Unit | Integration | Auth Flow | Total |
| :--- | :--- | :--- | :--- | :--- |
| `governance-account` | 12 | 3 | 9 | **24** |
| `nonprofit-registry` | 13 | — | — | **13** |
| `campaign-registry` | 5 | 11 | — | **16** |
| `campaign-vault` | 3 | 37 | — | **40** |
| `donation-router` | 13 | 16 | — | **29** |
| **TOTAL** | **46** | **67** | **9** | **122** |

**Casos cubiertos**:
- ✅ Happy path completo (registro → creación → depósito → evidencia → liberación).
- ✅ Todos los errores del enum `Error` (códigos 1-32).
- ✅ Milestone custom (1, 30, 90) y rechazo de 0, 91, 100.
- ✅ H1: refunds pull (expiry, cancel, pause, active-block, post-release-block, double-claim).
- ✅ H2: milestone custom respetado en `deposit` y `release_final`.
- ✅ H3: TOCTOU rechaza evidencia alterada.
- ✅ H4: pause bloquea depósitos y habilita refunds.
- ✅ Verifier role separado del admin.
- ✅ Two-step admin transfer en los 4 contratos con admin.
- ✅ Multisig Ed25519 con firmas reales (`auth_flow.rs`).
- ✅ Bypass del router cerrado (3 tests).

### 7.3. Limitación Conocida: `mock_all_auths`

Los tests funcionales usan `env.mock_all_auths()`, que bypassa el dispatch de auth del host. Esto significa que:

- Los tests **NO validan** que `require_auth()` funcione en producción.
- El test de bypass del router **SÍ usa `env.mock_auths`** con autorización específica del donor.
- `governance-account` tiene 9 tests en `auth_flow.rs` que **SÍ verifican firmas Ed25519 reales**, cerrando ese gap para el contrato más crítico.

### 7.4. Snapshots (Differential Testing)

El SDK de Soroban genera archivos JSON en `test_snapshots/` al finalizar cada prueba. Capturan todo el estado del ledger (storage + eventos + árbol de autenticación).

**Regla de oro**: **Los snapshots deben ser commiteados al repositorio**. Actúan como red de seguridad contra efectos secundarios no intencionados.

**Verificación pre-commit**:
```bash
cargo test && git diff --exit-code -- '*/test_snapshots/'
```
Si devuelve `exit 0` sin output, los snapshots están al día.

---

## ⚙️ 8. Comandos de Desarrollo

### Compilación

```bash
# Compilar todos los contratos del workspace.
stellar contract build

# Compilar un contrato específico.
stellar contract build --package campaign-vault
```

### Testing

```bash
# Ejecutar todos los tests del workspace.
cargo test

# Ejecutar solo los tests de un contrato.
cargo test -p campaign-vault

# Ejecutar solo los unit tests.
cargo test -p campaign-vault --lib

# Ejecutar solo los integration tests.
cargo test -p campaign-vault --test integration

# Ejecutar solo los auth flow tests (governance-account).
cargo test -p governance-account --test auth_flow
```

### Verificación de Snapshots

```bash
cargo test && git diff --exit-code -- '*/test_snapshots/'
cargo test 2>&1 | grep -i warning && echo "⚠️ Warnings" || echo "✅ No warnings"
```

---

## 🔄 9. CI/CD

El workflow de GitHub Actions (`.github/workflows/contracts-ci.yml`) se ejecuta en cada push o PR a `main`:

1. **Instalación**: Rust + target `wasm32v1-none` + Stellar CLI v30.0.1.
2. **Compilación**: `stellar contract build` para todos los contratos.
3. **Testing**: `cargo test` para todos los crates.
4. **Verificación de Snapshots**: `git diff --exit-code -- '*/test_snapshots/'` para garantizar que los snapshots commiteados estén al día.

Si el workflow falla por snapshots desactualizados, ejecuta localmente `cargo test && git add '*/test_snapshots/' && git commit -m "chore(snapshots): regenerate"` y haz push de nuevo.

---

## 🛠️ 10. Scripts Operativos

### `scripts/bootstrap.mjs`

Deploy completo en una sola pasada. Ver la sección [§5](#-5-activación-del-authorized_router).

**Flags**:
```bash
bun run bootstrap                          # deploy 5 contratos + configurar router
bun run bootstrap --skip-deploy            # reusar IDs de .env.testnet, solo configurar router
bun run bootstrap --skip-router            # deploy only
bun run bootstrap --fund                   # fondear deployer con Friendbot primero
bun run bootstrap --extend-ttl             # ejecutar extend-ttl.sh al final
bun run bootstrap --fee-bps 200            # fee inicial en bps (default: 0)
bun run bootstrap --source <identity>      # identidad del CLI (default: deployer)
```

**Dependencia**: `@stellar/stellar-sdk@^17.4.0` (`bun install` en `contracts/scripts/`).

### `scripts/extend-ttl.sh`

Extiende el TTL de los 5 Wasm y las 5 instancias a ~30 días. Lee los contract IDs de `.env.testnet` y computa los Wasm hashes localmente (`sha256sum` o `shasum -a 256`).

```bash
cd contracts
./scripts/extend-ttl.sh

# Opciones
./scripts/extend-ttl.sh --network mainnet
./scripts/extend-ttl.sh --env-file /path/to/.env
./scripts/extend-ttl.sh --dry-run
```

**Cuándo correrlo**: después de cada `deploy` (las instancias arrancan con TTL default, no al máximo) y luego cada ~25 días para evitar archivado.

---

## 🔗 11. Bindings para el Frontend

Los bindings TypeScript tipados ya están generados en [`../bindings/`](../bindings):

```text
bindings/
├── governance-account/     # NEW: multisig con pubkey-based signers
├── campaign-registry/
├── campaign-vault/         # incluye claim_refund, pause_vault, release_final con expected_evidence
├── donation-router/
└── nonprofit-registry/     # incluye two-step admin, email_hash
```

Cada paquete expone una clase `Client` con métodos tipados. El frontend los importa como paquetes NPM locales.

### Regeneración (si cambia un contrato)

```bash
cd contracts
for wasm in governance_account nonprofit_registry campaign_registry campaign_vault donation_router; do
  dir=$(echo "$wasm" | tr '_' '-')
  stellar contract bindings typescript \
    --wasm target/wasm32v1-none/release/$wasm.wasm \
    --output-dir ../bindings/$dir --overwrite
done
```

> ⚠️ Los bindings generados por `stellar contract bindings typescript` están **deprecados** según el CLI 30. El reemplazo oficial es `js-stellar-sdk`. Mientras el equipo de frontend evalúa la migración, los bindings actuales son funcionales.

Para la guía completa de integración (tipos, flujos, manejo de errores, UX), consulta [`docs/frontend-guide.md`](./docs/frontend-guide.md).

---

## 🗺️ 12. Roadmap

| Fase | Entregable | Estado |
| :--- | :--- | :--- |
| **F0** | Workspace + `protocol-types` + `protocol-interfaces` | ✅ |
| **F1** | `nonprofit-registry` (email_hash, two-step admin, TTL) | ✅ |
| **F2** | `campaign-registry` (milestone 1..=90, two-step admin) | ✅ |
| **F3** | `campaign-vault` (H1-H4, verifier, pause, TOCTOU) | ✅ |
| **F4** | `governance-account` (multisig Ed25519, verify_signatures) | ✅ |
| **F5** | `donation-router` (atomic donate, two-step admin) | ✅ |
| **F6** | Tests actualizados (122 en verde) + snapshots regenerados | ✅ |
| **F7** | Deploy Testnet + `authorized_router` + TTL extendido | ✅ |
| **F8** | Bindings TypeScript regenerados (5 paquetes) | ✅ |
| **F9** | Verificación pública en Stellar Expert (GitHub Release) | ✅ |
| **F10** | Documentación completa (`known-limitations`, `frontend-guide`, `events-reference`) | ✅ |
| **F11** | Google Sign-In (frontend, vía Accesly/Blux o SDK similar) | ⏳ Futuro |
| **F12** | On-ramps (SEP-24/6) con VANK/Pollar (frontend + Anchor) | ⏳ Futuro |
| **F13** | Batching de refunds (contrato auxiliar) | ⏳ Discutiendo |
| **F14** | Deploy a Mainnet con `governance-account` 2-of-3 | ⏳ Futuro |

### Consideraciones futuras (no bloqueantes)

- **Google Sign-In**: Los contratos aceptan cualquier `Address` (`G...` o `C...`). Un SDK como Accesly o Blux puede crear la smart account asociada a Google y transferirle el admin vía `propose_admin` / `accept_admin`. Cero cambios en los contratos.
- **Irys**: El contrato ya abstrae el almacenamiento (`evidence_hash: Bytes`). Usar Irys off-chain no requiere tocar el contrato.
- **Wasm upgrade path**: Decisión de diseño (reglas inmutables). Si se requiere, implementar con timelock de 48h. Documentado en `known-limitations.md`.

---

## 🚧 13. Limitaciones Conocidas

Consulta [`docs/known-limitations.md`](./docs/known-limitations.md) para el detalle completo. Resumen:

| Limitación | Estado | Mitigación |
| :--- | :--- | :--- |
| Refunds en campañas canceladas | ✅ Resuelto (H1) | `claim_refund` pull-based |
| Sobrescritura de evidencia | ✅ Resuelto (H3) | `release_final` con `expected_evidence` |
| Pause de emergencia | ✅ Resuelto (H4) | `pause_vault` / `unpause_vault` |
| Milestone 100% | ✅ Resuelto (H2) | Cap de 90% vía `MAX_MILESTONE_PERCENTAGE` |
| Admin centralizado | ⚠️ Mitigado (H5) | `governance-account` multisig; escalar a 2-de-3 antes de Mainnet |
| Datos de fundación on-chain | ✅ Resuelto (H6) | `email_hash` en lugar de email |
| Sin Wasm upgrade path | ⚠️ Decisión de diseño | Reglas inmutables; si se requiere, timelock post-Demo |
| `authorized_router = None` por defecto | ⚠️ Intencional para demos | Activar con `bootstrap.mjs` antes de Mainnet |

---

## 📚 14. Referencias

- [Stellar Docs — Build](https://developers.stellar.org/docs/build)
- [Stellar Docs — Authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
- [Stellar Docs — Contract Invoker Auth](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization#contract-invoker)
- [CAP-71: Address-bound Soroban Authorization](https://github.com/stellar/stellar-protocol/blob/master/core/cap-0071.md)
- [Soroban SDK 29.0.1](https://crates.io/crates/soroban-sdk/29.0.1)
- [Differential Tests with Test Snapshots](https://developers.stellar.org/docs/build/guides/testing/differential-tests-with-test-snapshots/)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Protocol 30 (Bell) CAPs](https://developers.stellar.org/docs/learn/fundamentals/stellar-consensus-protocol)
