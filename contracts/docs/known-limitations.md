# 🚧 Known Limitations — Bitajón Contracts

Este documento registra el estado de cada limitación conocida en la capa de contratos de **Bitajón**. Cada entrada responde explícitamente: **qué es**, **por qué existe**, **qué hicimos** y **por qué no se resolvió del todo** (o por qué no es una limitación real, sino una decisión de diseño).

**Última actualización**: Noviembre 2026 (v0.2.0 — Production-ready Testnet)

> **Nota sobre versionado**: v0.1.0 fue el MVP inicial. v0.2.0 incorpora las correcciones H1-H7 del feedback técnico, el contrato `governance-account`, el bypass del fee cerrado vía `authorized_router`, y la migración de scripts bash a `bootstrap.mjs`.

---

## 🧭 Taxonomía

Cada entrada del documento lleva uno de estos badges:

| Badge | Significado |
| :--- | :--- |
| ✅ **Resuelta** | Era una limitación real, fue eliminada en v0.2.0. |
| 🟡 **Mitigada** | Sigue existiendo, pero su impacto está acotado por un control compensatorio. |
| 🔵 **Decisión de diseño** | No es una limitación: es una elección deliberada con trade-offs conocidos. |
| ⚙️ **Restricción externa** | Depende de tooling del ecosistema (CLI, SDK). No está en nuestro control. |
| 🔴 **Bloqueante Mainnet** | Debe cerrarse (o aceptarse por escrito) antes de Mainnet. |

---

## 📊 Resumen Ejecutivo

| ID | Nombre | Badge | Bloqueante Mainnet |
| :--- | :--- | :--- | :--- |
| **H1** | Refunds en campañas sin meta | ✅ Resuelta | — |
| **H2** | Milestone personalizado ignorado | ✅ Resuelta | — |
| **H3** | TOCTOU en validación de evidencia | ✅ Resuelta | — |
| **H4** | Sin freno de emergencia | ✅ Resuelta | — |
| **H5** | Admin centralizado | 🟡 Mitigada | 🔴 (2-of-3 obligatorio) |
| **H6** | Datos sensibles on-chain | ✅ Resuelta | — |
| **H7** | Inconsistencias técnicas | ✅ Resuelta | — |
| **D1** | Cancelación post-vault | 🟡 Mitigada | No |
| **D2** | Sobrescritura de evidencia | 🔵 Decisión | No |
| **D3** | Refunds solo pull | 🔵 Decisión | No |
| **D4** | Cap 90% en milestone | 🔵 Decisión | No |
| **D5** | `authorized_router = None` por defecto | 🔵 Decisión + checklist | 🔴 (activar) |
| **D6** | Cap 10% en fee | 🔵 Decisión | No |
| **D7** | Sin Wasm upgrade path | 🔵 Decisión | 🔴 (aceptar por escrito) |
| **D8** | Email no recuperable on-chain | 🔵 Decisión | No |
| **E1** | CLI no firma por smart accounts | ⚙️ Externa | No |
| **E2** | `governance-account` usa pubkeys | ⚙️ Externa | No |
| **T1** | `mock_all_auths` en tests | 🟡 Mitigada (testing) | No |
| **T2** | Dust en montos pequeños | 🔵 Decisión (matemática) | No |

**Bloqueantes Mainnet**: **H5** (multisig 2-of-3), **D5** (activar `authorized_router`), **D7** (aceptar explícitamente la inmutabilidad del Wasm).

---

## ✅ Resueltas (6)

Limitaciones del MVP v0.1.0 que fueron eliminadas en v0.2.0.

### H1. Refunds en campañas que no alcanzan la meta — ✅ Resuelta

**Síntoma original**: si el `deadline` pasaba sin alcanzar `target_amount`, o la campaña se cancelaba antes de la liberación inicial, los fondos quedaban atrapados para siempre.

