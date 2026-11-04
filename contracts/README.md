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
| **Vaca / Pooling** (Colombia) | Fondo común donde varias personas aportan dinero para un objetivo compartido. | Es la **mecánica de recolección** de fondos entre múltiples donantes. |
| **Escrow** (Custodia Condicionada) | Mecanismo neutral que custodia fondos y los libera al cumplirse condiciones acordadas. | Es el **mecanismo técnico** de garantía. En nuestro caso, el contrato inteligente que custodia y distribuye los fondos a medida que se cumplen hitos. |
| **Campaign** (Campaña) | Entidad que representa una iniciativa específica de recaudación (ej. "Kits escolares 2026"). | Es la **unidad lógica** dentro del contrato `escrow`. Una campaña agrupa múltiples donaciones y define los hitos a cumplir. **No es un contrato separado**, sino una estructura de datos gestionada por el contrato `escrow`. |

---

## 🧭 1. Prerrequisitos y Versiones

Para garantizar la reproducibilidad y compatibilidad con el runtime de Soroban (Protocolo 29), el entorno de desarrollo debe ceñirse estrictamente a las siguientes versiones.

| Componente | Versión Requerida | Notas |
| :--- | :--- | :--- |
| **Rust** | `1.84+` (estable) | El compilador debe soportar el target `wasm32v1-none`. |
| **Target Wasm** | `wasm32v1-none` | Único target soportado por Soroban. **No** usar `wasm32-unknown-unknown`. |
| **Soroban SDK** | `28.0.0` | Versión estable actual para el Protocolo 29. |
| **Stellar CLI** | `28.1.0` | Requerida por el SDK 28.0.0. Incluye `stellar contract build`. |
| **Protocolo de Red** | `29` | Testnet y Mainnet alineados (Octubre 2026). |

### 🛠️ Instalación del Entorno

```bash
# 1. Instalar Rust (si no se tiene)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh

# 2. Añadir el target correcto para Soroban
rustup target add wasm32v1-none

# 3. Instalar la Stellar CLI (versión 28.1.0)
cargo install --locked stellar-cli --version 28.1.0

# 4. Verificar versiones
rustc --version          # Debe ser >= 1.84
stellar --version        # Debe ser 28.1.0
```

> ⚠️ **Advertencia Crítica**: Construye siempre los contratos con `stellar contract build`. **Nunca** uses `cargo build` directamente, ya que este último no aplica las configuraciones específicas que el runtime de Soroban requiere para el target `wasm32v1-none`.

---

## 🏗️ 2. Arquitectura del Workspace

El proyecto se organiza como un **Cargo Workspace** que alberga múltiples *crates* (paquetes de Rust). Esta estructura permite:
- **Compilación independiente** de cada contrato.
- **Dependencias compartidas** a través de una librería común (`shared`).
- **Sin dependencias circulares** entre contratos; la comunicación se realiza vía *cross-contract calls* utilizando *interfaces* tipadas.

### Estructura de Directorios (Propuesta)

```text
contracts/
├── Cargo.toml              # Workspace raíz (miembros y dependencias compartidas)
├── shared/                 # Librería común: tipos, errores, utilidades, constantes
│   ├── src/lib.rs
│   └── Cargo.toml
├── interfaces/             # Traits públicos de las interfaces de los contratos
│   ├── src/lib.rs
│   └── Cargo.toml
├── registry/               # Contrato de Registro de Fundaciones
│   ├── src/lib.rs
│   └── Cargo.toml
├── escrow/                 # Contrato de Custodia y Liberación por Hitos (incluye Campaign)
│   ├── src/lib.rs
│   ├── src/tests/          # Pruebas unitarias e integración
│   └── Cargo.toml
└── README.md               # Este archivo
```

### ¿Por qué `shared` e `interfaces`?
- **`shared`**: Evita la duplicación de código. Aquí viven los `enum` de errores, los `struct` que representan entidades (ej. `Fundacion`, `Campana`, `Hito`), y constantes de configuración. Si un error o tipo cambia, se modifica en un solo lugar.
- **`interfaces`**: Define los `trait` de los contratos. Esto permite que, por ejemplo, el contrato `escrow` importe la interfaz de `registry` y realice llamadas tipadas, sin acoplarse a la implementación concreta. Es el patrón recomendado por la documentación oficial para workspaces multi-contrato.

---

## 🧩 3. Descripción de los Contratos

### 3.1. `registry` — La Identidad Verificada

**Propósito**: Gestionar el ciclo de vida de las fundaciones que desean operar en la plataforma.

**Responsabilidades**:
- **Registro**: Una fundación (identificada por una `Address` de Stellar) se registra con un hash de su documentación legal (KYC/AML) almacenado off-chain (ej. IPFS).
- **Aprobación**: Solo una dirección administradora (designada por ThrivingHub) puede aprobar o revocar una fundación.
- **Consulta**: Expone una función pública `es_fundacion_valida(address) -> bool` que otros contratos (como `escrow`) pueden invocar.

**Estado Clave**:
- `Admin: Address` (configurado en el constructor).
- `Fundaciones: Map<Address, Fundacion>` (estado persistente).

**Seguridad**: Todas las funciones de mutación requieren `require_auth()` de la dirección correspondiente y verifican que el invocador sea el `Admin` o la propia fundación.

---

### 3.2. `escrow` — El Motor de Custodia y Distribución

**Propósito**: Custodiar los fondos de una o varias **campañas** de recaudación (Crowdfunding/Fundraising) y liberarlos de forma programática y condicionada (Escrow) al cumplirse los hitos de cada campaña.

