# 📡 Events Reference — Thriving Stellar

> **Audiencia**: Equipos de frontend que necesiten indexar eventos on-chain, construir historial de campañas, o reaccionar en tiempo real a cambios de estado.
> **Formato**: Todos los eventos son `#[contractevent]` y se publican con `publish(&env)`. Los campos `#[topic]` son índices de búsqueda eficientes.

---

## 1. `nonprofit-registry`

### `NonprofitRegistered`

**Emitido en**: `register_nonprofit`.
**Propósito**: Notificar que una fundación se registró en estado `Pending`.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `nonprofit` | `Address` | ✅ | Dirección de la fundación. |
| `legal_name` | `String` | ❌ | Razón social. |

**Payload de ejemplo**:
```json
{
  "type": "NonprofitRegistered",
  "nonprofit": "GCER47...",
  "legal_name": "Fundación Ejemplo"
}
```

---

### `NonprofitApproved`

**Emitido en**: `approve_nonprofit`.
**Propósito**: Notificar que una fundación fue aprobada y puede crear campañas.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `nonprofit` | `Address` | ✅ | Dirección de la fundación aprobada. |

---

### `NonprofitRevoked`

**Emitido en**: `revoke_nonprofit`.
**Propósito**: Notificar que una fundación fue revocada.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `nonprofit` | `Address` | ✅ | Dirección de la fundación revocada. |

---

## 2. `campaign-registry`

### `CampaignCreated`

**Emitido en**: `create_campaign`.
**Propósito**: Notificar la creación de una campaña y su `campaign_id`.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña (monotónicamente creciente). |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |
| `name` | `String` | ❌ | Nombre de la campaña. |
| `target_amount` | `i128` | ❌ | Monto objetivo en **NET**. |

**Payload de ejemplo**:
```json
{
  "type": "CampaignCreated",
  "campaign_id": 1,
  "nonprofit": "GCER47...",
  "name": "Comedor Comunitario",
  "target_amount": "100000000000"
}
```

---

### `CampaignCancelled`

**Emitido en**: `cancel_campaign`.
**Propósito**: Notificar que una campaña fue cancelada por su dueño.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña cancelada. |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |

---

## 3. `campaign-vault`

### `VaultCreated`

**Emitido en**: `create_vault`.
**Propósito**: Notificar que un vault fue creado para una campaña. A partir de este momento, la campaña acepta depósitos.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |
| `token_address` | `Address` | ❌ | SAC de la stablecoin usada. |

---

### `DonationDeposited`

**Emitido en**: `deposit`.
**Propósito**: Notificar un depósito individual. **No confundir** con `DonationRouted` (que es del router y representa la donación completa).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `donor` | `Address` | ❌ | Dirección del donante. |
| `amount` | `i128` | ❌ | Monto **NET** depositado (después del fee). |
| `total_deposited` | `i128` | ❌ | Total acumulado en el vault tras este depósito. |

**Payload de ejemplo**:
```json
{
  "type": "DonationDeposited",
  "campaign_id": 1,
  "donor": "GDONOR...",
  "amount": "49000000000",
  "total_deposited": "49000000000"
}
```

---

### `InitialFundsReleased`

**Emitido en**: `deposit` (cuando `total_deposited >= target_amount` y `!initial_release_done`).
**Propósito**: Notificar que se liberó el 50% inicial a la fundación.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que recibe los fondos. |
| `amount` | `i128` | ❌ | Monto liberado (50% del target). |

**Importante**: este evento se emite **junto con** el `DonationDeposited` que disparó la liberación. Si el frontend ve ambos, sabrá que la campaña cruzó el umbral de recaudación.

---

### `EvidenceSubmitted`

**Emitido en**: `submit_evidence`.
**Propósito**: Notificar que la fundación subió evidencia. Puede emitirse varias veces (sobrescritura intencional).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que sube la evidencia. |
| `evidence_hash` | `Bytes` | ❌ | Hash/CID de la evidencia (IPFS/Irys). |

---

### `FinalFundsReleased`

**Emitido en**: `release_final`.
**Propósito**: Notificar que el admin liberó el 50% restante.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que recibe los fondos. |
| `amount` | `i128` | ❌ | Monto liberado (50% restante). |

**Estado final**: la campaña queda con `final_release_done = true`. Cualquier intento de deposit posterior falla con `VaultFinalized`.

---

### `AuthorizedRouterUpdated`

**Emitido en**: `set_authorized_router`.
**Propósito**: Notificar cambios en la configuración del `authorized_router` (modo abierto ↔ cerrado).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `authorized_router` | `Option<Address>` | ❌ | `Some(router)` si está cerrado, `None` si está abierto. |

