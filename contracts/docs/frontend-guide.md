# 🎨 Frontend Integration Guide — Thriving Stellar

> **Audiencia**: Equipos de frontend (React/Next.js/Vite) y agentes de IA que construyan la interfaz de Thriving Stellar.
> **Pre-requisito**: Leer [`../README.md`](../README.md) para el contexto de arquitectura y [`events-reference.md`](./events-reference.md) para los eventos on-chain.
> **Estado**: MVP en Testnet (Protocolo 30). Fee de plataforma = 0 bps.

---

## 1. Contexto de Negocio

Thriving Stellar es una plataforma de **crowdfunding con trazabilidad on-chain** para fundaciones y ONG's en Colombia. El diferencial respecto a Vaki es el **Modelo de Confianza**:

1. Los donantes aportan a una **campaña** específica.
2. Los fondos quedan en **custodia on-chain** (`campaign-vault`), no en una cuenta bancaria.
3. Al alcanzar el `target_amount`, se libera automáticamente el **50%** a la fundación.
4. La fundación sube **evidencia** del uso de los fondos (fotos, facturas).
5. El **admin** valida la evidencia y libera el **50%** restante.

Esto se implementa con 4 contratos Soroban que el frontend debe orquestar.

---

## 2. Stack Recomendado

| Capa | Recomendación | Notas |
| :--- | :--- | :--- |
| **Framework** | Ultima version, evitar npm y seguridad paranoica |
| **Lenguaje** | TypeScript estricto (`strict: true`) | Los bindings ya son tipados; no romper esa cadena. |
| **Stellar SDK** | `@stellar/stellar-sdk` (oficial) + `js-stellar-sdk` | `js-stellar-sdk` es el recomendado por el CLI 30. `@stellar/stellar-sdk` sigue siendo el estándar para RPC y transacciones. |
| **Wallets** | **Passkeys** con `vellar-sdk` o `passkey-kit` | El usuario se autentica con Face ID / Touch ID / PIN. **No** hay seed phrases. |
| **Patrocinio de fees** | **Fee-Bump** o Relayer propio | Las smart wallets (`C...`) no pueden pagar fees. La plataforma paga en XLM. |
| **Estado** | TanStack Query recomendado | `TanStack Query` es ideal para cachear queries al RPC. |
| **Estilos** | a la IA les gusta tailwind | Alineado con la estética "florecer la confianza" de Vaki. |

---

## 3. Contratos y sus Direcciones (Testnet)

| Contrato | Dirección (`C...`) | Rol en el frontend |
| :--- | :--- | :--- |
| **Nonprofit Registry** | `CA5LHUGEJ4S6XJV5ZBCOOKIWAARGA7QSZERAAUM2NVWCXHDPRRSFT55K` | Registro/consulta de fundaciones. Solo el admin puede aprobar. |
| **Campaign Registry** | `CCZPWOKGTLT2UWLZEGYC55BPLR4GLZOUGCBVDXEEFSLE5QPVPMMU7EZR` | Crear/listar campañas. Consultar estado y deadline. |
| **Campaign Vault** | `CARMUNTRKKX6KA7ZXVMYVZVAZ5DLZF5B53V5K6J5OE3CMFYGB7FWCCTT` | Estado de custodia, depósitos, evidencia, liberaciones. |
| **Donation Router** | `CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD` | Punto de entrada **único** para donaciones. Aplica el fee. |

**Red**: `Test SDF Network ; September 2015`
**RPC URL**: `https://soroban-testnet.stellar.org`
**Friendbot** (para fondear cuentas nuevas): `https://friendbot.stellar.org/?addr=<ADDRESS>`
**Explorer**: `https://stellar.expert/explorer/testnet`

---

## 4. Modelo de Fee (Crítico)

El `donation-router` aplica un fee de plataforma (Modelo B: **descontado del gross**).

### Configuración actual (Testnet)

