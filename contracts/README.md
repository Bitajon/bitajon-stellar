# 📦 Contracts — Thriving Stellar

Este directorio contiene la capa de contratos inteligentes de **Thriving Stellar**, implementada en **Rust** sobre **Soroban**, la plataforma de smart contracts de la red **Stellar**.

La misión de esta capa es materializar el **Modelo de Confianza** de ThrivingHub: sustituir el asistencialismo tradicional por un esquema de **"Pago por Avance"** verificable, donde los fondos se liberan únicamente cuando se demuestra evidencia del impacto real.

---

## 📖 0. Glosario de Conceptos y su Rol en Thriving

Para evitar ambigüedades arquitectónicas, definimos los siguientes conceptos clave y su responsabilidad dentro del ecosistema de Thriving Stellar:

| Concepto | Definición General | Rol en Thriving Stellar |
| :--- | :--- | :--- |
| **Crowdfunding** (Financiación Colectiva) | Modelo donde muchas personas aportan pequeñas cantidades para financiar una causa o proyecto. | Es el **modelo de negocio** general de la plataforma. |
| **Fundraising** (Recaudación de Fondos) | Proceso general de conseguir recursos para una organización o causa. | Es la **actividad** que realizan las fundaciones en la plataforma. |
| **Vaca / Pooling** (Colombia) | Fondo común donde varias personas aportan dinero para un objetivo compartido. | Es la **mecánica de recolección** de fondos entre múltiples donantes hacia una misma campaña. |
| **Escrow** (Custodia Condicionada) | Mecanismo neutral que custodia fondos y los libera al cumplirse condiciones acordadas. | Es el **mecanismo técnico** de garantía. En nuestro caso, el contrato `campaign-vault` que custodia y distribuye los fondos a medida que se cumplen hitos. |
| **Campaign** (Campaña) | Entidad que representa una iniciativa específica de recaudación (ej. "Kits escolares 2026"). | Es la **unidad lógica** de negocio. Vive como entidad en `campaign-registry` y como estado financiero en `campaign-vault`. Agrupa múltiples donaciones (Pooling) y define los hitos a cumplir. **No es un contrato separado**, sino una estructura de datos gestionada por dos contratos especializados. |

---

## 🧭 1. Prerrequisitos y Versiones

Para garantizar la reproducibilidad y compatibilidad con el runtime de Soroban del **Protocolo 30 (Bell)**, el entorno de desarrollo debe ceñirse estrictamente a las siguientes versiones.

| Componente | Versión Requerida | Notas |
| :--- | :--- | :--- |
| **Rust** | `1.84+` (estable) | El compilador debe soportar el target `wasm32v1-none`. |
| **Target Wasm** | `wasm32v1-none` | Único target soportado por Soroban. **No** usar `wasm32-unknown-unknown`. |
| **Soroban SDK** | `29.0.1` | Incluye parches para CVE-2026-32322 y CVE-2026-24889. |
| **Stellar CLI** | `30.0.1` | Requerida por el SDK 29.0.1. Incluye `stellar contract build`. |
| **Protocolo de Red** | `30 (Bell)` | Testnet y Mainnet alineados (Noviembre 2026). |

### 🛠️ Instalación del Entorno

```bash
# 1. Instalar Rust (si no se tiene)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Añadir el target correcto para Soroban
rustup target add wasm32v1-none

# 3. Instalar la Stellar CLI (versión 30.0.1)
curl -fsSL https://github.com/stellar/stellar-cli/raw/main/install.sh | sh

# 4. Verificar versiones
rustc --version          # Debe ser >= 1.84
stellar --version        # Debe ser 30.0.1
```

> ⚠️ **Advertencia Crítica**: Construye siempre los contratos con `stellar contract build`. **Nunca** uses `cargo build` directamente, ya que este último no aplica las configuraciones específicas que el runtime de Soroban requiere para el target `wasm32v1-none`.

---

## 🏗️ 2. Arquitectura del Workspace

