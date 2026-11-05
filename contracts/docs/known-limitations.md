# 🚧 Known Limitations — Thriving Stellar Contracts (MVP)

Este documento registra las limitaciones conocidas de la capa de contratos del MVP de Thriving Stellar. Cada limitación incluye su impacto, la mitigación aplicada y el item de trabajo futuro que la resolverá.

**Última actualización**: Noviembre 2026 (MVP v0.1.0)

---

## L1. Cancelación post-vault: depósitos siguen aceptándose

**Descripción**: Una vez creado el vault de una campaña, si la fundación cancela la campaña en `campaign-registry`, el vault **no lo detecta** y sigue aceptando depósitos hasta que se cumple `deadline`.

**Causa**: El vault cachea `target_amount`, `deadline` y `token_address` al crear el vault para evitar cross-contract calls en el hot-path. No consulta el estado actual de la campaña en cada `deposit`.

**Impacto**: **Medio**. Un donante podría depositar a una campaña que ya fue cancelada, y los fondos quedarían atrapados en el vault hasta que el admin decida cómo proceder.

**Mitigación aplicada**:
- El frontend **debe** consultar `campaign-registry.get_campaign(campaign_id).status` antes de mostrar el botón de donación.
- Documentado en el NatSpec de `deposit` y en el README de contracts.

**Trabajo futuro**: Añadir una cross-call a `campaign-registry.get_campaign` al inicio de `deposit` cuando el costo de CPU sea aceptable. Alternativa: implementar un evento `CampaignCancelled` que el vault escuche (requiere un indexer off-chain).

**Ticket**: `THRIV-XXX` (pendiente de crear)

---

## L2. Sobrescritura intencional de evidencia

**Descripción**: La fundación puede llamar `submit_evidence` múltiples veces antes del `release_final`. Cada llamada **sobrescribe** el `evidence_hash` anterior con el nuevo.

**Causa**: Comportamiento intencional. Permite a la fundación corregir errores en la evidencia (foto borrosa, factura equivocada) sin requerir intervención del admin.

**Impacto**: **Bajo**. Documentado como feature.

**Mitigación aplicada**:
- Test `test_submit_evidence_overwrites_previous` valida el comportamiento.
- Documentado en el NatSpec de `submit_evidence`.

**Trabajo futuro**: Si se requiere historial completo de evidencia, añadir un `Vec<Bytes>` que acumule todos los hashes en lugar de un solo `Option<Bytes>`.

---

## L3. Dust en montos pequeños

**Descripción**: Para `target_amount < 2` y `DEFAULT_MILESTONE_PERCENTAGE = 50`, el cálculo `(target_amount * 50) / 100` produce `0` por división entera. La fundación recibe el 0% al alcanzar el target y el 100% en `release_final`.

**Causa**: División entera en la liberación inicial.

**Impacto**: **Bajo**. Solo afecta campañas con montos en unidades mínimas (e.g., `target_amount = 1`), lo cual es irrelevante para stablecoins con 6-7 decimales.

**Mitigación aplicada**:
- Documentado en el NatSpec de `DEFAULT_MILESTONE_PERCENTAGE`.
- Los montos reales de campañas (miles o millones de COP) no se ven afectados.

**Trabajo futuro**: Ninguno planificado. El comportamiento es matemáticamente correcto.

---

## L4. Sin refund si la campaña se cancela

**Descripción**: Si una campaña se cancela después de recibir donaciones, los fondos quedan en el vault. **No hay un mecanismo automático de refund** a los donantes.

**Causa**: Implementar refunds individuales requiere tracking de todos los donantes (con sus montos), lo cual no es viable en el MVP por costo de storage y complejidad.

**Impacto**: **Medio**. Un donante no puede recuperar su contribución si la campaña se cancela.

**Mitigación aplicada**:
- Documentado como "fuera de scope del MVP".
- El admin puede decidir el destino de los fondos (e.g., transferirlos manualmente, redirigirlos a otra campaña).

**Trabajo futuro**: Diseñar un contrato auxiliar `campaign-refund` que:
1. Reciba del vault los fondos de campañas canceladas.
2. Consulte una lista de donantes (registrada por el vault en un `Vec<(Address, i128)>`).
3. Permita a cada donante reclamar su refund proporcional.

