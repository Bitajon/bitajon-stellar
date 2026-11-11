# 🎨 Frontend Integration Guide — Bitajón

> **Audiencia**: Equipos de frontend y agentes de IA que construyan la interfaz de Bitajón.
> **Pre-requisito**: Leer [`../README.md`](../README.md) para el contexto de arquitectura, [`known-limitations.md`](./known-limitations.md) para el estado de cada limitación (badges H#, D#, E#, T#), y [`events-reference.md`](./events-reference.md) para los eventos on-chain.
> **Estado**: v0.2.0 — Production-ready en Testnet (Protocolo 30). Fee de plataforma = 0 bps. Bypass del fee cerrado vía `authorized_router`. 122 tests en verde.

---

## 1. Contexto de Negocio

Bitajón es una plataforma de **crowdfunding con trazabilidad on-chain** para fundaciones y ONG's en Colombia. El diferencial respecto a Vaki es el **Modelo de Confianza**:

1. Los donantes aportan a una **campaña** específica.
2. Los fondos quedan en **custodia on-chain** (`campaign-vault`), no en una cuenta bancaria.
3. Al alcanzar el `target_amount`, se libera automáticamente un porcentaje configurable (el **milestone**, entre 1% y 90%) a la fundación.
4. La fundación sube **evidencia** del uso de los fondos (fotos, facturas).
5. El **verifier** designado valida la evidencia y libera el balance restante.
6. Si la campaña no alcanza la meta, expira o se cancela, **cada donante puede reclamar su aporte** vía `claim_refund`.

Se implementa con **5 contratos Soroban** que el frontend debe orquestar.

Este documento es una actualización de los nuevos contratos.

---

## 2. Stack

Ya escogido por el Equipo de frontend

## 3. Contratos y sus Direcciones (Testnet)

| # | Contrato | Dirección (`C...`) | Rol en el frontend |
| :--- | :--- | :--- | :--- |
| 1 | **Governance Account** | `CCQ2VQX3QXE6OXXTVN77XTLKMWFUKW7HJAENIPEELVRIU7JSI2TT47BD` | Multisig admin del protocolo. |
| 2 | **Nonprofit Registry** | `CAVXPFUWBQ3NCYFIP5TRPMHIOPVFU6QL6GKVHQDG5LAQVNRN6NIONKCY` | Registro/aprobación de fundaciones. |
| 3 | **Campaign Registry** | `CDMODZCKIUJDWFYKB3M3CI3MMUY6GXNENNRSM7EWKHHWLEP4IHFPT4VC` | Crear/listar campañas. |
| 4 | **Campaign Vault** | `CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK` | Custodia, depósitos, evidencia, liberaciones, refunds. |
| 5 | **Donation Router** | `CC3B4UP4AXCW4IMJCDXIT3Y7CFW7QFTCJXPSHYNKLQEDFHZA76EFEWGS` | Punto de entrada único para donaciones. Aplica el fee. |

**Red**: `Test SDF Network ; September 2015`
**RPC URL**: `https://soroban-testnet.stellar.org`
**Friendbot** (fondear cuentas nuevas): `https://friendbot.stellar.org/?addr=<ADDRESS>`
**Explorer**: `https://stellar.expert/explorer/testnet`
**Estado operativo del deploy**: Ver [`../README.md`](../README.md) para wasm hashes, tx hashes, metadata del deploy, y estado de TTL.

---

## 4. Modelo de Fee y Milestone

### 4.1. Fee de Plataforma (Modelo B: FROM DEPOSIT)

El `donation-router` aplica un fee descontado del gross. **Configuración actual (Testnet)**: `fee_bps = 0` (0% — intencional para el demo).

**Fórmula**:
```text
fee_amount = (gross_amount * fee_bps) / 10_000   // división entera
net_amount = gross_amount - fee_amount
```

- Donante paga `gross_amount`.
- Tesorería recibe `fee_amount`.
- Vault recibe `net_amount`.

**Cap duro**: `MAX_FEE_BPS = 1000` (10%). Ver `known-limitations.md` → **D6**.

### 4.2. ⚠️ Los `target_amount` están en NET

El `target_amount` de una campaña es lo que debe acumular el vault (después de fees) para disparar la liberación del milestone.

**Ejemplo** con `target_amount = 10_000` y `fee_bps = 200` (2%):
```text
gross_amount = ceil(10_000 * 10_000 / (10_000 - 200)) = 10_204
fee_amount   = 10_204 * 200 / 10_000 = 204
net_amount   = 10_204 - 204 = 10_000
```

**El frontend DEBE**:
1. Antes de mostrar el formulario, llamar `router.quote(gross_amount)` para obtener `{ gross, fee, net }`.
2. Mostrar los 3 valores al donante (transparencia radical).
3. Si el donante quiere que la campaña reciba X neto, calcular `gross` con la fórmula de arriba.

**El frontend NO DEBE**:
- ❌ Asumir que `gross = target_amount`.
- ❌ Calcular el fee manualmente sin consultar `get_fee_bps()` (el admin puede cambiarlo).
- ❌ Ocultar el fee al donante.

### 4.3. ⚠️ El `milestone_percentage` es OBLIGATORIO (rango 1..=90)

A diferencia del fee, el `milestone_percentage` **no tiene default**. Debe estar en `1..=90`.

- **Recomendado para sugerir**: `RECOMMENDED_MILESTONE_PERCENTAGE = 50`.
- **Cap de 90%**: garantiza que al menos 10% del target quede atado a la validación de evidencia. Ver `known-limitations.md` → **D4**.
- **Mínimo de 1%**: campañas que quieran máxima presión sobre la evidencia pueden usar `milestone_percentage = 1`.

**El frontend DEBE** pedir este valor al crear la campaña y mostrar el trade-off: *"Con milestone 50%, la fundación recibe 50% al alcanzar la meta y 50% tras validar evidencia. El máximo permitido es 90% (al menos 10% siempre queda atado a evidencia)."*

**Nota**: `create_campaign` con `milestone_percentage = 0` falla con `InvalidMilestonePercentage` (#13). No hay fallback.

---

## 5. Funciones por Contrato

### 5.1. `nonprofit-registry`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `register_nonprofit` | `nonprofit: Address`, `profile: NonprofitProfile` | — | `nonprofit` |
| `approve_nonprofit` | `admin: Address`, `nonprofit: Address` | — | `admin` |
| `revoke_nonprofit` | `admin: Address`, `nonprofit: Address` | — | `admin` |
| `is_approved` | `nonprofit: Address` | `bool` | — |
| `get_profile` | `nonprofit: Address` | `NonprofitProfile` | — |
| `propose_admin` | `admin: Address`, `new_admin: Address` | — | `admin` |
| `accept_admin` | — | — | `new_admin` |
| `get_admin` | — | `Address` | — |
| `get_pending_admin` | — | `Option<Address>` | — |

**`NonprofitProfile`**:
```typescript
type NonprofitProfile = {
  legal_name: string;         // Razón social
  tax_id: string;             // NIT
  rut_hash: Uint8Array;       // SHA-256 del RUT (off-chain en IPFS/Supabase)
  email_hash: Uint8Array;     // SHA-256 del email (el email real vive off-chain, ver D8)
  retention_certificate: boolean;
  data_consent: boolean;      // Habeas Data (Ley 1581)
  status: 'Pending' | 'Approved' | 'Revoked';
};
```

> ⚠️ `email_hash` es un hash SHA-256, no el email. El frontend debe mantener un índice off-chain (`address → email`) porque el contrato no lo puede recuperar. Ver `known-limitations.md` → **D8**.

### 5.2. `campaign-registry`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `create_campaign` | `nonprofit`, `name`, `description`, `location`, `target_amount`, `token_address`, `deadline`, `milestone_percentage` | `u64` (campaign_id) | `nonprofit` |
| `cancel_campaign` | `nonprofit`, `campaign_id` | — | `nonprofit` |
| `get_campaign` | `campaign_id` | `Campaign` | — |
| `propose_admin` | `admin`, `new_admin` | — | `admin` |
| `accept_admin` | — | — | `new_admin` |

**`Campaign`**:
```typescript
type Campaign = {
  nonprofit: string;
  name: string;
  description: string;
  location: string;
  target_amount: bigint;        // En NET (después de fee)
  token_address: string;        // SAC address (USDC, EURC, COP...)
  deadline: bigint;             // Unix timestamp
  milestone_percentage: number; // 1..=90, sin default
  status: 'Active' | 'Completed' | 'Cancelled';
};
```

### 5.3. `campaign-vault`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `create_vault` | `campaign_id`, `nonprofit`, `verifier` | — | `nonprofit` |
| `deposit` | `campaign_id`, `donor`, `amount` | — | `donor` + `router` (si `authorized_router` está configurado) |
| `claim_refund` | `campaign_id`, `donor` | — | `donor` |
| `submit_evidence` | `campaign_id`, `nonprofit`, `evidence_hash` | — | `nonprofit` |
| `release_final` | `campaign_id`, `verifier`, `expected_evidence` | — | `verifier` |
| `pause_vault` | `admin`, `campaign_id` | — | `admin` |
| `unpause_vault` | `admin`, `campaign_id` | — | `admin` |
| `set_verifier_for_campaign` | `admin`, `campaign_id`, `verifier` | — | `admin` |
| `set_authorized_router` | `admin`, `router: Option<Address>` | — | `admin` |
| `get_authorized_router` | — | `Option<Address>` | — |
| `get_vault` | `campaign_id` | `VaultState` | — |

**`VaultState`**:
```typescript
type VaultState = {
  campaign_id: bigint;
  nonprofit: string;
  token_address: string;
  target_amount: bigint;
  deadline: bigint;
  milestone_percentage: number;
  verifier: string;
  total_deposited: bigint;
  initial_release_done: boolean;
  evidence_hash: Uint8Array | null;
  final_release_done: boolean;
  paused: boolean;
};
```

> ⚠️ **No llamar `deposit` directamente desde el frontend**. Siempre usar `router.donate(...)` para respetar el fee. Con `authorized_router` activado, un `deposit` directo falla con `HostError: Error(Auth, ...)`.

> ⚠️ **`release_final` requiere `expected_evidence`**. El verifier debe pasar el hash exacto que revisó. Si la fundación cambió la evidencia entre la revisión y la firma, la transacción falla con `InvalidEvidenceHash` (#29). El frontend debe guardar el `evidence_hash` que el verifier revisó en el panel admin y pasarlo en la llamada.

### 5.4. `donation-router`

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `donate` | `campaign_id`, `donor`, `amount` (gross) | — | `donor` |
| `quote` | `gross_amount` | `QuoteResult` | — |
| `get_fee_bps` | — | `u32` | — |
| `get_treasury` | — | `Address` | — |
| `get_campaign_vault` | — | `Address` | — |
| `update_fee_bps` | `admin`, `new_fee_bps` | — | `admin` |
| `update_treasury` | `admin`, `new_treasury` | — | `admin` |
| `propose_admin` | `admin`, `new_admin` | — | `admin` |
| `accept_admin` | — | — | `new_admin` |

**`QuoteResult`**:
```typescript
type QuoteResult = {
  gross_amount: bigint;
  fee_amount: bigint;
  net_amount: bigint;
};
```

### 5.5. `governance-account` (multisig)

| Función | Args | Retorna | Auth |
| :--- | :--- | :--- | :--- |
| `add_signer` | `new_signer: BytesN<32>` | — | Self (threshold actual) |
| `remove_signer` | `signer: BytesN<32>` | — | Self (threshold actual) |
| `update_threshold` | `new_threshold: u32` | — | Self (threshold actual) |
| `get_signers` | — | `Vec<BytesN<32>>` | — |
| `get_threshold` | — | `u32` | — |
| `is_signer` | `pubkey: BytesN<32>` | `bool` | — |
| `verify_signatures` | `payload: BytesN<32>`, `proofs: Vec<SignerProof>` | `Result<(), Error>` | — |

**`SignerProof`**:
```typescript
type SignerProof = {
  public_key: Uint8Array;  // 32 bytes, Ed25519 pubkey
  signature: Uint8Array;   // 64 bytes, Ed25519 signature
};
```

**Cómo el frontend construye una transacción con smart account**:

Los signers del `governance-account` son **pubkeys Ed25519** (`BytesN<32>`), no `Address`. Esto implica que el cliente debe construir el `SorobanAuthorizationEntry` a mano. Ver `known-limitations.md` → **E2** para el rationale.

Los pasos (referencia completa en `contracts/scripts/bootstrap.mjs`):

1. **Simular** la transacción para obtener los `requiredAuth` entries.
2. Para cada entry con credencial `address_v2`, calcular el `signature_payload` como:
   ```
   sha256(XDR(HashIdPreimageSorobanAuthorizationWithAddress{
     networkId,
     nonce,
     signatureExpirationLedger,  // ← ledger futuro (~currentLedger + 100)
     address,                    // ← ScAddress del governance-account
     invocation,
   }))
   ```
   **Envelope type 10 (CAP-71), no type 9**. Este es el error #1 que cometen los integradores.
3. **Firmar** el `signature_payload` con cada signer privado.
4. Construir `ScVal::Vec([ScVal::Map({ public_key, signature }), ...])`.
5. Setear `signatureExpirationLedger = currentLedger + 100` (~8 minutos). Si es `0`, el host rechaza la firma como expirada.
6. **Bumpear el `instruction limit`** en el `SorobanTransactionData` (~2M instrucciones extra para un signer). El simulation no ejecuta `__check_auth` con firmas reales, así que subestima.

El contrato expone `verify_signatures(payload, proofs)` como helper read-only para pre-checkear un proof set antes de construir el auth entry.

**Nota sobre el modelo de gobernanza actual**: el `governance-account` tiene `[deployer]` con `threshold = 1`. Escalar a 2-de-3 es `add_signer` + `update_threshold`, sin redeploy. Ver `known-limitations.md` → **H5** para el checklist pre-Mainnet.

---

## 6. Flujos de Usuario (End-to-End)

### 6.1. Flujo: La fundación se registra

```text
1. Fundación conecta su wallet.
2. Sube documentos legales a IPFS/Supabase → obtiene hashes (rut_hash, email_hash).
3. Llama np.register_nonprofit({ nonprofit, profile }) con status = Pending.
4. Espera aprobación del governance-account (firmada por los signers).
5. Consulta np.is_approved({ nonprofit }) → true cuando esté aprobada.
6. Ahora puede crear campañas.
```

### 6.2. Flujo: La fundación crea una campaña

```text
1. Pre-requisito: fundación aprobada en nonprofit-registry.
2. Fundación llama cr.create_campaign({..., milestone_percentage}) → retorna campaign_id.
3. Fundación llama cv.create_vault({ campaign_id, nonprofit, verifier }).
   - `verifier` es la dirección (EOA o smart account) que validará la evidencia.
4. Ahora la campaña acepta donaciones.
```

### 6.3. Flujo: El donante dona

```text
1. Donante ve la campaña (cr.get_campaign).
2. Ingresa el monto que quiere donar (gross).
3. Frontend llama dr.quote({ gross_amount }) → muestra { gross, fee, net }.
4. Donante confirma → frontend llama dr.donate({ campaign_id, donor, amount: gross }).
5. Router: cobra fee a la treasury, envía net al vault.
6. Vault: si total_deposited >= target_amount → libera el milestone (automático).
7. Frontend refresca cv.get_vault → muestra progreso actualizado.
```

### 6.4. Flujo: La fundación sube evidencia

```text
1. Pre-requisito: initial_release_done == true.
2. Fundación sube fotos/videos a IPFS/Irys → obtiene CID.
3. Fundación llama cv.submit_evidence({ campaign_id, nonprofit, evidence_hash: CID_bytes }).
4. El hash queda registrado on-chain. Puede sobrescribirse hasta el release_final (ver D2).
```

### 6.5. Flujo: El verifier libera el balance final

```text
1. Verifier revisa off-chain la evidencia (cv.get_vault → evidence_hash).
2. Guarda el hash revisado en el estado del panel (React state, no on-chain).
3. Si aprueba, llama cv.release_final({ campaign_id, verifier, expected_evidence: <hash guardado> }).
4. Vault verifica que el hash coincida (TOCTOU protection). Si no, falla con InvalidEvidenceHash (#29).
5. Vault transfiere el balance restante a la fundación.
6. Estado final: total_deposited == target_amount → distribución completa.
```

### 6.6. Flujo: Un donante reclama su refund (H1)

```text
1. Campaña expiró, fue cancelada, o el vault fue pausado sin liberar el milestone inicial.
2. Donante va a su dashboard y ve el botón "Reclamar reembolso".
3. Frontend llama cv.claim_refund({ campaign_id, donor }).
4. Vault transfiere el net contribution al donante.
5. La contribución queda a cero (no se puede reclamar dos veces → NothingToRefund #28).
```

### 6.7. Flujo: Admin pausa un vault (H4)

```text
1. Admin (governance-account) detecta actividad sospechosa en una campaña.
2. Llama cv.pause_vault({ admin, campaign_id }).
3. Vault bloquea nuevos depósitos (VaultPaused #32) y habilita refunds inmediatos.
4. Admin investiga. Si todo está bien, llama cv.unpause_vault({ admin, campaign_id }).
```

### 6.8. Flujo: Rotación de admin (two-step)

```text
1. Admin actual (governance-account) llama propose_admin({ admin, new_admin }).
2. El nuevo admin (una nueva smart account) llama accept_admin().
3. El contrato actualiza el admin y emite AdminProposed → AdminAccepted.
4. Aplica a nonprofit-registry, campaign-registry, campaign-vault, donation-router.
```

---

## 7. Manejo de Errores

El enum `Error` es compartido por todos los contratos con discriminantes estables.

| Código | Error | Mensaje UX sugerido |
| :--- | :--- | :--- |
| 1 | `Unauthorized` | "No tienes permisos para esta acción." |
| 2 | `NonprofitNotFound` | "La fundación no está registrada." |
| 3 | `NonprofitNotApproved` | "La fundación aún no está aprobada." |
| 4 | `NonprofitAlreadyRegistered` | "Esta fundación ya está registrada." |
| 5 | `CampaignNotFound` | "La campaña no existe." |
| 6 | `CampaignNotActive` | "La campaña no está activa." |
| 8 | `EvidenceNotSubmitted` | "Aún no se ha subido evidencia." |
| 11 | `InvalidAmount` | "El monto debe ser mayor a cero." |
| 12 | `InvalidDeadline` | "La fecha límite debe ser futura." |
| 13 | `InvalidMilestonePercentage` | "El milestone debe estar entre 1% y 90%." |
| 16 | `FinalAlreadyReleased` | "Los fondos finales ya fueron liberados." |
| 18 | `NotVaultAdmin` | "Solo el admin puede hacer esta acción." |
| 19 | `DepositExceedsTarget` | "El monto excede el objetivo de la campaña." |
| 20 | `CampaignAlreadyExists` | "Esta campaña ya tiene un vault." |
| 21 | `InitialReleaseNotDone` | "La liberación inicial aún no se ha ejecutado." |
| 22 | `CampaignExpired` | "La campaña ya expiró." |
| 23 | `VaultFinalized` | "Esta campaña ya está finalizada." |
| 24 | `InvalidEvidence` | "La evidencia no puede estar vacía." |
| 25 | `InvalidFeeBps` | "El fee excede el máximo permitido (10%)." |
| 26 | `NotAuthorizedRouter` | (Solo interno) "Depósito no autorizado." |
| 27 | `RefundNotAvailable` | "Esta campaña aún no permite reembolsos." |
| 28 | `NothingToRefund` | "No tienes aportes pendientes en esta campaña." |
| 29 | `InvalidEvidenceHash` | "La evidencia cambió desde que la revisaste. Recarga y vuelve a revisar." |
| 30 | `NotVerifier` | "Solo el verificador designado puede liberar el balance final." |
| 31 | `NotPendingAdmin` | "No eres el administrador pendiente." |
| 32 | `VaultPaused` | "Esta campaña está temporalmente pausada." |

**Formato de error en JS**:
```typescript
try {
  await cv.release_final({ campaign_id, verifier, expected_evidence });
} catch (err) {
  // Los errores de Soroban llegan como `HostError: Error(Contract, #N)`
  const match = String(err).match(/Error\(Contract, #(\d+)\)/);
  const code = match ? parseInt(match[1]) : null;
  // Mapear `code` a mensaje UX usando la tabla de arriba
}
```

---

## 8. Eventos On-Chain

Para el detalle completo, consulta [`events-reference.md`](./events-reference.md). Los eventos por contrato:

| Contrato | Eventos |
| :--- | :--- |
| `governance-account` | `SignerAdded`, `SignerRemoved`, `ThresholdUpdated`, `ThresholdAutoAdjusted` |
| `nonprofit-registry` | `NonprofitRegistered`, `NonprofitApproved`, `NonprofitRevoked`, `AdminProposed`, `AdminAccepted` |
| `campaign-registry` | `CampaignCreated`, `CampaignCancelled`, `AdminProposed`, `AdminAccepted` |
| `campaign-vault` | `VaultCreated`, `DonationDeposited`, `InitialFundsReleased`, `EvidenceSubmitted`, `FinalFundsReleased`, `RefundClaimed`, `VaultPaused`, `VaultUnpaused`, `VerifierUpdated`, `AuthorizedRouterUpdated`, `AdminProposed`, `AdminAccepted` |
| `donation-router` | `DonationRouted`, `FeeBpsUpdated`, `TreasuryUpdated`, `AdminProposed`, `AdminAccepted` |

**Recomendación**: suscribirse a eventos vía `getEvents` del SDK RPC y cachear con TanStack Query. Los eventos son la fuente de verdad para el historial de donaciones y el progreso de campaña.

---

## 9. Autenticación y Patrocinio de Fees

### 9.1. Opciones de Auth (estado real, noviembre 2026)

| Herramienta | Enlaces | Estado | Recomendación |
| :--- | :--- | :--- | :--- |
| **Blux** | [docs.blux.cc](https://docs.blux.cc) · [github.com/bluxcc/react](https://github.com/bluxcc/react) · [demo.blux.cc](https://demo.blux.cc) | ✅ Activo. Demo actualizada hace 2 semanas. Soporta login social (Google, Discord, GitHub). ⚠️ Licencia: "No Production Use Until 2028" y OAuth figura como "Coming Soon" en el README. | **Primario para el demo.** Ideal para validar la UX con Google login. Migrar a Accesly o Smart Account Kit antes de producción real. |
| **Accesly** | [dorahacks.io/build/36779](https://dorahacks.io/build/36779) · [npmjs.com/~accesly](https://www.npmjs.com/~accesly) | ✅ Activo, SDF partner. SDK para auth social (Google, email) y account abstraction. Genera wallet determinista (misma cuenta Google = misma dirección Stellar) y permite transacciones gas-less. | **Secundario.** Sólido técnicamente. Menos actualizado que Blux en npm. Buena opción si Blux no funciona. |
| **Smart Account Kit** | [github.com/stellar/smart-account-kit](https://github.com/stellar/smart-account-kit) · [npm](https://www.npmjs.com/package/smart-account-kit) | ✅ Estándar actual. Solo Passkeys (WebAuthn), **no Google OAuth nativo**. | Standard para passkeys. **No prioritario** para el público objetivo inicial  |
| **Passkey Kit** | [github.com/kalepail/passkey-kit](https://github.com/kalepail/passkey-kit) | ✅ Activo. Alternativa a Smart Account Kit. Solo Passkeys. | No prioritario. |
| **Stellar Appkit** | [github.com/sagantaHQ/stellar-appkit](https://github.com/SagantaHQ/stellar-appkit) | ✅ Activo (desarrollador independiente). | Explorar como alternativa. |
| **@stellar-zklogin/sdk** | [npm](https://www.npmjs.com/package/@stellar-zklogin/sdk) | ❌ **Deprecado.** Repo 404, última actualización ~10 meses. | **No usar.** |

### 9.2. Recomendación concreta para el MVP

Para el **público objetivo** (personas que no saben qué es blockchain), el onboarding más simple es **Google OAuth**. La ruta recomendada:

1. **Fase demo**: Blux (`@bluxcc/react`). Ya tiene demo funcionando, integración React lista, y OAuth soportado.
2. **Fase producción** (si se necesita license comercial): Accesly o Smart Account Kit con passkeys + Google login custom.

**Consideración**: cualquier SDK de OAuth genera una `Address` (`G...` o `C...`) que los contratos de Bitajón ya aceptan. **No se necesitan cambios en los contratos**.

### 9.3. Sobre Passkeys (por qué NO son prioritarios)

Las smart accounts con passkeys (`C...`) ofrecen una experiencia sin seed phrase (Face ID / Touch ID). Pero:

- El público objetivo inicial **no sabe qué es un passkey**.
- Muchos dispositivos (especialmente Android viejos) no lo soportan.
- El onboarding con Google es más familiar y menos friccional.

Se recomienda **Google OAuth como primario** y passkeys como opción secundaria para usuarios avanzados.

### 9.4. Patrocinio de Fees

Las smart accounts (`C...`) **no pueden pagar fees por sí mismas** en Soroban. Necesitan que una cuenta externa las patrocine.

**Opción A: Fee-Bump Transaction**
El backend envuelve la transacción del usuario en una `FeeBumpTransaction`, donde la cuenta de la plataforma paga la comisión en XLM. El usuario firma la transacción interna (con su auth elegida), el backend la envuelve y la envía.

**Opción B: Relayer Propio**
El backend mantiene una cuenta `G...` con XLM y construye/firma las transacciones por el usuario. El backend paga el fee.

**Costos**: ~100 stroops por operación (~0.00001 XLM). Prácticamente gratis.

### 9.5. Friendbot en Testnet

Para que el usuario pueda probar sin comprar XLM:

```typescript
async function fundTestnetAccount(address: string) {
  await fetch(`https://friendbot.stellar.org/?addr=${address}`);
}
```

Llamar después de crear la cuenta. En Mainnet, reemplazar por un on-ramp (VANK, Pollar).

---

## 10. Consideraciones de UX

### 10.1. Inspiración: Vaki

- **Transparencia radical**: mostrar fee, net, y destino de cada peso.
- **Progreso visual**: barra de recaudación, hitos alcanzados, milestone configurado.
- **Evidencia visual**: fotos/videos de la ejecución, con sello "Evidencia verificada".
- **Confianza**: certificados, auditorías, reportes de impacto.

### 10.2. Pantallas mínimas (MVP)

1. **Home**: lista de campañas activas.
2. **Detalle de campaña**: descripción, target, total recaudado, milestone, evidencia.
3. **Formulario de donación**: monto, desglose gross/fee/net, botón "Donar".
4. **Perfil de fundación**: campañas activas, historial, evidencia subida.
5. **Panel de admin** (governance-account): aprobar/rechazar fundaciones, validar evidencia con `expected_evidence`, liberar fondos, pausar vaults.
6. **Historial del donante**: donaciones realizadas, impacto total, **botón "Reclamar reembolso"** para campañas elegibles.

### 10.3. Estados visuales por campaña

| Estado | Condición | CTA |
| :--- | :--- | :--- |
| `draft` | Sin vault creado | "Crear vault" (fundación) |
| `active` | `vault.total_deposited < target && !expired` | "Donar" |
| `funded` | `total_deposited >= target && !final_release_done` | "Ver evidencia" |
| `evidence_pending` | `initial_release_done && !evidence_hash` | "Subir evidencia" (fundación) |
| `evidence_submitted` | `evidence_hash != null && !final_release_done` | "Revisar evidencia" (verifier) |
| `completed` | `final_release_done` | "Ver impacto" |
| `cancelled` | `status === 'Cancelled'` | "Reclamar reembolso" (donantes) |
| `expired` | `timestamp > deadline && !initial_release_done` | "Reclamar reembolso" (donantes) |
| `paused` | `vault.paused` | "Reclamar reembolso" (donantes) |

### 10.4. Wallets y Onboarding

- **Sin formulario de seed phrase**. Botón único: "Continuar con Google" (Blux) o "Continuar con email" (Accesly).
- **Sin "conecta tu wallet"**. La wallet se crea al primer uso con la auth elegida.
- **Sin "compra XLM"**. La plataforma patrocina los fees.
- **Sin "espera 5 confirmaciones"**. Stellar tiene finalidad en ~5 segundos.

---

## 11. Testing del Frontend

### 11.1. Smoke test en Testnet

```bash
# Read-only (funciona con CLI)
stellar contract invoke --id CC3B4UP4AXCW4IMJCDXIT3Y7CFW7QFTCJXPSHYNKLQEDFHZA76EFEWGS --network testnet -- get_fee_bps
stellar contract invoke --id CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK --network testnet -- get_authorized_router
stellar contract invoke --id CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK --network testnet -- get_admin
```

**Write operations**: usar el SDK desde Node.js o el frontend. El CLI no puede firmar por smart accounts (ver `known-limitations.md` → **E1** y `contracts/scripts/bootstrap.mjs` como referencia).

### 11.2. Escenarios de prueba obligatorios

Los 122 tests que ya pasaron cubren los contratos. Para el frontend, verificar:

1. **Registro + aprobación de fundación** (admin vía governance-account).
2. **Creación de campaña** (con `milestone_percentage` explícito) + **creación de vault** (con `verifier`).
3. **Donación individual** < target (no dispara liberación).
4. **Donación que alcanza el target** (dispara liberación del milestone configurado).
5. **Subida de evidencia** (fundación).
6. **Liberación final** (verifier con `expected_evidence`).
7. **Intento de bypass**: `vault.deposit` directo falla con `HostError: Error(Auth, ...)`.
8. **Refund**: crear campaña, donar, expirar/cancelar/pausar, reclamar refund.
9. **Pause**: admin pausa, deposit falla con `VaultPaused`, refund habilitado.
10. **TOCTOU**: cambiar `evidence_hash` entre revisión y release, verificar `InvalidEvidenceHash`.
11. **Admin rotation**: `propose_admin` + `accept_admin`.
12. **Verifier rotation**: `set_verifier_for_campaign` y verificar que el viejo verifier ya no puede liberar.
13. **Milestone custom**: crear campaña con `milestone_percentage = 30`, verificar que se libera 30% (no 50%).
14. **Fee quote**: verificar que `router.quote` devuelve el desglose correcto.

### 11.3. Mocks recomendados

- **RPC**: usar `@stellar/stellar-sdk` con el RPC de Testnet directamente. No mockear.
- **Wallet**: usar Blux o Accesly en modo testnet. Friendbot para fondear cuentas.
- **IPFS**: `nft.storage`, `Pinata`, o Irys. En test, CID dummy es aceptable. **Almacenamiento descentralizado no obigatorio, solo es sugerencia, se puede con Supabase**

---


## 12. Referencias

- [Stellar Docs — Submit a transaction to Stellar RPC using the JavaScript SDK](https://developers.stellar.org/docs/build/guides/transactions/submit-transaction-wait-js)
- [Stellar Docs — Signing Soroban contract invocations](https://developers.stellar.org/docs/build/guides/transactions/signing-soroban-invocations)
- Protocol 27: Soroban authorization migration
- [Blux](https://docs.blux.cc) (OAuth + smart accounts, demo activa)
- [Accesly](https://dorahacks.io/build/36779) (OAuth + account abstraction, SDF partner)
- [Smart Account Kit](https://github.com/stellar/smart-account-kit) (Passkeys, estándar oficial)
- [Passkey Kit](https://github.com/kalepail/passkey-kit) (Passkeys, comunidad, Archivado, deprecado)
- [Stellar Appkit](https://github.com/SagantaHQ/stellar-appkit) (independiente)
- [js-stellar-sdk](https://github.com/stellar/js-stellar-sdk) (recomendado por CLI 30)
- [Vaki](https://vaki.co/) (inspiración UX)
- [`known-limitations.md`](./known-limitations.md) (estado de cada limitación con badges H#/D#/E#/T#)
- [`events-reference.md`](./events-reference.md) (eventos on-chain)
