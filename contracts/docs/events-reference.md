# 📡 Events Reference — Bitajón

> **Audiencia**: Equipos de frontend que necesiten indexar eventos on-chain, construir historial de campañas, o reaccionar en tiempo real a cambios de estado.
> **Formato**: Todos los eventos son `#[contractevent]` y se publican con `publish(&env)`. Los campos `#[topic]` son índices de búsqueda eficientes.
> **Estado**: v0.2.0 — Production-ready en Testnet. 5 contratos, 122 tests en verde.

---

## 0. Mapa rápido por contrato

| # | Contrato | Dirección (Testnet) | Eventos |
| :--- | :--- | :--- | :--- |
| 1 | `governance-account` | `CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U` | 4 |
| 2 | `nonprofit-registry` | `CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2` | 5 |
| 3 | `campaign-registry` | `CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6` | 4 |
| 4 | `campaign-vault` | `CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR` | 12 |
| 5 | `donation-router` | `CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67` | 5 |

---

## 1. `governance-account`

Multisig Ed25519 con umbral dinámico. Los signers son pubkeys (`BytesN<32>`), no `Address` (ver `known-limitations.md` → E2).

### `SignerAdded`

**Emitido en**: `add_signer`.

**Propósito**: Notificar que una nueva pubkey Ed25519 fue agregada al set de signers.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `signer` | `BytesN<32>` | ✅ | Pubkey Ed25519 del nuevo signer. |

---

### `SignerRemoved`

**Emitido en**: `remove_signer`.

**Propósito**: Notificar que un signer fue removido.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `signer` | `BytesN<32>` | ✅ | Pubkey Ed25519 del signer removido. |

---

### `ThresholdUpdated`

**Emitido en**: `update_threshold`.

**Propósito**: Notificar un cambio explícito en el threshold del multisig.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `old_threshold` | `u32` | ❌ | Threshold anterior. |
| `new_threshold` | `u32` | ❌ | Threshold nuevo. |

---

### `ThresholdAutoAdjusted`

**Emitido en**: `remove_signer` (cuando el threshold queda mayor que el nuevo conteo de signers).

**Propósito**: Notificar que el threshold fue bajado automáticamente para mantener la cuenta usable. Solo se emite en el caso de auto-ajuste; un `update_threshold` explícito emite `ThresholdUpdated`.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `old_threshold` | `u32` | ❌ | Threshold anterior. |
| `new_threshold` | `u32` | ❌ | Threshold ajustado (igual al nuevo `signers.len()`). |

---

## 2. `nonprofit-registry`

### `NonprofitRegistered`

**Emitido en**: `register_nonprofit`.

**Propósito**: Notificar que una fundación se registró en estado `Pending`.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `nonprofit` | `Address` | ✅ | Dirección de la fundación. |
| `legal_name` | `String` | ❌ | Razón social. |

---

### `NonprofitApproved`

**Emitido en**: `approve_nonprofit`.

**Propósito**: Notificar que una fundación fue aprobada.

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

### `AdminProposed`

**Emitido en**: `propose_admin`.

**Propósito**: Notificar una propuesta de cambio de admin (two-step transfer).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `current` | `Address` | ❌ | Admin actual. |
| `proposed` | `Address` | ❌ | Admin propuesto. |

---

### `AdminAccepted`

**Emitido en**: `accept_admin`.

**Propósito**: Notificar que el admin propuesto aceptó el rol.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `new_admin` | `Address` | ❌ | Nuevo admin. |

---

## 3. `campaign-registry`

### `CampaignCreated`

**Emitido en**: `create_campaign`.

**Propósito**: Notificar la creación de una campaña.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña (monotónicamente creciente). |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |
| `name` | `String` | ❌ | Nombre de la campaña. |
| `target_amount` | `i128` | ❌ | Monto objetivo en **NET** (después de fee). |

**Payload de ejemplo**:
```json
{
  "type": "CampaignCreated",
  "campaign_id": 1,
  "nonprofit": "CAVXPF...",
  "name": "Comedor Comunitario",
  "target_amount": "100000000000"
}
```

