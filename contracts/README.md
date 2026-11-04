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
│   ├── src/lib.rs
│   ├── src/storage.rs
│   ├── src/events.rs
│   ├── src/test.rs               # Unit tests
│   ├── test_snapshots/           # Snapshots de unit tests
│   │   └── test/*.json
│   └── Cargo.toml
├── campaign-registry/            # Contrato: metadatos de campañas
│   ├── src/lib.rs
│   ├── src/storage.rs
│   ├── src/events.rs
│   ├── src/test.rs               # Unit tests
│   ├── tests/integration.rs      # Integration tests (cross-contract)
│   ├── test_snapshots/           # Snapshots de unit e integration tests
│   │   ├── test/*.json           # (unit)
│   │   └── *.json                # (integration)
│   └── Cargo.toml
├── campaign-vault/               # Contrato: custodia y liberación de fondos por hitos (⏳ Pendiente)
└── donation-router/              # Contrato: punto de entrada único para donaciones (⏳ Pendiente)
```

### 🎯 ¿Por qué estos nombres?

| Nombre | Responsabilidad Única |
| :--- | :--- |
| **`thriving-types`** | Fuente única de verdad para `struct`, `enum`, errores y constantes del dominio. Cambiar un error aquí lo cambia en todo el ecosistema. |
| **`thriving-interfaces`** | Traits que definen las funciones públicas de cada contrato. Permiten cross-contract calls tipadas y desacopladas de la implementación. |
| **`nonprofit-registry`** | Gestiona el ciclo de vida de las fundaciones (registro, aprobación, revocación). |
| **`campaign-registry`** | Gestiona la creación y cancelación de campañas, validando que la fundación esté aprobada. |
| **`campaign-vault`** | Custodia los fondos de cada campaña y los libera según el modelo de hitos. Es el "escrow" técnico. |
| **`donation-router`** | Punto de entrada único para donaciones. Abstrae al frontend y permite aplicar comisiones de plataforma o KYC ligero. |

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

---

### 3.3. `campaign-vault` — El Motor de Custodia (⏳ Pendiente)

**Propósito**: Custodiar los fondos de una o varias **campañas** y liberarlos de forma programática al cumplirse los hitos.

**Modelo de Datos (Conceptual)**:
```rust
pub struct VaultState {
    pub campaign_id: u64,
    pub nonprofit: Address,
    pub token_address: Address,
    pub total_deposited: i128,
    pub first_release_done: bool,
    pub evidence_hash: Option<Bytes>,
    pub final_release_done: bool,
}
```

**Flujo Lógico (MVP)**:
1.  **`deposit`**: Los donantes transfieren tokens (stablecoins) al vault de una campaña.
2.  **`release_initial`**: Al alcanzarse el `target_amount`, se libera automáticamente el **50%** a la fundación.
3.  **`submit_evidence`**: La fundación sube el hash de la evidencia (fotos/videos) a IPFS/Irys.
4.  **`release_final`**: El Admin (o auditor designado) valida la evidencia y libera el **50%** restante.

**Agnosticismo de Almacenamiento**: El contrato no se acopla a IPFS ni a Irys. Solo recibe y almacena un `Bytes` que representa el hash. La plataforma decide dónde alojar el contenido off-chain.

**Gobernanza Híbrida (Opción C)**:
- **MVP**: Liberación automática del 50% inicial + validación manual del Admin para el 50% final.
- **Futuro**: Auditor designado + votación ponderada de donantes con límite del 20% por wallet.

---

### 3.4. `donation-router` — Punto de Entrada Único (⏳ Pendiente)

**Propósito**: Ser el único punto de entrada para donaciones, abstrayendo al frontend y permitiendo lógica transversal (comisiones, KYC ligero, integración con on-ramps).

**Ventajas**:
- Centraliza la aplicación de comisiones de plataforma sin modificar cada vault.
- Facilita la integración con **on-ramps** (VANK, Pollar) que requieren un punto de entrada único.
- Permite aplicar filtros de **prueba de humanidad** (inspirado en p2p.me) antes de procesar la donación.

---

## 🧪 4. Estrategia de Pruebas

### 4.1. Estructura de Tests

La suite de pruebas se divide en tres capas, cada una con un propósito distinto:

| Capa | Ubicación | Propósito |
| :--- | :--- | :--- |
| **Unit Tests** | `src/test.rs` | Validar la lógica interna de un contrato aislado. Rápidos, sin cross-contract calls reales. |
| **Integration Tests** | `tests/integration.rs` | Validar el flujo completo entre contratos. Despliegan ambos contratos y verifican cross-contract calls. |
| **Differential Tests** | `test_snapshots/` | Detectan cambios no intencionados en el estado del ledger o los eventos emitidos. |

### 4.2. Cobertura Actual

| Contrato | Unit Tests | Integration Tests | Total |
| :--- | :--- | :--- | :--- |
| `nonprofit-registry` | 8 | — | 8 |
| `campaign-registry` | 5 | 7 | 12 |

**Casos cubiertos**:
- ✅ Happy path (registro + aprobación + creación + cancelación).
- ✅ `register_nonprofit` fuerza `Pending` incluso si el input dice `Approved`.
- ✅ Errores: `NonprofitNotFound`, `NonprofitAlreadyRegistered`, `Unauthorized`, `CampaignNotFound`, `CampaignNotActive`, `NonprofitNotApproved`, `InvalidAmount`, `InvalidDeadline`, `InvalidMilestonePercentage`.
- ✅ Fallback de `milestone_percentage = 0` a `DEFAULT_MILESTONE_PERCENTAGE`.
- ✅ Incrementación monotónica de IDs.

### 4.3. Limitación Conocida: `mock_all_auths`

Los tests usan `env.mock_all_auths()`, lo que hace que **cualquier** `require_auth()` pase sin verificar firmas. Esto es aceptable para el MVP, pero significa que `require_auth` no está siendo testeado en sí mismo; las barreras reales verificadas son las comparaciones manuales (`admin != stored_admin`, `campaign.nonprofit != nonprofit`).

**Mejora futura**: Migrar a `env.mock_auths()` con `MockAuth` e `MockAuthInvoke` específicos para verificar que las firmas son exigidas correctamente.

### 4.4. Snapshots de Pruebas (Differential Testing)

El SDK de Soroban genera automáticamente archivos JSON en `test_snapshots/` al finalizar cada prueba. Estos archivos capturan **todo el estado del ledger** (storage + eventos + árbol de autenticación) después de la ejecución.

**Regla de Oro**: **Los snapshots deben ser commiteados al repositorio**.

**¿Por qué?** Porque actúan como una red de seguridad contra efectos secundarios no intencionados. Si modificas `nonprofit-registry` y, sin querer, cambias el comportamiento de `campaign-registry`, los snapshots de `campaign-registry` fallarán. El `diff` te mostrará exactamente qué cambió (un evento nuevo, una entrada de storage alterada), permitiéndote detectar el error antes de que llegue a producción.

**Estructura de snapshots**:
- `test_snapshots/test/*.json` → snapshots de **unit tests** (módulo `mod test` en `src/test.rs`).
- `test_snapshots/*.json` (raíz) → snapshots de **integration tests** (archivos en `tests/`).

---

## ⚙️ 5. Comandos de Desarrollo

### Compilación

```bash
# Compilar todos los contratos del workspace.
# Los .wasm se generan en target/wasm32v1-none/release/
stellar contract build

# Compilar un contrato específico.
stellar contract build --package campaign-registry
```

### Testing

```bash
# Ejecutar todos los tests del workspace (unit + integration).
cargo test

# Ejecutar solo los tests de un contrato.
cargo test -p campaign-registry

# Ejecutar solo los unit tests de un contrato.
cargo test -p campaign-registry --lib

# Ejecutar solo los integration tests de un contrato.
cargo test -p campaign-registry --test integration

# Ejecutar un test específico por nombre.
cargo test -p campaign-registry test_create_campaign_success
```

### Verificación de Snapshots

```bash
# Ejecutar tests y verificar que los snapshots commiteados estén al día.
cargo test && git diff --exit-code -- '*/test_snapshots/'
```

Si el comando anterior falla, significa que un snapshot cambió y necesitas revisar el diff con `git diff` antes de commitear.

---

## 🔄 6. CI/CD

El workflow de GitHub Actions (`.github/workflows/contracts-ci.yml`) se ejecuta en cada push o PR a `main` y realiza las siguientes verificaciones:

1.  **Instalación**: Rust + target `wasm32v1-none` + Stellar CLI v30.0.1.
2.  **Compilación**: `stellar contract build` para todos los contratos.
3.  **Testing**: `cargo test` para todos los crates.
4.  **Verificación de Snapshots**: Re-ejecuta los tests y usa `git diff --exit-code -- '*/test_snapshots/'` para garantizar que los snapshots commiteados estén al día. Si hay diferencias, el workflow falla con un mensaje claro.

Esto garantiza que ningún desarrollador olvide commitear un snapshot actualizado.

---

## 🔗 7. Bindings para el Frontend

Para que el equipo de frontend (React/Next.js) pueda interactuar con los contratos sin escribir el JSON-RPC manualmente, se generarán **bindings tipados**.

**Comando para TypeScript** (el de Rust aún está en estado *stub* según la documentación de la CLI):

```bash
stellar contract bindings typescript \
  --wasm ./target/wasm32v1-none/release/nonprofit_registry.wasm \
  --output-dir ./bindings/nonprofit-registry-ts