El proyecto se organiza como un **Cargo Workspace** que alberga múltiples *crates* (paquetes de Rust), siguiendo los principios de **Scream Architecture**: los nombres de los crates revelan su responsabilidad sin necesidad de abrir el código.

### 📂 Estructura de Directorios

```text
contracts/
├── Cargo.toml                    # Workspace raíz (miembros, dependencias, profiles)
├── thriving-types/               # Librería: tipos de dominio, errores, constantes
│   └── src/lib.rs
├── thriving-interfaces/          # Librería: traits públicos para cross-contract calls
│   └── src/lib.rs
├── nonprofit-registry/           # Contrato: identidad y KYC de fundaciones
│   ├── src/{lib,storage,events,test}.rs
│   ├── test_snapshots/test/*.json
│   └── Cargo.toml
├── campaign-registry/            # Contrato: metadatos de campañas
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   ├── test_snapshots/{test/*.json, *.json}
│   └── Cargo.toml
├── campaign-vault/               # Contrato: custodia y liberación de fondos por hitos
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   ├── test_snapshots/{test/*.json, *.json}
│   └── Cargo.toml
├── donation-router/              # Contrato: punto de entrada único con fee de plataforma
│   ├── src/{lib,storage,events,test}.rs
│   ├── tests/integration.rs
│   ├── test_snapshots/{test/*.json, *.json}
│   └── Cargo.toml
├── docs/known-limitations.md     # Limitaciones conocidas del MVP
└── README.md                     # Este archivo
```

### 🎯 ¿Por qué estos nombres?

| Nombre | Responsabilidad Única |
| :--- | :--- |
| **`thriving-types`** | Fuente única de verdad para `struct`, `enum`, errores y constantes del dominio. Cambiar un error aquí lo cambia en todo el ecosistema. |
| **`thriving-interfaces`** | Traits que definen las funciones públicas de cada contrato. Permiten cross-contract calls tipadas y desacopladas de la implementación. |
| **`nonprofit-registry`** | Gestiona el ciclo de vida de las fundaciones (registro, aprobación, revocación). |
| **`campaign-registry`** | Gestiona la creación y cancelación de campañas, validando que la fundación esté aprobada. |
| **`campaign-vault`** | Custodia los fondos de cada campaña y los libera según el modelo de hitos. Es el "escrow" técnico. |
| **`donation-router`** | Punto de entrada único para donaciones. Aplica la comisión de plataforma y enruta al vault. |

---

## 🧩 3. Descripción de los Contratos

### 3.1. `nonprofit-registry` — La Identidad Verificada ✅

**Propósito**: Gestionar el ciclo de vida de las fundaciones que desean operar en la plataforma.

**Responsabilidades**:
- **Registro**: Una fundación (identificada por una `Address` de Stellar) se registra con un hash de su documentación legal (KYC/AML) almacenado off-chain (ej. IPFS). El estado inicial es siempre `Pending`, independientemente del input del llamador.
- **Aprobación**: Solo la dirección `Admin` (designada en el constructor) puede aprobar o revocar una fundación.
- **Consulta**: Expone `is_approved(address) -> bool` que otros contratos (como `campaign-registry`) pueden invocar vía cross-contract call.

**Estado Clave**:
- `Admin: Address` (instance storage).
- `Profile(Address): NonprofitProfile` (persistent storage con TTL gestionado).

**Seguridad Aplicada**:
- ✅ `require_auth()` en todas las mutaciones.
- ✅ Verificación manual de `admin == stored_admin` (defensa en profundidad).
- ✅ `register_nonprofit` fuerza `status = Pending` (previene bypass de aprobación).
- ✅ `extend_instance_ttl` en cada mutación (previene "bricking" del contrato por inactividad).
- ✅ `extend_ttl` en lecturas de perfiles (evita archivado de datos activos).

**Funciones exportadas**: `__constructor`, `register_nonprofit`, `approve_nonprofit`, `revoke_nonprofit`, `is_approved`, `get_profile`.

---

### 3.2. `campaign-registry` — Metadatos de Campañas ✅

