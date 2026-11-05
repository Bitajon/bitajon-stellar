# Thriving Stellar 🌱

[![Contracts CI](https://github.com/ThrivingHub/thriving-stellar/actions/workflows/contracts-ci.yml/badge.svg)](https://github.com/ThrivingHub/thriving-stellar/actions/workflows/contracts-ci.yml)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![Testnet](https://img.shields.io/badge/Stellar-Testnet-blueviolet)](https://stellar.expert/explorer/testnet)

Implementación de la visión de **ThrivingHub** para el ecosistema de **Stellar** y **Soroban**. Este repositorio contiene la infraestructura descentralizada para permitir a fundaciones y ONG's recaudar donaciones con trazabilidad absoluta y validación de impacto real.

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

**Fecha del despliegue**: Noviembre 2026
**Red**: Stellar Testnet (Protocolo 30 - Bell)
**Estado**: ✅ Desplegado y verificado on-chain
**Fee de plataforma**: `0 bps` (0% — intencional para el demo)
**Bypass del fee**: ✅ Cerrado (`authorized_router` activado)

### 🔑 Cuenta de Despliegue y Administración

Todos los contratos comparten la misma cuenta como `admin`. Esta cuenta tiene autoridad para:

- Aprobar/revocar fundaciones en `nonprofit-registry`.
- Configurar el `authorized_router` en `campaign-vault`.
- Actualizar el `fee_bps` y `treasury` en `donation-router`.

| Rol | Identidad CLI | Dirección Stellar |
| :--- | :--- | :--- |
| **Deployer + Admin** | `deployer` | `GCER47WZXN4AEDO7Y5SJYD4KVCXKABWQG2X5KLSPSAGOEGVDS4Y6BBW5` |

> ⚠️ **Seguridad**: La clave privada es...

### 📋 Contratos Desplegados

| # | Contrato | Dirección (`C...`) | Propósito |
| :--- | :--- | :--- | :--- |
| 1 | **Nonprofit Registry** | `CA5LHUGEJ4S6XJV5ZBCOOKIWAARGA7QSZERAAUM2NVWCXHDPRRSFT55K` | Registro y aprobación de fundaciones. |
| 2 | **Campaign Registry** | `CCZPWOKGTLT2UWLZEGYC55BPLR4GLZOUGCBVDXEEFSLE5QPVPMMU7EZR` | Metadatos de campañas. Valida contra el registro de nonprofits. |
| 3 | **Campaign Vault** | `CARMUNTRKKX6KA7ZXVMYVZVAZ5DLZF5B53V5K6J5OE3CMFYGB7FWCCTT` | Custodia de fondos y liberación por hitos (50/50). |
| 4 | **Donation Router** | `CAZ5WAOUTXF5E6OWZ6AAIPQVUXLAJKNUTC3RG266Q47WR2LD2WJSRLSD` | Punto de entrada único con fee de plataforma. |

### 🔗 Transacciones de Despliegue (stellar.expert)

Cada contrato tiene dos transacciones: la instalación del Wasm (upload) y el deploy con argumentos del constructor. Los links apuntan al deploy (el que importa para auditoría).

| Contrato | Wasm Hash | Tx de Deploy |
| :--- | :--- | :--- |
| **Nonprofit Registry** | `7376fe65dd8fa0611a2742a3cf4941c6a7dcc9b4578ac97c0f1b90c82a0703af` | [`138523ea...b1c7989`](https://stellar.expert/explorer/testnet/tx/138523eaeee800b82d5fd7704c0f0687f344d52257d1aa51fb7042635b1c7989) |
| **Campaign Registry** | `484493887c7b87e6be9436d9036a58142be1be6c13dac78ea0fd81b55b2e65e9` | [`b2bcc54a...680d8457`](https://stellar.expert/explorer/testnet/tx/b2bcc54a8527338842b1d922bcc0a9ff25ca60200279f0ac0b0b17b4680d8457) |
| **Campaign Vault** | `6ce4ac4e3c76a77f70e5c21b3550c1c5519505fca43b80e0739fbc13f68904d5` | [`b93a1906...036e2a`](https://stellar.expert/explorer/testnet/tx/b93a1906651782b0f242d9ccd97f97bcf1a5a701f7ca634e6e2a156aff036e2a) |
| **Donation Router** | `bbcc1dbd99e15112dffc1f66ee49e7ad3f19fb60ad4feb934ae1724d5d24c356` | [`9ff27e27...d90d46dd`](https://stellar.expert/explorer/testnet/tx/9ff27e271e31fd7c201c9de79821221c5de85f99c59522c48442c7a9d90d46dd) |


## 🚀 Quick Start

Para empezar a trabajar en este monorepo, clona el repositorio utilizando SSH (recomendado) o HTTPS:

**Vía SSH:**
```bash
git clone git@github.com:ThrivingHub/thriving-stellar.git
cd thriving-stellar
```

**Vía HTTPS:**
```bash
git clone https://github.com/ThrivingHub/thriving-stellar.git
cd thriving-stellar
```

---

## 🛠️ Guías de Desarrollo

Este es un **monorepo**, lo que significa que convivirán diferentes tecnologías. Actualmente, el desarrollo se centra en la capa de contratos inteligentes, con los bindings ya generados para el frontend.

### 📦 Contracts (Rust + Soroban)
La lógica de negocio (Escrow, Validación, Registro) vive aquí. Estamos utilizando **Rust** y el **Soroban SDK** para Stellar.
*   **Prerrequisitos:** Rust `1.84+` (estable), target `wasm32v1-none`, y Stellar CLI `30.0.1`.
*   **Comandos básicos** (detalle completo en [`contracts/README.md`](./contracts/README.md)):
    *   `stellar contract build`
    *   `cargo test`

### 📦 Bindings (TypeScript)
Los clientes tipados para los 4 contratos están en [`bindings/`](./bindings). El equipo de frontend los importa como paquetes NPM locales.

### 💻 Frontend (Por definir)
La interfaz de usuario (UI/UX) está inspirada en plataformas como *Vaki* (enfoque en "hacer florecer la confianza"). El stack tecnológico (Next.js, Vite, etc.) será definido por el equipo de frontend.

---

## 🔄 CI/CD

Cada push o Pull Request a `main` dispara el workflow [**Contracts CI**](./.github/workflows/contracts-ci.yml), que verifica:

1.  ✅ Compilación exitosa de todos los contratos (`stellar contract build`).
2.  ✅ Ejecución de la suite de tests (`cargo test`).
3.  ✅ Sincronización de snapshots de pruebas (`git diff --exit-code -- '*/test_snapshots/'`).

Puedes ver el estado en tiempo real en la pestaña [**Actions**](https://github.com/ThrivingHub/thriving-stellar/actions) del repositorio, o en el badge al inicio de este documento.

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