**Aclaración Arquitectónica**: El contrato `escrow` **no** gestiona una única donación individual, sino que administra un mapa de **Campañas**. Cada campaña puede recibir múltiples donaciones (Pooling/Vaca) y está compuesta por múltiples hitos.

**Modelo de Datos (Conceptual)**:
```rust
// En shared/src/lib.rs
pub struct Campana {
    pub id: u64,
    pub fundacion: Address,
    pub auditor: Option<Address>, // Opción C: auditor de confianza designado
    pub monto_total: i128,        // Suma de todas las donaciones (Vaca)
    pub monto_liberado: i128,
    pub hitos: Vec<Hito>,
}

pub struct Hito {
    pub monto: i128,
    pub estado: EstadoHito, // Pendiente, EvidenciaSubida, Aprobado, Rechazado
    pub hash_evidencia: Option<Bytes>, // Hash IPFS (almacenamiento descentralizado) las pruebas es opcional
}
```

**Flujo Lógico (End-to-End)**:

1.  **`crear_campana`**: La fundación crea una campaña (Fundraising). **Antes de permitir esto**, el contrato `escrow` realiza una *cross-contract call* a `registry.es_fundacion_valida(fundacion)`. Si no es válida, la transacción falla.
2.  **`donar`**: Múltiples donantes transfieren tokens (USDC) a una campaña específica. El monto se suma al `monto_total` de esa campaña (Pooling).
3.  **`subir_evidencia`**: La fundación adjunta el hash de la evidencia para un hito específico y cambia su estado a `EvidenciaSubida`.
4.  **`aprobar_hito` / `votar_hito`**: Aquí se implementa la **Gobernanza Híbrida (Opción C)**:
    -   **Ruta Rápida (Auditor)**: Si la campaña tiene un `auditor` designado, este puede llamar a `aprobar_hito` directamente.
    -   **Ruta Descentralizada (Donantes)**: Si no hay auditor o este no actúa en un plazo, los donantes de esa campaña pueden votar. El poder de voto es **ponderado por donación**, pero con un **límite máximo** (ej. 20% del poder total) para evitar la centralización. Se requiere un quórum del 50% + 1 del poder de voto total.
5.  **`liberar_fondos`**: Una vez aprobado el hito, se transfiere el `monto` correspondiente desde el contrato a la `fundacion`. El `monto_liberado` se actualiza y se emite un evento `FondosLiberados`.

**Almacenamiento y TTL**:
-   Los datos de las campañas se guardan en `persistent` storage.
-   Se debe gestionar el **TTL (Time-To-Live)** de estas entradas. Para campañas activas, se extenderá el TTL periódicamente. Para campañas finalizadas, se puede dejar expirar o archivar.

---

## 🧪 4. Estrategia de Pruebas

### 4.1. Pruebas Unitarias y de Integración

Cada contrato tendrá su propio módulo de pruebas (`src/tests/`). Se utilizará el `Env` de Soroban para simular el entorno de ejecución.

**Pruebas de Integración Clave**:
-   Verificar que `escrow` rechaza la creación de una campaña si la fundación no está en `registry`.
-   Simular el flujo completo: crear campaña → múltiples donaciones → subir evidencia → aprobar → liberar fondos.
-   Probar los escenarios de gobernanza: voto con poder limitado, quórum no alcanzado, etc.

### 4.2. Snapshots de Pruebas (Differential Testing)

El SDK de Soroban genera automáticamente archivos JSON en `test_snapshots/` al finalizar cada prueba. Estos archivos capturan **todo el estado del ledger** (almacenamiento y eventos) después de la ejecución.

**Regla de Oro**: **Los snapshots deben ser commiteados al repositorio**.

**¿Por qué?** Porque actúan como una red de seguridad contra efectos secundarios no intencionados. Si modificas el contrato `registry` y, sin querer, cambias el comportamiento de `escrow`, los snapshots de `escrow` fallarán. El `diff` te mostrará exactamente qué cambió (un evento nuevo, una entrada de storage alterada), permitiéndote detectar el error antes de que llegue a producción.

---

## 🔗 5. Bindings para el Frontend

Para que el equipo de frontend (React/Next.js) pueda interactuar con los contratos sin escribir el JSON-RPC manualmente, se generarán **bindings tipados**.

**Comando para TypeScript** (el de Rust aún está en estado *stub* según la documentación de la CLI):

```bash
stellar contract bindings typescript \
  --wasm ./target/wasm32v1-none/release/escrow.wasm \
  --output-dir ./bindings/escrow-ts
```

Esto genera un paquete NPM que expone una clase `Client` con métodos como `crearCampana()`, `donar()`, etc. El frontend solo necesita instanciar este cliente con la dirección del contrato y la red (Testnet), y llamar a los métodos como si fueran funciones JavaScript normales. La seguridad de tipos se mantiene de extremo a extremo.

---

## 🗺️ 6. Roadmap de Implementación (Contratos)

| Fase | Entregable | Estado |
| :--- | :--- | :--- |
| **Fase 0** | Configuración del Workspace (`Cargo.toml`, `shared`, `interfaces`) | ⏳ Pendiente |
| **Fase 1** | Contrato `registry` (registro, aprobación, consulta) | ⏳ Pendiente |
| **Fase 2** | Contrato `escrow` (entidad Campaña, donaciones, hitos) | ⏳ Pendiente |
| **Fase 3** | Gobernanza Híbrida en `escrow` (votación ponderada + auditor) | ⏳ Pendiente |
| **Fase 4** | Pruebas de integración y snapshots | ⏳ Pendiente |
| **Fase 5** | Generación de bindings TypeScript | ⏳ Pendiente |