**Propósito**: Registrar las campañas creadas por fundaciones aprobadas y validar la legitimidad vía cross-contract call a `nonprofit-registry`.

**Responsabilidades**:
- **Creación**: Una fundación aprobada crea una campaña con `name`, `description`, `location`, `target_amount`, `token_address`, `deadline` y `milestone_percentage`.
- **Validación**: Antes de crear, se invoca `nonprofit-registry.is_approved(fundacion)`. Si falla, la transacción se revierte con `NonprofitNotApproved`.
- **Cancelación**: Solo la fundación dueña puede cancelar una campaña `Active`.

**Estado Clave**:
- `Admin`, `NonprofitRegistry`, `NextCampaignId` (instance storage).
- `Campaign(u64): Campaign` (persistent storage con TTL gestionado).

**Seguridad Aplicada**:
- ✅ Validación de `target_amount > 0` (`InvalidAmount`).
- ✅ Validación de `deadline > ledger.timestamp()` (`InvalidDeadline`).
- ✅ Validación de `milestone_percentage <= 100` (`InvalidMilestonePercentage`).
- ✅ Validación del `token_address` (llamada a `decimals()` para verificar que es un SAC real).
- ✅ Patrón CEI (Checks-Effects-Interactions) en `cancel_campaign`.
- ✅ `extend_instance_ttl` en mutaciones y `extend_ttl` en lecturas.

**Funciones exportadas**: `__constructor`, `create_campaign`, `cancel_campaign`, `get_campaign`.

---

### 3.3. `campaign-vault` — El Motor de Custodia ✅

**Propósito**: Custodiar los fondos de una o varias **campañas** y liberarlos de forma programática al cumplirse los hitos.

**Modelo de Datos**:
```rust
pub struct VaultState {
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
    pub target_amount: i128,   // cacheado al crear el vault
    pub deadline: u64,         // cacheado al crear el vault
    pub total_deposited: i128,
    pub initial_release_done: bool,
    pub evidence_hash: Option<Bytes>,
    pub final_release_done: bool,
}
```

**Flujo Lógico (MVP)**:
1. **`create_vault`**: La fundación crea el vault de una campaña. Se cachean `token_address`, `target_amount` y `deadline` para evitar cross-contract calls en el hot-path (`deposit`).
2. **`deposit`**: Los donantes transfieren stablecoins. Al alcanzar `target_amount`, se libera automáticamente el **50%** a la fundación (patrón CEI estricto: Effects antes de Interactions).
3. **`submit_evidence`**: La fundación sube el hash de la evidencia (fotos/videos) a IPFS/Irys.
4. **`release_final`**: El Admin valida la evidencia y libera el **50%** restante.