- `fee_bps = 0` (0% — intencional para el demo)
- Si en el futuro se activa: `fee_bps = 200` (2%)

### Fórmula

```text
fee_amount = (gross_amount * fee_bps) / 10_000   // división entera
net_amount = gross_amount - fee_amount
```

- El **donante paga** `gross_amount`.
- La **tesorería recibe** `fee_amount`.
- El **vault recibe** `net_amount`.

### ⚠️ Los `target_amount` están en **NET**

El `target_amount` de una campaña es lo que debe acumular el vault (después de fees) para disparar la liberación del 50%.

**Ejemplo** con `target_amount = 10_000` y `fee_bps = 200` (2%):

```text
gross_amount = ceil(10_000 * 10_000 / (10_000 - 200)) = 10_204
fee_amount   = 10_204 * 200 / 10_000 = 204
net_amount   = 10_204 - 204 = 10_000
```

**Lo que el frontend DEBE hacer**:

1. Antes de mostrar el formulario de donación, llamar `router.quote(gross_amount)` para obtener `{ gross_amount, fee_amount, net_amount }`.
2. Mostrar los 3 valores al donante (transparencia radical).
3. Si el donante quiere que la campaña reciba X neto, calcular `gross` con la fórmula de arriba.

**Lo que el frontend NO debe hacer**:

- ❌ Asumir que `gross = target_amount`.
- ❌ Calcular el fee manualmente sin consultar `get_fee_bps()` (el admin puede cambiarlo).
- ❌ Ocultar el fee al donante.

---

## 5. Funciones por Contrato (con ejemplos)

### 5.1. `nonprofit-registry`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `register_nonprofit` | `nonprofit: Address`, `profile: NonprofitProfile` | — | `nonprofit` |
| `approve_nonprofit` | `admin: Address`, `nonprofit: Address` | — | `admin` |
| `revoke_nonprofit` | `admin: Address`, `nonprofit: Address` | — | `admin` |
| `is_approved` | `nonprofit: Address` | `bool` | — |
| `get_profile` | `nonprofit: Address` | `NonprofitProfile` | — |

**`NonprofitProfile`**:
```typescript
type NonprofitProfile = {
  legal_name: string;         // Razón social
  tax_id: string;             // NIT
  rut_hash: Uint8Array;       // Hash del RUT (off-chain en IPFS)
  retention_certificate: boolean;
  email: string;
  data_consent: boolean;      // Habeas Data
  status: 'Pending' | 'Approved' | 'Revoked';
};
```

**Ejemplo**:
```typescript
import { Client as NpClient } from '@thriving/nonprofit-registry';

const np = new NpClient({ contractId: NP_ID, networkPassphrase, rpcUrl });

// Consultar estado
const approved = await np.is_approved({ nonprofit: userAddress });

// Registrar (solo la fundación)
await np.register_nonprofit({ nonprofit: userAddress, profile });
```

---

### 5.2. `campaign-registry`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `create_campaign` | `nonprofit`, `name`, `description`, `location`, `target_amount`, `token_address`, `deadline`, `milestone_percentage` | `u64` (campaign_id) | `nonprofit` |
| `cancel_campaign` | `nonprofit`, `campaign_id` | — | `nonprofit` |
| `get_campaign` | `campaign_id` | `Campaign` | — |

**`Campaign`**:
```typescript
type Campaign = {
  nonprofit: string;
  name: string;
  description: string;
  location: string;
  target_amount: bigint;      // En NET (después de fee)
  token_address: string;      // SAC address (USDC, EURC, COP...)
  deadline: bigint;           // Unix timestamp
  milestone_percentage: number; // 50 por defecto
  status: 'Active' | 'Completed' | 'Cancelled';
};
```