**Payload de ejemplo**:
```json
{
  "type": "AuthorizedRouterUpdated",
  "authorized_router": "CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD"
}
```

---

## 4. `donation-router`

### `DonationRouted`

**Emitido en**: `donate`.
**Propósito**: Notificar una donación completa (fee + net). **Este es el evento principal para el historial del donante**.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `donor` | `Address` | ❌ | Dirección del donante. |
| `gross_amount` | `i128` | ❌ | Monto total que pagó el donante. |
| `fee_amount` | `i128` | ❌ | Fee de plataforma. |
| `net_amount` | `i128` | ❌ | Monto que llegó al vault. |

**Payload de ejemplo** (fee = 200 bps, donación gross 5000):
```json
{
  "type": "DonationRouted",
  "campaign_id": 1,
  "donor": "GDONOR...",
  "gross_amount": "50000000000",
  "fee_amount": "1000000000",
  "net_amount": "49000000000"
}
```

**Uso en el frontend**: este evento es la fuente de verdad para el **historial de donaciones**. Si un donante quiere ver su impacto, agrupar `DonationRouted` por `donor`.

---

### `FeeBpsUpdated`

**Emitido en**: `update_fee_bps`.
**Propósito**: Notificar cambios en el fee de plataforma.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `old_fee_bps` | `u32` | ❌ | Fee anterior. |
| `new_fee_bps` | `u32` | ❌ | Fee nuevo. |

---

### `TreasuryUpdated`

**Emitido en**: `update_treasury`.
**Propósito**: Notificar cambios en la dirección de tesorería.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `old_treasury` | `Address` | ❌ | Tesorería anterior. |
| `new_treasury` | `Address` | ❌ | Tesorería nueva. |

---

## 5. Cómo suscribirse a eventos

### 5.1. Vía `@stellar/stellar-sdk`

```typescript
import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');

const events = await server.getEvents({
  startLedger: 0,
  filters: [
    {
      type: 'contract',
      contractIds: [CV_ID],  // Filtrar por contrato
      topics: [
        ['*', '*'],  // (topic1, topic2) wildcards
      ],
    },
  ],
});

for (const event of events.events) {
  const body = event.value;
  const native = scValToNative(body);
  console.log('Event:', native);
}
```

### 5.2. Filtrado por tipo de evento

Los eventos tienen un primer topic con el nombre del struct (e.g., `DonationRouted`). Para filtrar:

```typescript
// Filtrar solo DonationRouted del contrato del router
const filters = [
  {
    type: 'contract',
    contractIds: [DR_ID],
    topics: [
      [scvSymbol('DonationRouted').toXDR('base64'), '*'],
    ],
  },
];
```

### 5.3. Recomendación de polling

Soroban RPC no tiene websockets nativos (aún). El patrón recomendado:

- Polling cada 5-10 segundos al `getEvents` con `startLedger = lastProcessedLedger`.
- Cachear con TanStack Query y usar `refetchInterval`.
- Para producción con alto volumen, considerar un indexer dedicado (Mercury, SubQuery, etc.).

---

## 6. Mapa de Eventos por Flujo

| Flujo | Eventos en orden |
| :--- | :--- |
| **Registro de fundación** | `NonprofitRegistered` → (aprobación admin) `NonprofitApproved` |
| **Creación de campaña** | `CampaignCreated` → `VaultCreated` |
| **Donación individual** | `DonationRouted` (router) → `DonationDeposited` (vault) |
| **Primera donación que alcanza target** | `DonationRouted` → `DonationDeposited` → `InitialFundsReleased` |
| **Subida de evidencia** | `EvidenceSubmitted` |
| **Liberación final** | `FinalFundsReleased` |
| **Cancelación** | `CampaignCancelled` |
| **Cambio de fee** | `FeeBpsUpdated` |
| **Cambio de tesorería** | `TreasuryUpdated` |
| **Modo abierto/cerrado** | `AuthorizedRouterUpdated` |

---

## 7. Buenas Prácticas

1. **No asumir orden entre contratos**: los eventos de `donation-router` y `campaign-vault` se emiten en la misma transacción. El frontend debe agruparlos por `txHash` si necesita correlación.
2. **Filtrar por `contractId`**: cada contrato emite sus propios eventos. Filtrar por la dirección del contrato correcto evita ruido.
3. **Persistir el último `ledger` procesado**: para no re-procesar eventos duplicados.
4. **Usar `topics` para queries eficientes**: los campos `#[topic]` (e.g., `campaign_id`) son ideales para filtrar.
5. **Manejar reorgs**: aunque Stellar tiene finalidad rápida (~5s), considera un buffer de 1-2 ledgers antes de mostrar el evento como "final".