**Seguridad Aplicada**:
- ✅ Patrón CEI estricto: el estado se persiste antes de cualquier transferencia externa.
- ✅ `create_vault` deriva `token_address` de la campaña (no acepta un argumento que podría no coincidir).
- ✅ `deposit` rechaza campañas expiradas (`CampaignExpired`) y vaults finalizados (`VaultFinalized`).
- ✅ Validación de `evidence_hash` no vacío (`InvalidEvidence`).
- ✅ `extend_instance_ttl` en mutaciones y `extend_ttl` en lecturas.
- ✅ **Bypass del router cerrado**: ver sección [§5](#-5-modelo-de-fee-y-bypass-del-router).

**Funciones exportadas**: `__constructor`, `create_vault`, `deposit`, `submit_evidence`, `release_final`, `get_vault`, `set_authorized_router`, `get_authorized_router`.

---

### 3.4. `donation-router` — Punto de Entrada Único ✅

**Propósito**: Ser el único punto de entrada para donaciones, abstrayendo al frontend y aplicando la comisión de plataforma (Modelo B: fee descontado del gross).

**Flujo de una Donación**:
```text
donor → router.donate(campaign_id, amount)
         ├── fee = amount * fee_bps / 10_000
         ├── token.transfer(donor → treasury, fee)
         └── vault.deposit(campaign_id, donor, amount - fee)  ← cross-call
```

**Ventajas**:
- Centraliza la aplicación de comisiones de plataforma sin modificar cada vault.
- Facilita la integración con **on-ramps** (VANK, Pollar) que requieren un punto de entrada único.
- Preparado para añadir **prueba de humanidad** post-MVP.

**Funciones exportadas**: `__constructor`, `donate`, `quote`, `update_fee_bps`, `update_treasury`, `get_fee_bps`, `get_treasury`.

---

## 💰 4. Modelo de Fee: Modelo B (Fee FROM DEPOSIT)

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
  1. Llamar a `router.quote(gross_amount)` para obtener el desglose `{ gross, fee, net }`.
  2. Mostrar los 3 valores al donante.
  3. Calcular `gross` a partir del `target_amount` de la campaña.

Los contratos **intencionalmente no hacen este cálculo**: es una preocupación de UX, no de protocolo, y mantenerlo fuera de la cadena minimiza el bytecode y facilita la auditoría.

### Estado por defecto en el MVP

- `fee_bps = 0` al desplegar en Testnet (facilita demos sin fricción).
- El admin puede activar el fee sin redeploy vía `update_fee_bps(admin, new_fee_bps)`.

---

## 🔒 5. Modelo de Fee y Bypass del Router

### El problema del bypass

Sin protección, un donante que conoce la dirección del `campaign-vault` y el `campaign_id` podría llamar `vault.deposit()` directamente, evitando pagar el fee de plataforma. Esto **rompería el modelo de negocio**.

### La solución: `authorized_router`

El `campaign-vault` implementa el patrón oficial de Soroban para verificar el invocador directo en sub-llamadas:

1. **`set_authorized_router(admin, Some(router_address))`**: el admin configura qué router está autorizado a llamar `deposit`.
2. **En `deposit`**, si hay un router configurado:
   ```rust
   if let Some(expected_router) = get_authorized_router(&env) {
       expected_router.require_auth();
   }
   ```

### ¿Por qué funciona?

Soroban considera que **la llamada directa de un contrato a otro está implícitamente autorizada** (documentación oficial: *"All the direct calls that the current contract performs are always considered to have been authorized"*).

| Escenario | `router.require_auth()` | Resultado |
| :--- | :--- | :--- |
| `router.donate()` → `vault.deposit()` | ✅ Autorización implícita (router es el invocador) | **Pasa** |
| `donor.deposit()` (directo al vault) | ❌ El donor no puede producir la firma del router | **Falla con `HostError: Error(Auth, ...)`** |
| Admin llama `set_authorized_router(admin, None)` | — | Modo abierto restaurado |

### Verificación Empírica

Tres tests de integración cubren los tres escenarios:

- `test_direct_deposit_blocked_when_router_configured` (bypass intentado, debe fallar)
- `test_donate_works_when_router_is_authorized_in_vault` (flujo feliz, debe pasar)
- `test_deposit_works_after_clearing_router` (modo abierto, debe pasar)

### Modos de Operación

| Modo | Configuración | Comportamiento |
| :--- | :--- | :--- |
| **Modo abierto** | `authorized_router = None` (default) | Cualquier address puede llamar `deposit`. Útil en Testnet/demos. |
| **Modo cerrado** | `authorized_router = Some(router)` | Solo el router configurado puede llamar `deposit`. Obligatorio en Mainnet. |

### Checklist de Deploy a Mainnet

Antes de habilitar el cobro de fee en producción:

1. ✅ Desplegar `donation-router`.
2. ✅ Llamar `vault.set_authorized_router(admin, Some(router_address))`.
3. ✅ Llamar `router.update_fee_bps(admin, 200)` (o el valor deseado).
4. ✅ Verificar con un smoke test que el bypass directo falla.

> ⚠️ **Mientras `authorized_router = None`, el fee NO está protegido**. Esto es intencional para el MVP (fee = 0), pero **debe activarse antes del cobro real**.

---

## 🧪 6. Estrategia de Pruebas

### 6.1. Estructura de Tests

La suite de pruebas se divide en tres capas:

| Capa | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Unit Tests** | `src/test.rs` | Valida la lógica interna de un contrato aislado. Rápidos, sin cross-contract calls reales. |
| **Integration Tests** | `tests/integration.rs` | Valida el flujo completo entre contratos. Despliegan todos los contratos y verifican cross-contract calls. |
| **Differential Tests** | `test_snapshots/` | Detectan cambios no intencionados en el estado del ledger o los eventos emitidos. |

### 6.2. Cobertura Actual

| Contrato | Unit | Integration | Total |
| :--- | :--- | :--- | :--- |
| `nonprofit-registry` | 8 | — | **8** |
| `campaign-registry` | 5 | 7 | **12** |
| `campaign-vault` | 3 | 23 | **26** |
| `donation-router` | 13 | 11 | **24** |
| **TOTAL** | **29** | **41** | **70** |

**Casos cubiertos**:
- ✅ Happy path completo (registro → creación → depósito → evidencia → liberación).
- ✅ Todos los errores del enum `Error` (códigos 1-26 excepto reservados).
- ✅ Fallback de `milestone_percentage = 0` a `DEFAULT_MILESTONE_PERCENTAGE`.
- ✅ Incrementación monotónica de IDs.
- ✅ Múltiples donantes acumulando hasta el target.
- ✅ Sobrescritura intencional de evidencia.
- ✅ **Bypass del router cerrado** (3 tests).
- ✅ Propagación de errores del vault a través del router.
- ✅ Fee update afecta donaciones subsecuentes.

### 6.3. Limitación Conocida: `mock_all_auths`

Los tests usan `env.mock_all_auths()` en la mayoría de los casos, lo que hace que **cualquier** `require_auth()` pase sin verificar firmas. Esto es aceptable para tests funcionales, pero **el test del bypass sí usa `env.mock_auths`** con autorización específica del donor (sin el router), reproduciendo fielmente el escenario de ataque.

**Mejora futura**: migrar el resto de tests a `mock_auths` específicos para verificar `require_auth` en cada mutación.

### 6.4. Snapshots de Pruebas (Differential Testing)

El SDK de Soroban genera automáticamente archivos JSON en `test_snapshots/` al finalizar cada prueba. Estos archivos capturan **todo el estado del ledger** (storage + eventos + árbol de autenticación) después de la ejecución.

**Regla de Oro**: **Los snapshots deben ser commiteados al repositorio**.

**¿Por qué?** Actúan como una red de seguridad contra efectos secundarios no intencionados. Si modificas `nonprofit-registry` y, sin querer, cambias el comportamiento de `campaign-registry`, los snapshots de `campaign-registry` fallarán. El `diff` te mostrará exactamente qué cambió.

**Verificación pre-commit**:
```bash
cargo test && git diff --exit-code -- '*/test_snapshots/'
```
Si el comando devuelve `exit 0` y sin output, los snapshots están al día. Si falla, hay que revisar el diff y commitear.

---

## ⚙️ 7. Comandos de Desarrollo

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

# Ejecutar solo los unit tests de un contrato.
cargo test -p campaign-vault --lib

# Ejecutar solo los integration tests de un contrato.
cargo test -p campaign-vault --test integration

# Ejecutar un test específico por nombre.
cargo test -p campaign-vault test_full_happy_path
```

### Verificación de Snapshots

```bash
# Ejecutar tests y verificar que los snapshots commiteados estén al día.
cargo test && git diff --exit-code -- '*/test_snapshots/'

# Verificar que no haya warnings.
cargo test 2>&1 | grep -i warning && echo "⚠️ Warnings" || echo "✅ No warnings"
```

---

## 🔄 8. CI/CD

El workflow de GitHub Actions (`.github/workflows/contracts-ci.yml`) se ejecuta en cada push o PR a `main` y realiza las siguientes verificaciones:

1. **Instalación**: Rust + target `wasm32v1-none` + Stellar CLI v30.0.1.
2. **Compilación**: `stellar contract build` para todos los contratos.
3. **Testing**: `cargo test` para todos los crates.
4. **Verificación de Snapshots**: Re-ejecuta los tests y usa `git diff --exit-code -- '*/test_snapshots/'` para garantizar que los snapshots commiteados estén al día.

Si el workflow falla por snapshots desactualizados, ejecuta localmente `cargo test && git add '*/test_snapshots/' && git commit -m "chore(snapshots): regenerate"` y haz push de nuevo.

---

## 🔗 9. Bindings para el Frontend

Para que el equipo de frontend (React/Next.js) pueda interactuar con los contratos sin escribir el JSON-RPC manualmente, se generan **bindings tipados**.

### Comando para TypeScript

```bash
# Para cada contrato desplegable:
stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/nonprofit_registry.wasm \
  --output-dir bindings/nonprofit-registry-ts

stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/campaign_registry.wasm \
  --output-dir bindings/campaign-registry-ts

stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/campaign_vault.wasm \
  --output-dir bindings/campaign-vault-ts

stellar contract bindings typescript \
  --wasm target/wasm32v1-none/release/donation_router.wasm \
  --output-dir bindings/donation-router-ts
```

Cada binding genera un paquete NPM que expone una clase `Client` con métodos tipados. El frontend solo necesita instanciar el cliente con la dirección del contrato (`C...`) y la red (Testnet), y llamar a los métodos como funciones JavaScript normales.

**La seguridad de tipos se mantiene de extremo a extremo**: si un método cambia su firma en Rust, el binding falla al compilar en TypeScript, no en runtime.

---

## 🗺️ 10. Roadmap de Implementación

| Fase | Entregable | Estado |
| :--- | :--- | :--- |
| **Fase 0** | Workspace + `thriving-types` + `thriving-interfaces` | ✅ Completado |
| **Fase 1** | Contrato `nonprofit-registry` + 8 unit tests | ✅ Completado |
| **Fase 2** | Contrato `campaign-registry` + 5 unit + 7 integration tests | ✅ Completado |
| **Fase 3** | Contrato `campaign-vault` + 26 tests (incluye bypass) | ✅ Completado |
| **Fase 4** | Contrato `donation-router` + 24 tests (fee + bypass) | ✅ Completado |
| **Fase 5** | Bindings TypeScript + Deploy a Testnet | ⏳ Pendiente |
| **Fase 6** | Integración con on-ramps (VANK/Pollar) en Testnet | ⏳ Futuro |
| **Fase 7** | Gobernanza híbrida (auditor + votación ponderada) | ⏳ Futuro |
| **Fase 8** | Deploy a Mainnet (con `authorized_router` configurado) | ⏳ Futuro |

---

## 🚧 11. Limitaciones Conocidas del MVP

Consulta [`docs/known-limitations.md`](./docs/known-limitations.md) para el detalle completo. Resumen:

| Limitación | Impacto | Mitigación MVP |
| :--- | :--- | :--- |
| Cancelación post-vault sigue aceptando depósitos | Medio | Frontend verifica estado antes de mostrar botón |
| Sobrescritura intencional de evidencia | Bajo | Documentado como feature |
| Dust en montos < 2 unidades | Bajo | Documentado en `DEFAULT_MILESTONE_PERCENTAGE` |
| Sin refund si la campaña se cancela | Medio | Fuera de scope del MVP |
| `authorized_router = None` por defecto en Testnet | Bajo | Activar antes de Mainnet |

---

## 📚 12. Referencias

- [Stellar Docs — Build](https://developers.stellar.org/docs/build)
- [Stellar Docs — Authorization](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
- [Stellar Docs — Contract Invoker Auth](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization#contract-invoker)
- [Soroban SDK 29.0.1](https://crates.io/crates/soroban-sdk/29.0.1)
- [Differential Tests with Test Snapshots](https://developers.stellar.org/docs/build/guides/testing/differential-tests-with-test-snapshots/)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Protocol 30 (Bell) CAPs](https://developers.stellar.org/docs/learn/fundamentals/stellar-consensus-protocol)