```

Esto genera un paquete NPM que expone una clase `Client` con métodos como `registerNonprofit()`, `approveNonprofit()`, etc. El frontend solo necesita instanciar este cliente con la dirección del contrato y la red (Testnet), y llamar a los métodos como si fueran funciones JavaScript normales. La seguridad de tipos se mantiene de extremo a extremo.

---

## 🗺️ 8. Roadmap de Implementación

| Fase | Entregable | Estado |
| :--- | :--- | :--- |
| **Fase 0** | Workspace + `thriving-types` + `thriving-interfaces` | ✅ Completado |
| **Fase 1** | Contrato `nonprofit-registry` + 8 unit tests | ✅ Completado |
| **Fase 2** | Contrato `campaign-registry` + 5 unit + 7 integration tests | ✅ Completado |
| **Fase 3** | Contrato `campaign-vault` (custodia, hitos, liberación 50/50) | ⏳ Pendiente |
| **Fase 4** | Contrato `donation-router` (punto de entrada único) | ⏳ Pendiente |
| **Fase 5** | Gobernanza híbrida (auditor + votación ponderada) | ⏳ Futuro |
| **Fase 6** | Generación de bindings TypeScript para todos los contratos | ⏳ Pendiente |
| **Fase 7** | Integración con on-ramps (VANK/Pollar) en Testnet | ⏳ Futuro |

---

## 📚 Referencias

- [Stellar Docs — Build](https://developers.stellar.org/docs/build)
- [Soroban SDK 29.0.1](https://crates.io/crates/soroban-sdk/29.0.1)
- [Differential Tests with Test Snapshots](https://developers.stellar.org/docs/build/guides/testing/differential-tests-with-test-snapshots/)
- [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Protocol 30 (Bell) CAPs](https://developers.stellar.org/docs/learn/fundamentals/stellar-consensus-protocol)
