# Bitajón Stellar 🌱

[![Contracts CI](https://github.com/Bitajon/bitajon-stellar/actions/workflows/contracts-ci.yml/badge.svg)](https://github.com/Bitajon/bitajon-stellar/actions/workflows/contracts-ci.yml)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Testnet](https://img.shields.io/badge/Stellar-Testnet-blueviolet)](https://stellar.expert/explorer/testnet)

Implementación de la visión de **Bitajón** para el ecosistema de **Stellar** y **Soroban**. Este repositorio contiene la infraestructura descentralizada para permitir a fundaciones y ONG's recaudar donaciones con trazabilidad absoluta y validación de impacto real.

## 💡 El Modelo de Confianza (Hipótesis de Trabajo)

Nuestra visión técnica se aleja del asistencialismo tradicional y se acerca a los modelos de **"Pago por Avance"** (similares a los *Milestones* o los *Real World Assets*). Creemos que la confianza se construye demostrando resultados, no solo prometiendo intenciones.

El flujo lógico que buscaremos implementar en nuestros contratos inteligentes es el siguiente:

1.  **Donación:** El donante aporta a una campaña específica.
2.  **Custodia (Escrow):** Los fondos se bloquean en un contrato inteligente.
3.  **Evidencia:** El beneficiario/fundación debe subir evidencias del cumplimiento de cada hito (fotos, facturas, entregas).
4.  **Validación (Oráculo Humano):** Un auditor designado o el mismo donante valida la veracidad de la evidencia.
5.  **Liberación:** El contrato libera los fondos de manera programática y determinista al cumplirse la condición.

---

## 🌐 Estado del Despliegue (Testnet)

- **Fecha del despliegue**: Noviembre de 2026
- **Red**: Stellar Testnet (Protocolo 30 - Bell)
- **Estado**: ✅ 5 contratos desplegados y verificados on-chain
- **Fee de plataforma**: `0 bps` (0% — intencional para el demo)
- **Bypass del fee**: ✅ Cerrado (`authorized_router` configurado)
- **TTL**: ✅ Activo a largo plazo — extendido y verificado hasta ~**mediados de Diciembre de 2026** (5 Wasm + 5 instancias)

### 🔑 Cuenta de Despliegue y Administración

Todos los contratos comparten la misma cuenta como `admin`. Esta cuenta tiene autoridad para:

- Aprobar/revocar fundaciones en `nonprofit-registry`.
- Configurar el `authorized_router` en `campaign-vault`.
- Actualizar el `fee_bps` y `treasury` en `donation-router`.
- Añadir/quitar signers del `governance-account` (multisig Ed25519).

| Rol | Identidad CLI | Dirección Stellar |
| :--- | :--- | :--- |
| **Deployer + Admin** | `deployer` | [`GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5`](https://stellar.expert/explorer/testnet/account/GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5) |

> ⚠️ **Seguridad**: La clave privada es...

### 📋 Contratos Desplegados

| # | Contrato | Dirección (`C...`) | Wasm Hash | Propósito |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Governance Account** | [`CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U`](https://stellar.expert/explorer/testnet/contract/CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U) | `259e8476bac45df4af83137ba5a5ec7b2a1cb014e5e356f0db19f0f67de94398` | Smart account multisig Ed25519. Admin del protocolo. |
| 2 | **Nonprofit Registry** | [`CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2`](https://stellar.expert/explorer/testnet/contract/CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2) | `aa39e16c8ec4e0d2d6205fa422cdc22cd0ce2420aa78ac04d0f3b70ec80adc3a` | Registro y aprobación de fundaciones. |
| 3 | **Campaign Registry** | [`CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6`](https://stellar.expert/explorer/testnet/contract/CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6) | `eb89fa7428a0dce71fcab41a3b291726d1193df526224c300792b666f117fa56` | Metadatos de campañas. Valida contra el registro de nonprofits. |
| 4 | **Campaign Vault** | [`CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR`](https://stellar.expert/explorer/testnet/contract/CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR) | `4fdcff41afb7362ef8fe83c844fcbf329272d1f3341a5671592277af7873abc0` | Custodia de fondos y liberación por hitos. |
| 5 | **Donation Router** | [`CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67`](https://stellar.expert/explorer/testnet/contract/CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67) | `56d7d140709616ff9d62106775eb329e68d3296577c319636929bcddccbe5ecb` | Punto de entrada único con fee de plataforma. |


### 📄 Archivo `.env.testnet.example`

```bash
# Bitajón contracts — deployed 2026-11-11T16:38:28.982Z
# Network: testnet
# Source: deployer (GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5)
# Treasury: GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5
# Fee: 0 bps
# Mode: freshly deployed from release v0.2.1
# Deploy salt: 1794415004945-1a88f47d

GOVERNANCE_ID=CB5EDLYZ27U5JUNYCTLMANIMBV2WQ3DMXJV6AQJ7X43UYQ77EGX62X2U
NP_ID=CADYPVOA7SUTBVG5IICFNDHQKOXG7VLT6ANCNNOLNDKNFHFJWQ5N3RH2
CR_ID=CC5TYZBWM56HPTVBNUQYEX6VQBHU7ZOQGR2I3B42ZIGECQ3PWN6I7WJ6
CV_ID=CBX5Z2U67JYBI6OGGYMARJ5IT6TZS3TELIKGS2FJTODS4KSCC767HXWR
DR_ID=CCK57ZWLKAUEC6DJ2GV3WHMJMO3ERN4H7K44TS36AMJ2N3S7VOREGR67

# Metadata
TREASURY=GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5
FEE_BPS=0
AUTHORIZED_ROUTER_CONFIGURED=yes
DEPLOY_SALT=1794415004945-1a88f47d
```

> ⚠️ Este archivo **no se commitea** (`.gitignore`). Si necesitás regenerarlo, corré `bun run bootstrap` en `contracts/scripts/` (o el equivalente con npm/pnpm/yarn).

---

## 🚀 Quick Start

Para empezar a trabajar en este monorepo, clona el repositorio utilizando SSH (recomendado) o HTTPS:

**Vía SSH:**
```bash
git clone git@github.com:Bitajon/bitajon-stellar.git
cd bitajon-stellar
```

**Vía HTTPS:**
```bash
git clone https://github.com/Bitajon/bitajon-stellar.git
cd bitajon-stellar
```

---

## 🛠️ Guías de Desarrollo

Este es un **monorepo**, lo que significa que convivirán diferentes tecnologías. Actualmente, el desarrollo se centra en la capa de contratos inteligentes, con los bindings ya generados para el frontend.

### 📦 Contracts (Rust + Soroban)
La lógica de negocio (Escrow, Validación, Registro, Gobernanza) vive aquí. Estamos utilizando **Rust** y el **Soroban SDK** para Stellar.
*   **Prerrequisitos:** Rust `1.84+` (estable), target `wasm32v1-none`, y Stellar CLI `30.0.1`.
*   **Comandos básicos** (detalle completo en [`contracts/README.md`](./contracts/README.md)):
    *   `stellar contract build`
    *   `cargo test`

### 📦 Bindings (TypeScript)
Los clientes tipados para los **5 contratos** están en [`bindings/`](./bindings) (incluye `governance-account`). El equipo de frontend los importa como paquetes NPM locales.

### 💻 Frontend (Por definir)
La interfaz de usuario (UI/UX) está inspirada en plataformas como *Vaki* (enfoque en "hacer florecer la confianza"). El stack tecnológico (Next.js, Vite, etc.) será definido por el equipo de frontend.

---

## 🔄 CI/CD

Cada push o Pull Request a `main` dispara el workflow [**Contracts CI**](./.github/workflows/contracts-ci.yml), que verifica:

1.  ✅ Compilación exitosa de todos los contratos (`stellar contract build`).
2.  ✅ Ejecución de la suite de tests (`cargo test`).
3.  ✅ Sincronización de snapshots de pruebas (`git diff --exit-code -- '*/test_snapshots/'`).

Puedes ver el estado en tiempo real en la pestaña [**Actions**](https://github.com/Bitajon/bitajon-stellar/actions) del repositorio, o en el badge al inicio de este documento.

---

## 📝 Convención de Commits

Para mantener un historial limpio y automatizable, utilizamos estrictamente **[Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)** en inglés.

Ejemplos:
*   `feat(escrow): add release funds function`
*   `fix(registry): correct validation logic`
*   `chore: update gitignore`
*   `docs: update readme with trust model`

---
*Construyendo un futuro donde la transparencia y la tecnología se encuentran con la generosidad.*
