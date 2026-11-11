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
| 1 | **Governance Account** | [`CCQ2VQX3QXE6OXXTVN77XTLKMWFUKW7HJAENIPEELVRIU7JSI2TT47BD`](https://stellar.expert/explorer/testnet/contract/CCQ2VQX3QXE6OXXTVN77XTLKMWFUKW7HJAENIPEELVRIU7JSI2TT47BD) | `f9d3c4d01aa062bb2dfaa36c5f2f7c8a0416e329ab02e5616f9a1c97f63787ee` | Smart account multisig Ed25519. Admin del protocolo. |
| 2 | **Nonprofit Registry** | [`CAVXPFUWBQ3NCYFIP5TRPMHIOPVFU6QL6GKVHQDG5LAQVNRN6NIONKCY`](https://stellar.expert/explorer/testnet/contract/CAVXPFUWBQ3NCYFIP5TRPMHIOPVFU6QL6GKVHQDG5LAQVNRN6NIONKCY) | `36af4bd93b64e089e26a9c77708c22c5c18f8b4f67847d07df016bbf34df91db` | Registro y aprobación de fundaciones. |
| 3 | **Campaign Registry** | [`CDMODZCKIUJDWFYKB3M3CI3MMUY6GXNENNRSM7EWKHHWLEP4IHFPT4VC`](https://stellar.expert/explorer/testnet/contract/CDMODZCKIUJDWFYKB3M3CI3MMUY6GXNENNRSM7EWKHHWLEP4IHFPT4VC) | `123719ea649069783c0ee396ee505042ee22e076f240d3a69e1881aa8cad0ea9` | Metadatos de campañas. Valida contra el registro de nonprofits. |
| 4 | **Campaign Vault** | [`CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK`](https://stellar.expert/explorer/testnet/contract/CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK) | `f70947093aee0ba6e07b29dafaf9ee829124048e0a3eac3648e0d1585c558873` | Custodia de fondos y liberación por hitos. |
| 5 | **Donation Router** | [`CC3B4UP4AXCW4IMJCDXIT3Y7CFW7QFTCJXPSHYNKLQEDFHZA76EFEWGS`](https://stellar.expert/explorer/testnet/contract/CC3B4UP4AXCW4IMJCDXIT3Y7CFW7QFTCJXPSHYNKLQEDFHZA76EFEWGS) | `9517dcf6f5ad9b0e76a9515e375f14c01c0ccb693d4a626130c77db5eb573780` | Punto de entrada único con fee de plataforma. |


### 📄 Archivo `.env.testnet.example`


```bash
# Bitajón contracts — deployed 2026-11-11T13:46:58.222Z
# Network: testnet
# Source: deployer (GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5)
# Treasury: GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5
# Fee: 0 bps

GOVERNANCE_ID=CCQ2VQX3QXE6OXXTVN77XTLKMWFUKW7HJAENIPEELVRIU7JSI2TT47BD
NP_ID=CAVXPFUWBQ3NCYFIP5TRPMHIOPVFU6QL6GKVHQDG5LAQVNRN6NIONKCY
CR_ID=CDMODZCKIUJDWFYKB3M3CI3MMUY6GXNENNRSM7EWKHHWLEP4IHFPT4VC
CV_ID=CBELZBFWB34SBDC6BUXD5MFG7KQBVC4L6K6HE7QJBPL72L3OTR4RO5XK
DR_ID=CC3B4UP4AXCW4IMJCDXIT3Y7CFW7QFTCJXPSHYNKLQEDFHZA76EFEWGS

TREASURY=GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5
FEE_BPS=0
AUTHORIZED_ROUTER_CONFIGURED=yes
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
