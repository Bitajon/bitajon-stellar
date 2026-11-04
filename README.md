# Thriving Stellar 🌱

[![Contracts CI](https://github.com/ThrivingHub/thriving-stellar/actions/workflows/contracts-ci.yml/badge.svg)](https://github.com/ThrivingHub/thriving-stellar/actions/workflows/contracts-ci.yml)
[![Conventional Commits](https://img.shields.io/badge/Conventional%20Commits-1.0.0-yellow.svg)](https://conventionalcommits.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

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

Este es un **monorepo**, lo que significa que convivirán diferentes tecnologías. Actualmente, el desarrollo se centra en la capa de contratos inteligentes.

### 📦 Contracts (Rust + Soroban)
La lógica de negocio (Escrow, Validación, Registro) vive aquí. Estamos utilizando **Rust** y el **Soroban SDK** para Stellar.
*   **Prerrequisitos:** Rust `1.84+` (estable), target `wasm32v1-none`, y Stellar CLI `30.0.1`.
*   **Comandos básicos** (detalle completo en [`contracts/README.md`](./contracts/README.md)):
    *   `stellar contract build`
    *   `cargo test`

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