**Ejemplo**:
```typescript
import { Client as CrClient } from '@thriving/campaign-registry';
const cr = new CrClient({ contractId: CR_ID, networkPassphrase, rpcUrl });

const campaignId = await cr.create_campaign({
  nonprofit: userAddress,
  name: 'Comedor Comunitario',
  description: 'Construcción de comedor en Suba',
  location: 'Suba, Bogotá',
  target_amount: 10_000_0000000n,  // 10K USDC con 7 decimales
  token_address: USDC_ADDRESS,
  deadline: BigInt(Math.floor(Date.now() / 1000) + 30 * 86400),
  milestone_percentage: 50,
});

const campaign = await cr.get_campaign({ campaign_id: campaignId });
```

---

### 5.3. `campaign-vault`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `create_vault` | `campaign_id`, `nonprofit` | — | `nonprofit` |
| `deposit` | `campaign_id`, `donor`, `amount` | — | `donor` + `router` (si `authorized_router` está configurado) |
| `submit_evidence` | `campaign_id`, `nonprofit`, `evidence_hash` | — | `nonprofit` |
| `release_final` | `campaign_id`, `admin` | — | `admin` |
| `get_vault` | `campaign_id` | `VaultState` | — |

**`VaultState`**:
```typescript
type VaultState = {
  campaign_id: bigint;
  nonprofit: string;
  token_address: string;
  target_amount: bigint;
  deadline: bigint;
  total_deposited: bigint;
  initial_release_done: boolean;
  evidence_hash: Uint8Array | null;
  final_release_done: boolean;
};
```

**Ejemplo**:
```typescript
import { Client as CvClient } from '@thriving/campaign-vault';
const cv = new CvClient({ contractId: CV_ID, networkPassphrase, rpcUrl });

const state = await cv.get_vault({ campaign_id: 1n });
// state.total_deposited, state.initial_release_done, etc.
```

> ⚠️ **No llamar `deposit` directamente desde el frontend**. Siempre usar `router.donate(...)` para respetar el fee. Con `authorized_router` activado, un `deposit` directo falla con `HostError: Error(Auth, ...)`.

---

### 5.4. `donation-router`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `donate` | `campaign_id`, `donor`, `amount` (gross) | — | `donor` |
| `quote` | `gross_amount` | `QuoteResult` | — |
| `get_fee_bps` | — | `u32` | — |
| `get_treasury` | — | `Address` | — |
| `update_fee_bps` | `admin`, `new_fee_bps` | — | `admin` |
| `update_treasury` | `admin`, `new_treasury` | — | `admin` |

**`QuoteResult`**:
```typescript
type QuoteResult = {
  gross_amount: bigint;
  fee_amount: bigint;
  net_amount: bigint;
};
```

**Ejemplo**:
```typescript
import { Client as DrClient } from '@thriving/donation-router';
const dr = new DrClient({ contractId: DR_ID, networkPassphrase, rpcUrl });

// 1. Preview del fee
const quote = await dr.quote({ gross_amount: 10_000n });
// quote = { gross_amount: 10_000n, fee_amount: 0n, net_amount: 10_000n } (fee_bps = 0)
// Si fee_bps = 200: { gross_amount: 10_000n, fee_amount: 200n, net_amount: 9_800n }

// 2. Ejecutar donación
await dr.donate({
  campaign_id: 1n,
  donor: userAddress,
  amount: 10_000n,  // gross
});
```

---

## 6. Flujos de Usuario (End-to-End)

### 6.1. Flujo: La fundación se registra

```text
1. Fundación conecta su wallet (Passkey).
2. Sube documentos legales a IPFS → obtiene CID → hash.
3. Llama np.register_nonprofit({ nonprofit, profile }) con status = Pending.
4. Espera aprobación del admin.
5. Consulta np.is_approved({ nonprofit }) → true cuando esté aprobada.
6. Ahora puede crear campañas.
```

### 6.2. Flujo: La fundación crea una campaña

```text
1. Pre-requisito: fundación aprobada en nonprofit-registry.
2. Fundación llama cr.create_campaign({...}) → retorna campaign_id.
3. Fundación llama cv.create_vault({ campaign_id, nonprofit }) para crear el vault.
4. Ahora la campaña acepta donaciones.
```