**Resolución**:
- `campaign-vault.claim_refund(campaign_id, donor)` permite a cada donante reclamar su contribución neta cuando la campaña expiró, fue cancelada, o el vault está pausado.
- Contribuciones rastreadas por `(campaign_id, donor)` en storage persistente (O(1) por donante).
- CEI estricto: la contribución se pone a cero **antes** de la transferencia.
- Errores nuevos: `RefundNotAvailable` (#27), `NothingToRefund` (#28).
- Evento nuevo: `RefundClaimed`.

**Tests**: 6 tests cubren expiry, cancel, pause, active-block, post-release-block, double-claim.

---

### H2. Milestone personalizado ignorado — ✅ Resuelta

**Síntoma original**: `campaign-registry` guardaba `milestone_percentage` pero `campaign-vault` siempre usaba el default de 50%.

**Resolución**:
- `VaultState.milestone_percentage` se cachea al crear el vault.
- Se usa en `deposit` (liberación inicial) y `release_final` (balance restante).
- **Sin default implícito**: el valor es obligatorio por campaña, en el rango `1..=90`.

**Por qué el cap de 90%** (esto es lo que hace que H2 y D4 estén relacionados): un milestone de 100% convertiría la revisión de evidencia en un paso simbólico sin peso financiero. El cap de 90% garantiza que al menos 10% del `target_amount` siempre quede atado a evidencia. Ver D4 para el análisis completo.

**Tests**: `test_custom_milestone_30_percent`, `test_custom_milestone_percentage_respected`, y boundary tests de 1/90/91/100 en `campaign-registry`.

---

### H3. TOCTOU entre revisión y liberación de evidencia — ✅ Resuelta

**Síntoma original**: `release_final(campaign_id, admin)` liberaba contra la evidencia actual, no contra la que el admin revisó. La fundación podía cambiar el `evidence_hash` entre la revisión y la firma.

**Resolución**:
- `release_final(campaign_id, verifier, expected_evidence)` recibe el hash esperado.
- Si `state.evidence_hash != Some(expected_evidence)` → `InvalidEvidenceHash` (#29).
- Distingue `EvidenceNotSubmitted` (#8) de `InvalidEvidenceHash` (#29), permitiendo UX diferenciada.

**Tests**: `test_release_final_rejects_wrong_evidence`, `test_final_release_without_evidence`.

---

### H4. Sin freno de emergencia — ✅ Resuelta

**Síntoma original**: si una fundación era revocada o comprometida, sus vaults abiertas seguían aceptando depósitos y liberando el 50%.

**Resolución**:
- `pause_vault(admin, campaign_id)` bloquea depósitos con `VaultPaused` (#32) y habilita `claim_refund` sin esperar expiración.
- `unpause_vault(admin, campaign_id)` restaura el comportamiento normal.
- Eventos nuevos: `VaultPaused`, `VaultUnpaused`.

**Tests**: 4 tests cubren pausa, despausa, no-admin, y claim_refund cuando pausado.

---

### H6. Datos sensibles on-chain — ✅ Resuelta

**Síntoma original**: `NonprofitProfile` almacenaba `email: String` en claro, violando Ley 1581 de 2012 (Habeas Data Colombia).

**Resolución**:
- `email_hash: Bytes` (SHA-256) en lugar de `email: String`.
- `rut_hash: Bytes` (SHA-256) en lugar del RUT.
- Los datos reales viven off-chain; solo el hash es on-chain.

**Trade-off aceptado**: el email no es recuperable desde el hash. Ver D8.

---

### H7. Inconsistencias técnicas — ✅ Resuelta

**Síntomas originales** (feedback técnico):
1. `nonprofit-registry` no extendía TTL de instancia en mutaciones ni de perfil en lecturas.
2. El comentario de cabecera del `donation-router` decía "Not implemented in the MVP" para el bypass (ya implementado).
3. El test del bypass usaba `#[should_panic]` genérico, no `#[should_panic(expected = "HostError")]`.

**Resolución**:
1. `nonprofit-registry` extiende TTL de instancia y perfil en todas las entry points.
2. Comentario del `donation-router` corregido.
3. Test del bypass usa `expected = "HostError"`, previniendo que pase por razones no relacionadas.

---

## 🟡 Mitigadas (2)

Siguen existiendo, pero su impacto está acotado por un control compensatorio.

### H5. Admin centralizado — 🟡 Mitigada (🔴 bloqueante Mainnet)

**Descripción**: en el MVP original, una sola cuenta admin aprobaba fundaciones, validaba evidencia, configuraba el router y fijaba el fee. Sin multisig, un solo compromiso comprometía todo el protocolo.

**Mitigación aplicada**: contrato `governance-account` (multisig M-de-N con firmas Ed25519). Todos los contratos aceptan `Address` como admin, por lo que un `governance-account` puede ser el admin sin cambios.

**Estado actual en Testnet**: `[deployer]` con `threshold = 1`. Funcionalmente equivalente a una EOA, pero con el flujo multisig ya probado. Escalar a 2-de-3 es `add_signer` + `update_threshold`, sin redeploy.

**¿Por qué no se resolvió del todo en Testnet?**: porque necesitábamos flexibilidad operativa durante el desarrollo. Cambiar el threshold a cada rato con 2-de-3 firmas por operación ralentiza drásticamente el debugging. Se decidió priorizar velocidad de iteración y dejar la escalada para el sprint pre-Mainnet.

**Trabajo obligatorio antes de Mainnet**:
1. Agregar al menos 2 signers adicionales (fundador + advisor + tercero).
2. Subir `threshold` a `>= 2`.
3. Probar el flow de aprobación end-to-end con 2 firmas.
4. Documentar en el README raíz quiénes son los signers y cuál es el threshold.

**Verificación pre-Mainnet**:
```bash
stellar contract invoke --id $GOVERNANCE_ID --network testnet -- get_threshold
# Debe devolver >= 2, no 1.
stellar contract invoke --id $GOVERNANCE_ID --network testnet -- get_signers
# Debe devolver al menos 3 pubkeys, no 1.
```

---

### D1. Cancelación post-vault: depósitos siguen aceptándose hasta `deadline` — 🟡 Mitigada

**Descripción**: una vez creado el vault, si la fundación cancela la campaña en `campaign-registry`, el vault **no lo detecta** y sigue aceptando depósitos hasta `deadline`.

**Causa técnica**: el vault cachea `target_amount`, `deadline`, `token_address` y `milestone_percentage` al crear el vault, para evitar cross-calls en el hot-path (`deposit`).

**Impacto**: un donante podría depositar a una campaña cancelada. Los fondos **no se pierden** porque `claim_refund` está disponible.

**Mitigación aplicada**:
- `claim_refund` funciona en cuanto la campaña se cancela (no requiere esperar `deadline`).
- El frontend **debe** consultar `campaign-registry.get_campaign(campaign_id).status` antes de mostrar el botón de donación.

**¿Por qué no se resolvió del todo?**: porque añadir una cross-call a `campaign-registry` en cada `deposit` agrega **~50k-100k instrucciones de CPU por transacción**. En el hot-path (la operación más frecuente del protocolo), eso se traduce en fee más alto para cada donante. Se evaluó que el costo de esa verificación en cada depósito supera el beneficio, dado que `claim_refund` ya cubre el caso residual.

**Si se quisiera resolver**: añadir la cross-call y aceptar el costo de CPU. Alternativa más eficiente: emitir un evento `CampaignCancelled` desde el registry y que un indexer off-chain actualice el frontend en tiempo real. El contrato en sí nunca se enteraría.

---

## 🔵 Decisiones de diseño (7)

No son limitaciones: son elecciones deliberadas con trade-offs documentados.

### D2. Sobrescritura de evidencia — 🔵 Decisión

**Descripción**: la fundación puede llamar `submit_evidence` múltiples veces antes de `release_final`. Cada llamada sobrescribe el `evidence_hash` anterior.

**Por qué es un feature, no un bug**: las fundaciones necesitan poder corregir errores en la evidencia (foto borrosa, factura equivocada) sin depender de intervención del admin.

**Protección**: la sobrescritura está acotada por el TOCTOU fix de H3. Si la fundación cambia la evidencia entre la revisión y la firma del verifier, `release_final` falla con `InvalidEvidenceHash`.

**Si se quisiera resolver (historial completo)**: cambiar `Option<Bytes>` por `Vec<Bytes>` en `VaultState`. Aumenta el costo de storage por cada `submit_evidence`. No prioritario para el MVP.

---

### D3. Refunds solo pull (no push) — 🔵 Decisión

**Descripción**: los refunds son pull-based. Cada donante llama `claim_refund` individualmente. No hay función `refund_all` que itere sobre todos los donantes en una sola transacción.

**Por qué**: los refunds push tienen costo O(n) por número de donantes. Los pull tienen costo O(1) por donante. Para una campaña con 500 donantes, un `refund_all` sería prohibitivamente caro en CPU/storage.

**Impacto**: un donante que nunca llama `claim_refund` deja su aporte en el vault. Los fondos siguen siendo recuperables en cualquier momento.

**Mitigación**: el frontend debe mostrar un botón "Reclamar reembolso" prominente en el dashboard del donante.

**Si se quisiera resolver (batch)**: contrato auxiliar `batch-operations` que permita `claim_refund` para múltiples campañas en una sola transacción. No bloqueante (GoFundMe/Vaki tampoco lo tienen).

---

### D4. Cap del 90% en `milestone_percentage` — 🔵 Decisión

**Descripción**: `milestone_percentage` debe estar en `1..=90`. El 90% es un cap duro, no un default.

**Por qué**: la propuesta de valor del protocolo es "Payment by Progress". Debe quedar al menos 10% del `target_amount` atado a la validación de evidencia. Un milestone de 100% convertiría la revisión en un paso simbólico sin peso financiero.

**Impacto**: las campañas que quieran máxima presión sobre la evidencia pueden usar `milestone_percentage = 1` (la fundación recibe 1% al alcanzar la meta, 99% tras validar evidencia).

**Decisión de UX**: el frontend sugiere `RECOMMENDED_MILESTONE_PERCENTAGE = 50` como punto de partida. El usuario puede cambiarlo.

**Si se quisiera resolver (permitir 100%)**: rompería el modelo de negocio. No es una limitación, es la razón por la que el protocolo existe.

---

### D5. `authorized_router = None` por defecto — 🔵 Decisión + Checklist

**Descripción**: el `campaign-vault` arranca en modo abierto. Cualquier address puede llamar `deposit` directamente, sin pagar el fee del `donation-router`.

**Por qué**: el modo abierto es necesario para demos y tests donde no se quiere configurar el router primero. En Mainnet, el fee debe estar protegido siempre.

**Impacto**:
- Testnet (fee = 0): **Bajo**. No hay fee que saltar.
- Mainnet (fee > 0): **Crítico**. Sin `authorized_router`, el fee es evadible.

**Mitigación aplicada**:
- `bootstrap.mjs` configura `authorized_router` en la misma pasada del deploy.
- `extend-ttl.sh` imprime un warning si `AUTHORIZED_ROUTER_CONFIGURED != yes`.
- Checklist pre-Mainnet en el README de contracts.

**Si se quisiera resolver (hacerlo obligatorio en constructor)**: acoplaría el vault al router desde el constructor. Rompería el flujo de "modo abierto para demos". Se decidió que el admin lo active explícitamente.

**Verificación pre-Mainnet**:
```bash
stellar contract invoke --id $CV_ID --network testnet -- get_authorized_router
# Debe devolver Some(<DR_ID>), no None.
```

---

### D6. Cap del 10% en el fee de plataforma — 🔵 Decisión

**Descripción**: el `donation-router` limita `fee_bps <= MAX_FEE_BPS = 1000` (10%).

**Por qué**: previene que un admin comprometido extraiga un porcentaje abusivo de las donaciones. Es una garantía de seguridad hacia los donantes.

**Impacto**: el 10% es holgadamente superior a cualquier fee razonable (Vaki cobra ~2-3%). Ningún caso de uso real se ve limitado.

**Si se quisiera resolver (subir el cap)**: debilitaría la garantía. Se decidió que un cap duro del 10% es defendible ante cualquier auditoría o regulador.

---

### D7. Sin Wasm upgrade path — 🔵 Decisión (🔴 aceptación explícita requerida)

**Descripción**: los contratos no tienen función `upgrade`. El Wasm es inmutable después del deploy.

**Por qué**: "las reglas no cambian después del deploy" da máxima confianza a los donantes. Un admin comprometido no puede alterar la lógica del contrato. Es una postura cypherpunk que refuerza la propuesta de valor.

**Impacto**: si hay un bug crítico, hay que redesplegar el contrato y migrar estado (o perderlo). No hay rollback.

**Mitigación**: test coverage extenso (122 tests) y snapshots diferenciales que detectan cambios no intencionados en el comportamiento. Deploy reproducible vía `bootstrap.mjs`.

**Si se quisiera resolver (upgrade path)**: implementar `upgrade(new_wasm_hash)` con timelock de 48h. Es lo que usan protocolos grandes (Uniswap, Aave). Requiere decisión explícita del equipo antes de Mainnet.

**Estado**: la decisión de aceptar la inmutabilidad del Wasm **debe quedar por escrito** antes de Mainnet. No es un "fallo", es una postura. Pero debe ser una postura explícita, no un olvido.

---

### D8. Email no recuperable on-chain — 🔵 Decisión

**Descripción**: el contrato almacena `email_hash` (SHA-256), no el email. No es posible recuperar el email de una fundación consultando el contrato.

**Por qué**: privacidad (Ley 1581). Si el dato estuviera on-chain en claro, sería público para siempre y no podría eliminarse (violando el derecho al olvido).

**Impacto**: el frontend debe mantener un índice off-chain (Supabase, IPFS) que mapee `address → email`. La fundación lo provee al registrarse.

**Mitigación**: documentado en el NatSpec de `NonprofitProfile` y en la guía del frontend.

**Si se quisiera resolver (recuperar email on-chain)**: violaría la ley. No es una opción.

---

## ⚙️ Restricciones externas (2)

Dependen de tooling del ecosistema. No está en nuestro control.

### E1. `stellar contract invoke` no puede firmar por smart accounts

**Descripción**: el CLI no puede construir auth entries V2 con firmas Ed25519 para un smart account (`C...`). Las operaciones de admin (aprobar fundación, configurar router, etc.) que requieran firma del `governance-account` fallan con `Contract addresses are not supported to sign auth entries`.

**Causa**: limitación del CLI 30.0.1. El CLI asume que el auth entry se firma por una `G...` con `require_auth()` clásico, y no sabe cómo embeber las firmas Ed25519 de un smart account en un `ScVal::Vec([ScVal::Map({ public_key, signature })])`.

**Impacto**: bloquea operaciones manuales de admin por CLI.

**Mitigación**:
- `bootstrap.mjs` implementa el flujo completo con `@stellar/stellar-sdk` (construye el `SorobanAuthorizationEntry` a mano, con la preimagen CAP-71 correcta y el bump de instrucciones).
- Para operaciones puntuales de admin, usar el mismo patrón que `bootstrap.mjs` o el frontend con `@stellar/stellar-sdk`.
- Los smoke tests read-only (`get_admin`, `get_authorized_router`, `get_fee_bps`) sí funcionan por CLI.

**Si se quisiera resolver**: cuando el CLI soporte smart accounts, simplificar `bootstrap.mjs`. Mientras tanto, el script es la referencia canónica para el frontend.

---

### E2. `governance-account` usa pubkeys Ed25519, no Addresses

**Descripción**: los signers del `governance-account` son `BytesN<32>` (pubkeys Ed25519), no `Address`.

**Causa**: `require_auth()` sobre una dirección `G...` requiere que esa dirección aparezca como su propio auth entry en la transacción, lo cual el SDK no puede construir para flujos anidados de smart accounts. La verificación Ed25519 directa con `env.crypto().ed25519_verify()` funciona con un solo auth entry sobre el `governance-account`.

**Impacto**: el cliente (frontend o `bootstrap.mjs`) debe construir el `SorobanAuthorizationEntry` a mano:
1. Calcular el `signature_payload` como `sha256(XDR(HashIdPreimageSorobanAuthorizationWithAddress{ networkId, nonce, signatureExpirationLedger, address, invocation }))` (envelope type 10, CAP-71).
2. Firmar el payload con cada signer privado.
3. Construir `ScVal::Vec([ScVal::Map({ public_key, signature }), ...])`.
4. Setear `signatureExpirationLedger = currentLedger + 100` (~8 minutos).
5. Bumpear el `instruction limit` en el `SorobanTransactionData` (~2M instrucciones extra para un signer).

**Mitigación**: `scripts/bootstrap.mjs` implementa los 5 puntos correctamente y sirve de referencia para el frontend. El contrato expone `verify_signatures(payload, proofs)` como helper read-only para pre-checkear un proof set antes de construir el auth entry.

**Si se quisiera resolver (Address en lugar de pubkeys)**: requiere que el SDK/CLI soporten delegación de auth (CAP-71) de forma ergonómica. Fuera de nuestro control.

---

## 🟡 Testing notes (2)

### T1. `mock_all_auths` en la mayoría de los tests — 🟡 Mitigada

**Descripción**: los tests funcionales usan `env.mock_all_auths()`, que bypassa el dispatch de auth del host.

**Causa**: simplifica la escritura de tests funcionales.

**Impacto**: **Bajo en tests, nulo en producción**. El código de producción tiene `require_auth()` y valida firmas.

**Mitigación**:
- `governance-account` tiene 9 tests en `tests/auth_flow.rs` que **SÍ verifican firmas Ed25519 reales** (con `ed25519-dalek`). El contrato más crítico está cubierto.
- El test del bypass del router usa `env.mock_auths` con autorización específica (donor solo, sin router).

**Si se quisiera resolver (migrar todos los tests)**: costo alto (reescribir 60+ tests), beneficio bajo (los paths críticos ya están cubiertos). Prioridad baja.

---

### T2. Dust en montos muy pequeños — 🔵 Decisión (matemática)

**Descripción**: para `target_amount` muy pequeño y `milestone_percentage` bajo, la división entera en `(target_amount * milestone_percentage) / 100` puede truncar la liberación inicial a cero.

**Causa**: división entera, inherente a la aritmética de Soroban.

**Impacto**: **Bajo**. Solo afecta campañas con montos en unidades mínimas. Irrelevante para stablecoins con 6-7 decimales y campañas reales (miles o millones de COP).

**Si se quisiera resolver**: no se puede. La matemática de enteros no admite fracciones. Documentado en el NatSpec del campo `milestone_percentage`.

---

## 🔴 Checklist pre-Mainnet

Antes de cualquier deploy a Mainnet, todos estos puntos deben estar cerrados o aceptados por escrito por el equipo.

### Contratos

- [ ] **H5**: `governance-account` con `>= 2` signers y `threshold >= 2`.
- [ ] **H5**: probado el flow de aprobación end-to-end con 2 firmas.
- [ ] **D5**: `authorized_router = Some(<DR_ID>)` en el `campaign-vault`.
- [ ] **D7**: aceptada por escrito la decisión de no implementar Wasm upgrade path.
- [ ] Todos los contratos recompilados con `stellar contract build` y verificados en Stellar Expert.
- [ ] Snapshots diferenciales al día (`cargo test && git diff --exit-code -- '*/test_snapshots/'`).

### Operativos

- [ ] Identidad del deployer en un KMS o hardware wallet (no en `~/.config/stellar/`).
- [ ] Los signers del `governance-account` son EOAs controladas por personas distintas (no todos del mismo equipo).
- [ ] Plan de incidentes documentado (¿qué pasa si se compromete un signer? ¿cómo se rota?).
- [ ] Fee inicial decidido (hoy 0 bps; ¿cuándo se activa y a qué valor?).

### Legales / cumplimiento

- [ ] Términos y condiciones revisados por abogado.
- [ ] Política de privacidad que explica el uso de hashes on-chain (Ley 1581).
- [ ] Contrato con el Anchor (VANK/Pollar) para on/off-ramps firmado.
- [ ] KYC/AML del Anchor cumple con los requisitos de la Superfinanciera.

### Comunicación

- [ ] README raíz actualizado con las direcciones de Mainnet.
- [ ] Página pública con los signers y el threshold (transparencia).
- [ ] Documentación de "qué pasa si la fundación cancela" en la FAQ pública.

---

## 🗓️ Roadmap de resolución (post-Demo)

| ID | Trabajo futuro | Sprint estimado | Prioridad |
| :--- | :--- | :--- | :--- |
| **H5** | Escalar a 2-of-3 y probar end-to-end | Pre-Mainnet | 🔴 Crítica |
| **D5** | Activación obligatoria en deploy | Pre-Mainnet | 🔴 Crítica |
| **D7** | Decisión por escrito del equipo | Pre-Mainnet | 🔴 Crítica |
| **D1** | Cross-call a `campaign-registry` en `deposit` (o indexer) | Post-Demo | 🟡 Media |
| **D3** | Contrato auxiliar `batch-operations` | Post-Demo | 🟡 Media |
| **E1** | Simplificar `bootstrap.mjs` cuando el CLI lo soporte | Post-Demo | 🟡 Media |
| **E2** | Migrar a `Address` con auth delegada (CAP-71) | Post-Mainnet | 🟢 Baja |
| **T1** | Migrar el resto de tests a `env.mock_auths` | Post-Mainnet | 🟢 Baja |

Las decisiones de diseño (D2, D4, D6, D8) y las limitaciones resueltas (H1-H4, H6, H7) no requieren trabajo futuro. El dust (T2) es inherente a la matemática.

---

## 🧠 Principio rector

Cada entrada de este documento responde a tres preguntas:

1. **¿Qué es?** → descripción concreta del comportamiento observable.
2. **¿Por qué existe?** → causa técnica, no excusa.
3. **¿Por qué no se resolvió?** → costo de resolverlo vs. beneficio. Si el costo (CPU, complejidad, riesgo, ilegalidad) supera el beneficio, es una decisión de diseño. Si el beneficio supera el costo, es una limitación pendiente.

Ninguna entrada está en la zona gris. Cada una tiene un badge claro y un rationale explícito. Si en el futuro cambia el contexto (Mainnet, nueva versión del SDK, feedback de usuarios), la clasificación se revisa y se actualiza.