**Alternativa más simple**: usar `Merkle Tree` para registrar hashes de donantes y permitir claims verificables on-chain sin almacenar el `Vec` completo.

**Ticket**: `THRIV-YYY` (pendiente de crear)

---

## L5. `authorized_router = None` por defecto en Testnet

**Descripción**: El `campaign-vault` arranca en modo abierto (`authorized_router = None`). En este modo, cualquier address puede llamar `deposit` directamente, **sin pagar el fee de plataforma** del `donation-router`.

**Causa**: Decisión intencional para facilitar demos y tests sin requerir la configuración del router.

**Impacto**: **Bajo** en Testnet (fee = 0 por defecto). **Crítico** en Mainnet si se olvida activar.

**Mitigación aplicada**:
- Documentado en el README de contracts (`§5. Modelo de Fee y Bypass del Router`).
- Checklist de deploy a Mainnet incluye `set_authorized_router(admin, Some(router_address))` como paso obligatorio.

**Trabajo futuro**: Añadir un `require` en el constructor del `campaign-vault` que exija `authorized_router = Some(...)` si el fee del router es `> 0`. Sin embargo, esto acoplaría el vault al router, lo cual va contra el principio de "modo abierto para demos". La decisión de activarlo debe ser explícita del admin.

**Verificación pre-Mainnet**:
```bash
stellar contract invoke \
  --id <VAULT_CONTRACT_ID> \
  --fn get_authorized_router
# Debe devolver Some(<ROUTER_CONTRACT_ID>), no None.
```

---

## L6. `mock_all_auths` en tests unitarios

**Descripción**: La mayoría de los tests unitarios usan `env.mock_all_auths()`, lo cual hace que cualquier `require_auth()` pase sin verificar firmas.

**Causa**: Simplifica la escritura de tests funcionales (no hay que simular firmas para cada actor).

**Impacto**: **Bajo en tests, nulo en producción**. El código de producción sí tiene `require_auth()` y sí valida firmas.

**Mitigación aplicada**:
- Los 3 tests de bypass del router usan `env.mock_auths` con autorización específica (donor solo, sin router), validando que el bypass falla.
- Los tests de `nonprofit-registry` y `campaign-registry` validan las comparaciones manuales (`admin == stored_admin`, `campaign.nonprofit != nonprofit`) que son las barreras reales en los tests.

**Trabajo futuro**: Migrar progresivamente a `env.mock_auths` específicos para cada test. Prioridad baja.

---

## L7. Fee máximo del 10%

**Descripción**: El `donation-router` limita el fee a `MAX_FEE_BPS = 1000` (10% hard cap).

**Causa**: Previene que un admin comprometido o malicioso pueda extraer un porcentaje abusivo de las donaciones.

**Impacto**: **Bajo**. El 10% es holgadamente superior a cualquier fee razonable (Vaki cobra ~2-3%).

**Mitigación aplicada**:
- Test `test_update_fee_bps_exceeds_max` valida el rechazo de `fee_bps > 1000`.
- Documentado en `thriving-types::MAX_FEE_BPS`.

**Trabajo futuro**: Considerar si el cap debe ser más bajo (e.g., 5%) o si debe requerir un timelock para cambios. Decisión post-MVP.

---

## Deuda técnica

| ID | Limitación | Severidad | Bloqueante Mainnet | Prioridad |
| :--- | :--- | :--- | :--- | :--- |
| L1 | Cancelación post-vault | Media | No | Alta |
| L2 | Sobrescritura de evidencia | Baja | No | Nula (feature) |
| L3 | Dust en montos pequeños | Baja | No | Nula |
| L4 | Sin refund en cancelación | Media | No (MVP) | Media |
| L5 | `authorized_router = None` por defecto | Alta (si se olvida) | **Sí** | Crítica |
| L6 | `mock_all_auths` en tests | Baja (test-only) | No | Baja |
| L7 | Cap del 10% | Baja | No | Baja |

**Bloqueantes para Mainnet**: solo L5 (configuración de `authorized_router`). Todas las demás son documentables y aceptables para el MVP. 