### 6.3. Flujo: El donante dona

```text
1. Donante ve la campaña en el frontend (lee de cr.get_campaign).
2. Ingresa el monto que quiere donar (gross).
3. Frontend llama dr.quote({ gross_amount }) → muestra desglose { gross, fee, net }.
4. Donante confirma → frontend llama dr.donate({ campaign_id, donor, amount: gross }).
5. Router: cobra fee a la treasury, envía net al vault.
6. Vault: si total_deposited >= target_amount → libera 50% a la fundación (automático).
7. Frontend refresca cv.get_vault → muestra progreso actualizado.
```

### 6.4. Flujo: La fundación sube evidencia

```text
1. Pre-requisito: initial_release_done == true (el 50% ya fue liberado).
2. Fundación sube fotos/videos a IPFS → obtiene CID.
3. Fundación llama cv.submit_evidence({ campaign_id, nonprofit, evidence_hash: CID_bytes }).
4. El hash queda registrado on-chain.
```

### 6.5. Flujo: El admin libera el 50% restante

```text
1. Admin revisa off-chain la evidencia (consulta cv.get_vault → evidence_hash).
2. Si aprueba, llama cv.release_final({ campaign_id, admin }).
3. Vault transfiere el 50% restante a la fundación.
4. Estado final: total_deposited == 2 * target_amount * 50% → distribución completa.
```

---

## 7. Manejo de Errores

Todos los contratos comparten el enum `Error` con discriminantes estables. El frontend debe mapear los códigos a mensajes UX-friendly.

| Código | Error | Mensaje UX sugerido |
| :--- | :--- | :--- |
| 1 | `Unauthorized` | "No tienes permisos para esta acción." |
| 2 | `NonprofitNotFound` | "La fundación no está registrada." |
| 3 | `NonprofitNotApproved` | "La fundación aún no está aprobada por el admin." |
| 4 | `NonprofitAlreadyRegistered` | "Esta fundación ya está registrada." |
| 5 | `CampaignNotFound` | "La campaña no existe." |
| 6 | `CampaignNotActive` | "La campaña no está activa." |
| 8 | `EvidenceNotSubmitted` | "Aún no se ha subido evidencia." |
| 11 | `InvalidAmount` | "El monto debe ser mayor a cero." |
| 12 | `InvalidDeadline` | "La fecha límite debe ser futura." |
| 13 | `InvalidMilestonePercentage` | "El porcentaje de hito debe estar entre 1 y 100." |
| 16 | `FinalAlreadyReleased` | "Los fondos finales ya fueron liberados." |
| 18 | `NotVaultAdmin` | "Solo el admin puede liberar fondos." |
| 19 | `DepositExceedsTarget` | "El monto excede el objetivo de la campaña." |
| 20 | `CampaignAlreadyExists` | "Esta campaña ya tiene un vault." |
| 21 | `InitialReleaseNotDone` | "La liberación inicial aún no se ha ejecutado." |
| 22 | `CampaignExpired` | "La campaña ya expiró." |
| 23 | `VaultFinalized` | "Esta campaña ya está finalizada." |
| 24 | `InvalidEvidence` | "La evidencia no puede estar vacía." |
| 25 | `InvalidFeeBps` | "El fee excede el máximo permitido (10%)." |
| 26 | `NotAuthorizedRouter` | (Solo interno) "Depósito no autorizado." |