---

### `CampaignCancelled`

**Emitido en**: `cancel_campaign`.

**Propósito**: Notificar que una campaña fue cancelada.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña cancelada. |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |

---

### `AdminProposed` / `AdminAccepted`

Mismo formato que en `nonprofit-registry`. Ver §2.

---

## 4. `campaign-vault`

### `VaultCreated`

**Emitido en**: `create_vault`.

**Propósito**: Notificar que un vault fue creado para una campaña. A partir de este momento, la campaña acepta depósitos.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación dueña. |
| `token_address` | `Address` | ❌ | SAC de la stablecoin usada. |
| `verifier` | `Address` | ❌ | Dirección autorizada a validar evidencia y liberar el balance final. |

---

### `DonationDeposited`

**Emitido en**: `deposit`.

**Propósito**: Notificar un depósito individual. **No confundir** con `DonationRouted` (que es del router y representa la donación completa desde la perspectiva del donante).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `donor` | `Address` | ❌ | Dirección del donante. |
| `amount` | `i128` | ❌ | Monto **NET** depositado (después del fee). |
| `total_deposited` | `i128` | ❌ | Total acumulado en el vault tras este depósito. |

---

### `InitialFundsReleased`

**Emitido en**: `deposit` (cuando `total_deposited >= target_amount` y `!initial_release_done`).

**Propósito**: Notificar que se liberó el milestone inicial a la fundación.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que recibe los fondos. |
| `amount` | `i128` | ❌ | Monto liberado = `(target_amount * milestone_percentage) / 100`. |

**Importante**: este evento se emite **junto con** el `DonationDeposited` que disparó la liberación. El `amount` depende del `milestone_percentage` configurado en la campaña (1%..90%).

---

### `EvidenceSubmitted`

**Emitido en**: `submit_evidence`.

**Propósito**: Notificar que la fundación subió evidencia. Puede emitirse varias veces (sobrescritura intencional, ver `known-limitations.md` → D2).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que sube la evidencia. |
| `evidence_hash` | `Bytes` | ❌ | Hash/CID de la evidencia (IPFS/Irys). |

---

### `FinalFundsReleased`

**Emitido en**: `release_final`.

**Propósito**: Notificar que el verifier liberó el balance restante.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `nonprofit` | `Address` | ❌ | Fundación que recibe los fondos. |
| `amount` | `i128` | ❌ | Monto liberado = `total_deposited - initial_release`. |

**Estado final**: la campaña queda con `final_release_done = true`. Cualquier intento de deposit posterior falla con `VaultFinalized`.

---

### `RefundClaimed`

**Emitido en**: `claim_refund`.

**Propósito**: Notificar que un donante reclamó su refund tras expiración, cancelación, o pausa sin liberación inicial.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `donor` | `Address` | ❌ | Donante que reclama. |
| `amount` | `i128` | ❌ | Monto reclamado (net contribution). |

---

### `VaultPaused`

**Emitido en**: `pause_vault`.

**Propósito**: Notificar que un vault fue pausado por el admin (freno de emergencia).

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |

**Efecto**: bloquea `deposit` con `VaultPaused` (#32). `claim_refund` queda habilitado incluso sin expiración.

---

### `VaultUnpaused`

**Emitido en**: `unpause_vault`.

**Propósito**: Notificar que un vault fue despausado.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |

---

### `VerifierUpdated`

**Emitido en**: `set_verifier_for_campaign`.

**Propósito**: Notificar un cambio en el verifier de una campaña.

| Campo | Tipo | Topic | Descripción |
| :--- | :--- | :--- | :--- |
| `campaign_id` | `u64` | ✅ | ID de la campaña. |
| `new_verifier` | `Address` | ❌ | Nueva dirección autorizada a validar evidencia. |

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
  "authorized_router": "CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67"
}
```

---

### `AdminProposed` / `AdminAccepted`

Mismo formato que en `nonprofit-registry`. Ver §2.

---

## 5. `donation-router`

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

### `AdminProposed` / `AdminAccepted`

Mismo formato que en `nonprofit-registry`. Ver §2.

---

## 6. Cómo suscribirse a eventos

### 6.1. Vía `@stellar/stellar-sdk`

```typescript
import { SorobanRpc, scValToNative } from '@stellar/stellar-sdk';