**Formato de error en JS**:
```typescript
try {
  await cv.deposit({ campaign_id, donor, amount });
} catch (err) {
  // Los errores de Soroban llegan como `HostError: Error(Contract, #N)`
  const match = String(err).match(/Error\(Contract, #(\d+)\)/);
  const code = match ? parseInt(match[1]) : null;
  // Mapear `code` a mensaje UX
}
```

---

## 8. Eventos On-Chain (para Indexing / Real-time UI)

Los eventos son la forma eficiente de reconstruir el estado sin consultar todo el storage. Ver [`events-reference.md`](./events-reference.md) para la referencia completa.

**Resumen de eventos por contrato**:

| Contrato | Eventos |
| :--- | :--- |
| `nonprofit-registry` | `NonprofitRegistered`, `NonprofitApproved`, `NonprofitRevoked` |
| `campaign-registry` | `CampaignCreated`, `CampaignCancelled` |
| `campaign-vault` | `VaultCreated`, `DonationDeposited`, `InitialFundsReleased`, `EvidenceSubmitted`, `FinalFundsReleased` |
| `donation-router` | `DonationRouted`, `FeeBpsUpdated`, `TreasuryUpdated` |

**Recomendación para el frontend**: suscribirse a eventos via `getEvents` del SDK RPC y cachear con TanStack Query. Los eventos son la fuente de verdad para "historial de donaciones" y "progreso de campaña".

---

## 9. Autenticación y Patrocinio de Fees

### 9.1. Passkeys (Smart Wallets)

En lugar de seed phrases, el usuario se autentica con **WebAuthn** (Face ID, Touch ID, PIN del dispositivo). La wallet es una **cuenta de contrato** (`C...`) en Soroban, no una cuenta clásica (`G...`).

**SDKs recomendados**:
- `vellar-sdk` (opinado, integra auth + relayer + XLM).
- `passkey-kit` (más bajo nivel, para control total).

**Consideración**: las smart accounts (`C...`) **no pueden firmar transacciones ni pagar fees por sí mismas**. Necesitan que una cuenta externa las patrocine.

### 9.2. Patrocinio de Fees (Fee-Bump o Relayer)

**Opción A: Fee-Bump Transaction**
El backend envuelve la transacción del usuario en una `FeeBumpTransaction`, donde la cuenta de la plataforma paga la comisión en XLM. El usuario firma la transacción interna (con Passkey), el backend la envuelve y la envía.

**Opción B: Relayer Propio**
El backend mantiene una cuenta `G...` con XLM, y construye y firma las transacciones por el usuario (que solo autoriza con Passkey). El backend paga el fee.

**Costos**: Stellar cobra ~100 stroops por operación (~0.00001 XLM). Es decir, ~0.000001 USD por transacción. Prácticamente gratis.

### 9.3. Friendbot (Fondear cuentas nuevas en Testnet)

Para que el usuario pueda probar la plataforma sin comprar XLM:

```typescript
async function fundTestnetAccount(address: string) {
  await fetch(`https://friendbot.stellar.org/?addr=${address}`);
}
```

Llama a este endpoint después de crear la cuenta del usuario. En Mainnet, esto se reemplaza por un on-ramp (VANK, Pollar).

---

## 10. Consideraciones de UX

### 10.1. Inspiración: Vaki

La clienta quiere una plataforma **"como Vaki pero versión crypto"**. Puntos clave:

- **Transparencia radical**: mostrar fee, net, y destino de cada peso.
- **Progreso visual**: barra de recaudación, hitos alcanzados.
- **Evidencia visual**: fotos/videos de la ejecución, no solo texto.
- **Confianza**: certificados, auditorías, reportes de impacto.

### 10.2. Pantallas mínimas (MVP)

1. **Home**: lista de campañas activas, con progreso y CTA "Donar".
2. **Detalle de campaña**: descripción, target, total recaudado, hitos, evidencia.
3. **Formulario de donación**: monto, desglose gross/fee/net, botón "Donar".
4. **Perfil de fundación**: campañas activas, historial, evidencia subida.
5. **Panel de admin**: aprobar/rechazar fundaciones, validar evidencia, liberar fondos.
6. **Historial del donante**: donaciones realizadas, impacto total.

### 10.3. Estados visuales por campaña

| Estado | Condición | CTA |
| :--- | :--- | :--- |
| `draft` | Sin vault creado | "Crear vault" (fundación) |
| `active` | `vault.total_deposited < target` | "Donar" |
| `funded` | `total_deposited >= target && !final_release_done` | "Ver evidencia" |
| `evidence_pending` | `initial_release_done && !evidence_hash` | "Subir evidencia" (fundación) |
| `completed` | `final_release_done` | "Ver impacto" |
| `cancelled` | `status === 'Cancelled'` | Sin CTA |

### 10.4. Wallets y onboarding

- **Sin formulario de seed phrase**. Botón único: "Continuar con Passkey".
- **Sin "conecta tu wallet"**. La wallet se crea al primer uso con Face ID.
- **Sin "compra XLM"**. La plataforma patrocina los fees.
- **Sin "espera 5 confirmaciones"**. Stellar tiene finalidad en ~5 segundos.

---

## 11. Testing del Frontend

### 11.1. Smoke test en Testnet

Antes de integrar, verificar que los contratos responden:

```bash
# Con el CLI de Stellar
stellar contract invoke --id $CR_ID --network testnet -- get_campaign --campaign_id 1
stellar contract invoke --id $DR_ID --network testnet -- get_fee_bps
stellar contract invoke --id $CV_ID --network testnet -- get_vault --campaign_id 1
```

### 11.2. Escenarios de prueba obligatorios

1. **Registro + aprobación de fundación** (admin).
2. **Creación de campaña** (fundación) + **creación de vault** (fundación).
3. **Donación individual** < target (no dispara liberación).
4. **Donación que alcanza el target** (dispara liberación del 50%).
5. **Subida de evidencia** (fundación).
6. **Liberación final** (admin).
7. **Intento de bypass**: `vault.deposit` directo debe fallar con `HostError: Error(Auth, ...)`.
8. **Cancelación de campaña** (fundación) antes de crear el vault.

### 11.3. Mocks recomendados

- **RPC**: usar `@stellar/stellar-sdk` con el RPC de Testnet directamente. No mockear.
- **Wallet**: usar `vellar-sdk` en modo testnet. Crea cuentas efímeras con Friendbot.
- **IPFS**: usar `nft.storage` o `Pinata` para subir evidencia. En test, se puede usar un CID dummy.

---

## 12. Próximos Pasos (para el equipo de frontend)

1. **Familiarizarse con `@stellar/stellar-sdk`**: leer [Stellar Docs — JavaScript SDK](https://developers.stellar.org/docs/build/guides/freighter/integrate-freighter-with-a-dapp).
2. **Probar `vellar-sdk`** en una demo mínima: crear wallet con Passkey, enviar una transacción.
3. **Integrar `router.quote` + `router.donate`** en un formulario simple.
4. **Construir el flujo de campaña**: lista, detalle, donación.
5. **Añadir panel de fundación**: crear campaña, subir evidencia.
6. **Añadir panel de admin**: aprobar fundaciones, liberar fondos.
7. **Suscribirse a eventos** para actualizar UI en tiempo real.

---

## 13. Referencias

- [Stellar Docs — JavaScript SDK](https://developers.stellar.org/docs/build/guides/freighter/integrate-freighter-with-a-dapp)
- [Stellar Docs — Soroban Client](https://developers.stellar.org/docs/build/guides/transactions/sign-and-submit)
- [vellar-sdk](https://github.com/stellar/vellar-sdk) (Passkey + relayer)
- [passkey-kit](https://github.com/kalepail/passkey-kit) (Passkey + smart accounts)
- [js-stellar-sdk](https://github.com/stellar/js-stellar-sdk) (recomendado por CLI 30)
- [Vaki](https://vaki.co/) (inspiración UX)
- [docs/events-reference.md](./events-reference.md) (eventos on-chain)
- [docs/known-limitations.md](./known-limitations.md) (limitaciones del MVP) 