const server = new SorobanRpc.Server('https://soroban-testnet.stellar.org');

const events = await server.getEvents({
  startLedger: 0,
  filters: [
    {
      type: 'contract',
      contractIds: [CV_ID],
      topics: [['*', '*']],
    },
  ],
});

for (const event of events.events) {
  const body = event.value;
  const native = scValToNative(body);
  console.log('Event:', native);
}
```

### 6.2. Filtrado por tipo de evento

Los eventos tienen un primer topic con el nombre del struct. Para filtrar por `DonationRouted` del router:

```typescript
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

### 6.3. Recomendación de polling

Soroban RPC no tiene websockets nativos (aún). El patrón recomendado:

- Polling cada 5-10 segundos al `getEvents` con `startLedger = lastProcessedLedger`.
- Cachear con TanStack Query y `refetchInterval`.
- Para producción con alto volumen, considerar un indexer dedicado (Mercury, SubQuery, etc.).

---

## 7. Mapa de Eventos por Flujo

| Flujo | Eventos en orden |
| :--- | :--- |
| **Rotación de admin (cualquier contrato)** | `AdminProposed` → `AdminAccepted` |
| **Rotación de signer (governance-account)** | `SignerAdded` / `SignerRemoved` → (opcional) `ThresholdUpdated` o `ThresholdAutoAdjusted` |
| **Registro de fundación** | `NonprofitRegistered` → `NonprofitApproved` |
| **Creación de campaña** | `CampaignCreated` → `VaultCreated` |
| **Donación individual** | `DonationRouted` (router) → `DonationDeposited` (vault) |
| **Primera donación que alcanza target** | `DonationRouted` → `DonationDeposited` → `InitialFundsReleased` |
| **Subida de evidencia** | `EvidenceSubmitted` |
| **Liberación final** | `FinalFundsReleased` |
| **Refund por expiración / cancelación / pausa** | `RefundClaimed` |
| **Freno de emergencia** | `VaultPaused` / `VaultUnpaused` |
| **Rotación de verifier** | `VerifierUpdated` |
| **Cancelación de campaña** | `CampaignCancelled` |
| **Cambio de fee** | `FeeBpsUpdated` |
| **Cambio de tesorería** | `TreasuryUpdated` |
| **Modo abierto/cerrado del router** | `AuthorizedRouterUpdated` |

---

## 8. Buenas Prácticas

1. **No asumir orden entre contratos**: los eventos de `donation-router` y `campaign-vault` se emiten en la misma transacción. Agrupar por `txHash` si se necesita correlación.
2. **Filtrar por `contractId`**: cada contrato emite sus propios eventos.
3. **Persistir el último `ledger` procesado**: para no re-procesar eventos duplicados.
4. **Usar `topics` para queries eficientes**: los campos `#[topic]` son ideales para filtrar.
5. **Manejar reorgs**: aunque Stellar tiene finalidad rápida (~5s), considerar un buffer de 1-2 ledgers antes de mostrar un evento como "final".
6. **Diferenciar `DonationRouted` de `DonationDeposited`**: el primero es la vista del donante (gross + fee + net); el segundo es la vista del vault (net acumulado).
7. **`RefundClaimed` es por donante y por campaña**: si un donante reclama refunds de múltiples campañas, verá múltiples eventos.
8. **`ThresholdAutoAdjusted` vs `ThresholdUpdated`**: si el evento es `ThresholdAutoAdjusted`, el admin no lo pidió explícitamente — fue una consecuencia de remover un signer. Si es `ThresholdUpdated`, el admin lo decidió.

